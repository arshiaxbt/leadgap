import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fetchTickers } from "../src/lib/perps";
import type { ResearchSnapshot } from "../src/lib/research";

/**
 * Does a Polymarket event's odds actually move before its mapped perp?
 *
 * The collector samples once a minute, and at that resolution the liquid
 * markets correlate strongly at lag zero — odds and perp appear to move
 * together, so `timing` never reports "odds-leads" and nothing qualifies as a
 * candidate. That is consistent with two very different worlds: either the
 * lead is shorter than a minute, or there is no lead. Minute bars cannot tell
 * them apart, so this samples every few seconds and measures the same
 * cross-correlation at sub-minute lags, then re-measures the identical series
 * aggregated to 60s so the two resolutions can be compared directly.
 *
 * Public endpoints only, no writes anywhere: it reads the published snapshot
 * for the pairs worth watching, then polls public books and tickers.
 */

const CADENCE_MS = 5_000;
const MAX_LAG_STEPS = 12; // ±60s at 5s cadence.
/**
 * Scanning 25 lags will always turn up a high correlation on a short, mostly
 * flat series, so a pair only counts once it has enough real movement to
 * correlate: ten minutes of samples and thirty odds changes. Without this a
 * two-minute run "finds" a lead on a market whose odds moved four times.
 */
const MIN_SAMPLES = 120;
const MIN_MOVES = 30;
/** Pearson correlation, or null when either series is flat. */
function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 12) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]!; sb += b[i]!; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma, y = b[i]! - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da <= 0 || db <= 0 ? null : num / Math.sqrt(da * db);
}

type Sample = { t: number; odds: number; mark: number };
type Pair = { eventId: string; symbol: string; token: string; question: string };

/** Best lag by correlation, with the margin over simultaneous movement. */
function scan(samples: Sample[], stepMs: number, maxSteps: number) {
  const byStep = new Map<number, Sample>();
  for (const s of samples) byStep.set(Math.round(s.t / stepMs), s);
  const steps = [...byStep.keys()].sort((x, y) => x - y);
  const odds = new Map<number, number>(), mark = new Map<number, number>();
  for (const step of steps) {
    const prev = byStep.get(step - 1), now = byStep.get(step);
    if (!prev || !now || prev.mark <= 0) continue;
    odds.set(step, now.odds - prev.odds);
    mark.set(step, now.mark / prev.mark - 1);
  }
  const pairs = odds.size;
  const flat = [...odds.values()].filter((d) => d === 0).length;
  const moves = pairs - flat;
  const lags: { lag: number; r: number; n: number }[] = [];
  for (let lag = -maxSteps; lag <= maxSteps; lag++) {
    const x: number[] = [], y: number[] = [];
    for (const [step, d] of odds) {
      const other = mark.get(step + lag);
      if (other != null) { x.push(d); y.push(other); }
    }
    const r = correlation(x, y);
    if (r != null) lags.push({ lag, r, n: x.length });
  }
  const best = [...lags].sort((p, q) => q.r - p.r || Math.abs(p.lag) - Math.abs(q.lag))[0];
  const zero = lags.find((l) => l.lag === 0)?.r ?? null;
  return {
    pairs,
    moves,
    flatShare: pairs ? flat / pairs : 1,
    reliable: pairs >= MIN_SAMPLES && moves >= MIN_MOVES,
    bestLagMs: best ? best.lag * stepMs : null,
    bestR: best?.r ?? null,
    simultaneousR: zero,
    marginOverSimultaneous: best && zero != null ? best.r - zero : null,
  };
}

async function main() {
  const minutes = Number(process.argv[2] ?? 30);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240)
    throw Error("Choose 1 to 240 minutes");
  const origin = process.env.DATA_SERVICE_URL, secret = process.env.DATA_SERVICE_SECRET;
  if (!origin || !secret) throw Error("Data service read credentials required");

  const startedAt = Date.now();
  const directory = `artifacts/lead-lag/${new Date(startedAt).toISOString().replaceAll(":", "-")}`;
  await mkdir(directory, { recursive: true });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const snapshot = (await fetch(new URL("/snapshot", origin), {
    headers: { authorization: `Bearer ${secret}`, "user-agent": "leadgap-lead-lag-probe" },
  }).then((r) => r.json())) as ResearchSnapshot & { evidence?: { odds?: Record<string, { bid: number; ask: number }> } };

  // Watch the pairs that can actually answer the question: a mapped perp whose
  // event has a live book. A flat market cannot show a lead either way.
  const quotes = snapshot.evidence?.odds ?? {};
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const row of snapshot.windows["1h"] ?? []) {
    const event = snapshot.events.find((e) => e.id === row.eventId);
    const key = `${row.eventId}:${row.symbol}`;
    if (!event?.yesTokenId || seen.has(key) || !quotes[row.eventId]) continue;
    seen.add(key);
    pairs.push({ eventId: row.eventId, symbol: row.symbol, token: event.yesTokenId, question: event.question || event.title });
  }
  if (!pairs.length) throw Error("No mapped pair currently has an odds book to watch");

  await writeFile(`${directory}/pairs.json`, JSON.stringify({ startedAt, revision, cadenceMs: CADENCE_MS, minutes, pairs }, null, 2));
  console.log(`watching ${pairs.length} pairs every ${CADENCE_MS / 1000}s for ${minutes} min → ${directory}`);

  const series = new Map<string, Sample[]>(pairs.map((p) => [`${p.eventId}:${p.symbol}`, []]));
  const end = startedAt + minutes * 60_000;
  let polls = 0, failures = 0;

  while (Date.now() < end) {
    const at = Date.now();
    try {
      const [books, tickers] = await Promise.all([
        fetch("https://clob.polymarket.com/books", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pairs.map((p) => ({ token_id: p.token }))),
        }).then((r) => r.json()) as Promise<{ asset_id: string; bids: { price: string }[]; asks: { price: string }[] }[]>,
        fetchTickers(),
      ]);
      const marks = new Map(tickers.map((t) => [t.symbol, t.markPrice]));
      for (const p of pairs) {
        const book = books.find((b) => b.asset_id === p.token);
        const bid = Math.max(...(book?.bids ?? []).map((l) => Number(l.price)));
        const ask = Math.min(...(book?.asks ?? []).map((l) => Number(l.price)));
        const mark = marks.get(p.symbol);
        if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask >= 1 || bid >= ask) continue;
        if (!Number.isFinite(mark) || !mark || mark <= 0) continue;
        const sample: Sample = { t: at, odds: (bid + ask) / 2, mark };
        series.get(`${p.eventId}:${p.symbol}`)!.push(sample);
        await appendFile(`${directory}/samples.jsonl`, `${JSON.stringify({ ...sample, eventId: p.eventId, symbol: p.symbol })}\n`);
      }
      polls++;
    } catch {
      failures++;
    }
    await sleep(Math.max(0, CADENCE_MS - (Date.now() - at)));
  }

  const results = pairs.map((p) => {
    const samples = series.get(`${p.eventId}:${p.symbol}`) ?? [];
    return {
      ...p,
      samples: samples.length,
      subMinute: scan(samples, CADENCE_MS, MAX_LAG_STEPS),
      // The same data the collector would see, for a like-for-like comparison.
      perMinute: scan(samples, 60_000, 5),
    };
  });
  const usable = results.filter((r) => r.subMinute.reliable);
  const leads = usable.filter(
    (r) =>
      r.subMinute.bestLagMs != null &&
      r.subMinute.bestLagMs > 0 &&
      (r.subMinute.bestR ?? 0) >= 0.4 &&
      (r.subMinute.marginOverSimultaneous ?? 0) >= 0.1,
  );
  const report = {
    startedAt, finishedAt: Date.now(), revision, cadenceMs: CADENCE_MS, minutes,
    polls, failures, pairs: results,
    reliablePairs: usable.length,
    oddsLeadAtSubMinute: leads.map((l) => ({ symbol: l.symbol, lagMs: l.subMinute.bestLagMs, r: l.subMinute.bestR })),
    verdict: !usable.length
      ? `inconclusive: no pair reached ${MIN_SAMPLES} samples with ${MIN_MOVES} odds changes`
      : leads.length
        ? `odds lead the perp below one minute on ${leads.length} of ${usable.length} pairs with enough movement`
        : `no sub-minute lead on any of the ${usable.length} pairs with enough movement; odds and perp move together`,
  };
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));

  console.log(`\n${"symbol".padEnd(11)} ${"samples".padStart(7)} ${"moves".padStart(5)} ${"use?".padStart(4)} ${"bestLag".padStart(7)} ${"bestR".padStart(6)} ${"r@0".padStart(6)} ${"margin".padStart(6)}  question`);
  for (const r of results) {
    const s = r.subMinute;
    console.log(
      `${r.symbol.padEnd(11)} ${String(r.samples).padStart(7)} ${String(s.moves).padStart(5)} ${(s.reliable ? "yes" : "no").padStart(4)} ${(s.bestLagMs == null ? "-" : `${s.bestLagMs / 1000}s`).padStart(7)} ${(s.bestR?.toFixed(2) ?? "-").padStart(6)} ${(s.simultaneousR?.toFixed(2) ?? "-").padStart(6)} ${(s.marginOverSimultaneous?.toFixed(2) ?? "-").padStart(6)}  ${r.question.slice(0, 40)}`,
    );
  }
  console.log(`\npolls ${polls} (failures ${failures})`);
  console.log(`verdict: ${report.verdict}`);
  console.log(`report: ${directory}/report.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
