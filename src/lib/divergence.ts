import { CONFIDENCE_FLOOR, isClearMapping, mappingKindOf } from "./mapping";
import { leadgapMetrics } from "./score";
import type { GapRow, GapWindow, PerpsTicker, ResidualPoint, ResolvedEvent, Snapshot } from "./types";

export const WINDOW_MS: Record<GapWindow, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export const GAP_WINDOWS: GapWindow[] = ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"];

export function valueAt(history: Snapshot[] | undefined, ageMs: number, now: number): number | null {
  if (!history?.length) return null;
  const target = now - ageMs;
  let best: Snapshot | null = null;
  for (const snap of history) {
    if (snap.t <= target) best = snap;
    else break;
  }
  if (best) return best.v;
  const first = history[0];
  if (first && now - first.t >= ageMs * 0.5) return first.v;
  return null;
}

function move(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return (to - from) / from;
}

export function computeGaps(args: {
  events: ResolvedEvent[];
  tickers: Record<string, PerpsTicker>;
  oddsHistory: Record<string, Snapshot[]>;
  markHistory: Record<string, Snapshot[]>;
  window: GapWindow;
  now?: number;
}): GapRow[] {
  const now = args.now ?? Date.now();
  const age = WINDOW_MS[args.window];
  const rows: GapRow[] = [];

  for (const event of args.events) {
    const oddsNow = event.yesPrice;
    const oddsThen = valueAt(args.oddsHistory[event.id], age, now);
    const oddsMove = oddsThen == null ? null : oddsNow - oddsThen;

    for (const link of event.perps) {
      if (link.confidence < CONFIDENCE_FLOOR) continue;
      const ticker = args.tickers[link.symbol];
      if (!ticker) continue;
      const perpMove = move(valueAt(args.markHistory[link.symbol], age, now), ticker.markPrice);
      if (oddsMove == null || perpMove == null) continue;

      const metrics = leadgapMetrics({
        oddsMove,
        perpMove,
        signedBeta: link.signedBeta,
        confidence: link.confidence,
        volume: event.volume,
      });

      rows.push({
        eventId: event.id,
        title: event.title,
        question: event.question,
        slug: event.slug,
        symbol: link.symbol,
        window: args.window,
        oddsMove,
        perpMove,
        signedBeta: link.signedBeta,
        gap: metrics.gap,
        score: metrics.score,
        confidence: link.confidence,
        yesPrice: event.yesPrice,
        markPrice: ticker.markPrice,
        mappingReason: link.mappingReason,
        mappingKind: mappingKindOf(link),
        leader: metrics.leader,
        expected: metrics.expected,
        actual: metrics.actual,
        bias: metrics.bias,
        catchup: metrics.catchup,
        volume: event.volume,
      });
    }
  }

  return rows
    .filter((row) =>
      isClearMapping({
        mappingKind: row.mappingKind,
        mappingReason: row.mappingReason,
        title: row.title,
        question: row.question,
        symbol: row.symbol,
        confidence: row.confidence,
      }),
    )
    .sort((a, b) => b.score - a.score || Math.abs(b.gap) - Math.abs(a.gap));
}

export function eventTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/(\d+(?:\.\d+)?)k\b/g, (_, n) => String(Math.round(Number(n) * 1000)))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** One row per event+perp, then drop near-duplicate titles for the same perp. */
export function uniqueGapRows(rows: GapRow[]): GapRow[] {
  const byEventSymbol = new Map<string, GapRow>();
  for (const row of rows) {
    const key = `${row.eventId}:${row.symbol}`;
    const prev = byEventSymbol.get(key);
    if (!prev || row.score > prev.score) byEventSymbol.set(key, row);
  }
  const byTitleSymbol = new Map<string, GapRow>();
  for (const row of byEventSymbol.values()) {
    const key = `${eventTitleKey(row.title) || row.eventId}:${row.symbol}`;
    const prev = byTitleSymbol.get(key);
    if (!prev || row.score > prev.score || (row.score === prev.score && row.volume > prev.volume)) {
      byTitleSymbol.set(key, row);
    }
  }
  return [...byTitleSymbol.values()].sort((a, b) => b.score - a.score || Math.abs(b.gap) - Math.abs(a.gap));
}

export function residualPath(args: {
  odds: Snapshot[];
  marks: Snapshot[];
  signedBeta: number;
  windowMs?: number;
  now?: number;
}): ResidualPoint[] {
  const now = args.now ?? Date.now();
  const windowMs = args.windowMs ?? WINDOW_MS["15m"];
  const odds = args.odds.filter((p) => now - p.t <= 3 * 60 * 60_000);
  if (odds.length < 4) return [];
  const step = Math.max(1, Math.floor(odds.length / 48));
  const out: ResidualPoint[] = [];
  for (let i = 0; i < odds.length; i += step) {
    const o = odds[i]!;
    const oddsThen = valueAt(args.odds, windowMs, o.t);
    const markNow = valueAt(args.marks, 0, o.t);
    const markThen = valueAt(args.marks, windowMs, o.t);
    if (oddsThen == null || markNow == null || markThen == null || markThen === 0) continue;
    const expected = (o.v - oddsThen) * args.signedBeta;
    const actual = (markNow - markThen) / markThen;
    out.push({ t: o.t, expected, actual, gap: expected - actual });
  }
  const last = odds[odds.length - 1];
  if (last && out[out.length - 1]?.t !== last.t) {
    const oddsThen = valueAt(args.odds, windowMs, last.t);
    const markNow = valueAt(args.marks, 0, last.t);
    const markThen = valueAt(args.marks, windowMs, last.t);
    if (oddsThen != null && markNow != null && markThen && markThen !== 0) {
      const expected = (last.v - oddsThen) * args.signedBeta;
      const actual = (markNow - markThen) / markThen;
      out.push({ t: last.t, expected, actual, gap: expected - actual });
    }
  }
  return out;
}
