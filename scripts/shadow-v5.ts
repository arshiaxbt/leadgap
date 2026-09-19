import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { database } from "./lib/sqlite";
import { collect } from "../workers/data/ingest";
import { readMeta, writeMeta } from "../workers/data/db";
import { decodeStoredSnapshot } from "../src/lib/snapshot-storage";
import { replaySnapshot, type MappingArchive } from "../src/lib/replay";
import { priceEligibility } from "../src/lib/eligibility";
import { isActionable } from "../src/lib/score";
import { MAP_REVISION } from "../src/lib/mapping";
import type { HistoryBatch, ResearchSnapshot } from "../src/lib/research";

async function main() {
  const hours = Number(process.argv[2] ?? 24);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 48)
    throw Error("Choose up to 48 hours");
  const origin = process.env.DATA_SERVICE_URL,
    secret = process.env.DATA_SERVICE_SECRET;
  if (!origin || !secret) throw Error("Data service read credentials required");
  const startedAt = Date.now(),
    end = startedAt + hours * 3600000;
  const directory = `artifacts/shadow-v5/${new Date(startedAt).toISOString().replaceAll(":", "-")}`;
  await mkdir(directory, { recursive: true });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const meta = {
    pid: process.pid,
    startedAt,
    expectedEnd: end,
    directory,
    revision,
    productionWrites: false,
  };
  await writeFile(`${directory}/run.json`, JSON.stringify(meta, null, 2));
  await writeFile(
    "artifacts/shadow-v5/active-monitor.json",
    JSON.stringify(meta, null, 2),
  );
  const { db, close } = database(`${directory}/shadow.sqlite`);
  const env = { DB: db, DATA_SERVICE_SECRET: "local-shadow-only" };
  const read = async (path: string) => {
    const response = await fetch(new URL(path, origin), {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`Shadow seed read ${response.status}`);
    return response.json();
  };
  const source: ResearchSnapshot = decodeStoredSnapshot(
    await read("/snapshot/raw?encoding=stored"),
  );
  await writeMeta(db, "latest", source);
  await writeMeta(db, "instrumentsAt", source.asOf);
  await writeMeta(db, "catalog", {
    revision: MAP_REVISION,
    cursor: 0,
    events: Object.fromEntries(
      source.events.map((event) => [event.id, { seen: startedAt, event }]),
    ),
  });
  const from = startedAt - 25 * 3600000,
    to = Math.floor(startedAt / 60000) * 60000 - 1;
  let cursor: number | null = from;
  while (cursor !== null) {
    const page = await read(
      `/history?from=${from}&to=${to}&cursor=${cursor}&limit=100`,
    );
    await db.batch(
      (page.batches as HistoryBatch[]).map((b) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO snapshots(t,model,payload) VALUES(?,?,?)",
          )
          .bind(
            Math.floor(b.t / 60000) * 60000,
            b.modelVersion,
            JSON.stringify(b),
          ),
      ),
    );
    if (page.nextCursor !== null && page.nextCursor <= cursor)
      throw Error("Seed cursor did not advance");
    cursor = page.nextCursor;
    await sleep(300);
  }
  console.log("Shadow monitor:", directory);
  const samples: {
    t: number;
    ok: boolean;
    durationMs: number;
    error?: string;
    rows?: number;
    candidates?: number;
    unknownTiming?: number;
    unknownCosts?: number;
    invariantFailures?: number;
    replayMismatches?: number;
    archiveBytes?: number;
    mappingBytes?: number;
  }[] = [];
  let lastModel = "";
  try {
    while (true) {
      const t = Date.now();
      let sample: (typeof samples)[number] = { t, ok: false, durationMs: 0 };
      try {
        await collect(env, t, { evaluateAlerts: false });
        const snapshot = (await readMeta<ResearchSnapshot>(db, "latest"))!;
        const raw = await db
          .prepare("SELECT payload FROM snapshots WHERE t=?")
          .bind(Math.floor(t / 60000) * 60000)
          .first<{ payload: string }>();
        if (
          !raw ||
          snapshot.scoreVersion !== "heuristic-v5" ||
          Date.now() - snapshot.asOf > 90000
        )
          throw Error("Missing fresh v5 observation");
        const current = JSON.parse(raw.payload) as HistoryBatch;
        const mappingRaw = (await db
          .prepare("SELECT payload FROM mappings WHERE id=?")
          .bind(snapshot.modelVersion)
          .first<{ payload: string }>())!;
        const history = await db
          .prepare(
            "SELECT payload FROM snapshots WHERE t<? AND t>=? ORDER BY t",
          )
          .bind(Math.floor(t / 60000) * 60000, t - 25 * 3600000)
          .all<{ payload: string }>();
        const replay = replaySnapshot(
          current,
          history.results.map((r) => JSON.parse(r.payload)),
          JSON.parse(mappingRaw.payload) as MappingArchive,
        );
        const rows = Object.values(snapshot.windows).flat(),
          replayed = Object.values(replay.windows).flat();
        let mismatches = rows.length === replayed.length ? 0 : 1,
          failures = 0;
        for (const row of rows) {
          const event = snapshot.events.find((e) => e.id === row.eventId)!;
          if (
            !priceEligibility(
              row.question,
              row.symbol,
              row.markPrice,
              event.endsAt,
            ).eligible
          )
            failures++;
          if (
            isActionable(row) &&
            (!row.timing || !row.execution || row.execution.totalCost == null)
          )
            failures++;
          const r = replayed.find(
            (r) =>
              r.eventId === row.eventId &&
              r.symbol === row.symbol &&
              r.window === row.window,
          );
          if (
            !r ||
            r.score !== row.score ||
            Math.abs(r.gap - row.gap) > 1e-6 ||
            r.timing?.status !== row.timing?.status ||
            r.execution?.status !== row.execution?.status ||
            isActionable(r) !== isActionable(row)
          )
            mismatches++;
        }
        sample = {
          ...sample,
          ok: !snapshot.error && mismatches === 0 && failures === 0,
          rows: rows.length,
          candidates: rows.filter(isActionable).length,
          unknownTiming: rows.filter((r) => r.timing?.status === "unknown")
            .length,
          unknownCosts: rows.filter((r) => r.execution?.status === "unknown")
            .length,
          invariantFailures: failures,
          replayMismatches: mismatches,
          archiveBytes: Buffer.byteLength(raw.payload),
          mappingBytes:
            snapshot.modelVersion === lastModel
              ? 0
              : Buffer.byteLength(mappingRaw.payload),
        };
        lastModel = snapshot.modelVersion;
      } catch (e) {
        sample.error = e instanceof Error ? e.message : "shadow-failed";
      }
      sample.durationMs = Date.now() - t;
      samples.push(sample);
      await appendFile(
        `${directory}/samples.jsonl`,
        JSON.stringify(sample) + "\n",
      );
      const duration = Date.now() - startedAt,
        fraction = samples.filter((s) => s.ok).length / samples.length;
      const averageBytes =
        samples.reduce((sum, s) => sum + (s.archiveBytes ?? 0), 0) /
        samples.length;
      const mappingPerDay =
        samples.reduce((sum, s) => sum + (s.mappingBytes ?? 0), 0) /
        Math.max(1, duration / 86400000);
      // 7 days minute data, 23 days five-minute data; plus mapping churn and 25% SQLite overhead.
      const projectedBytes =
        (averageBytes * (7 * 1440 + 23 * 288) + mappingPerDay * 30) * 1.25;
      const maxGap = Math.max(
        0,
        ...samples.slice(1).map((s, i) => s.t - samples[i].t),
      );
      const complete = Date.now() >= end;
      const pass =
        complete &&
        duration >= 24 * 3600000 &&
        fraction >= 0.99 &&
        maxGap < 180000 &&
        projectedBytes <= 350000000 &&
        samples.every(
          (s) =>
            (s.invariantFailures ?? 0) === 0 && (s.replayMismatches ?? 0) === 0,
        );
      await writeFile(
        `${directory}/report.json`,
        JSON.stringify(
          {
            phase: complete ? "complete" : "running",
            pass,
            startedAt,
            expectedEnd: end,
            durationMs: duration,
            samples: samples.length,
            healthyFraction: fraction,
            maxGapMs: maxGap,
            projectedStorageBytes: Math.round(projectedBytes),
            invariantFailures: samples.reduce(
              (n, s) => n + (s.invariantFailures ?? 0),
              0,
            ),
            replayMismatches: samples.reduce(
              (n, s) => n + (s.replayMismatches ?? 0),
              0,
            ),
            productionActivated: false,
            remainingGate:
              "Provider CPU P99 < 8ms and usage review, then production activation and a fresh 72-hour soak.",
          },
          null,
          2,
        ),
      );
      console.log(
        new Date(t).toISOString(),
        sample.ok ? "healthy" : "review",
        sample.rows ?? 0,
        sample.error ?? "",
      );
      if (complete) {
        if (!pass) process.exitCode = 1;
        break;
      }
      await sleep(
        Math.max(
          1000,
          Math.min(60000 - (Date.now() % 60000) + 2000, end - Date.now()),
        ),
      );
    }
  } finally {
    close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Shadow failed");
  process.exitCode = 1;
});
