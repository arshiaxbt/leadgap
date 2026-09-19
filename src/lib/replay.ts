import { compactRow } from "./snapshot-row";
import { computeGaps, uniqueGapRows, WINDOW_MS } from "./divergence";
import {
  computeGaps as v4Gaps,
  uniqueGapRows as v4Unique,
} from "./models/v4/divergence";
import { isActionable as v4Candidate } from "./models/v4/score";
import { isActionable } from "./score";
import { attachEvidence } from "./enrichment";
import { SIGNAL_POLICY } from "./signal-policy";
import { ANNUAL_VOL } from "./sensitivity";
import { WINDOWS, type HistoryBatch, type ResearchSnapshot } from "./research";
import type { PerpsTicker, ResolvedEvent, Snapshot } from "./types";

export type MappingArchive = {
  scoreVersion: string;
  events: ResolvedEvent[];
  policy?: unknown;
  annualVol?: unknown;
};
export type ReplayArchive = {
  batches: HistoryBatch[];
  mappings: Record<string, MappingArchive>;
};
export function replaySnapshot(
  current: HistoryBatch,
  history: HistoryBatch[],
  mapping: MappingArchive,
): ResearchSnapshot {
  const v5 = mapping.scoreVersion === "heuristic-v5";
  if (!v5 && mapping.scoreVersion !== "heuristic-v4")
    throw Error("Unsupported archived score version");
  if (
    v5 &&
    (JSON.stringify(mapping.policy) !== JSON.stringify(SIGNAL_POLICY) ||
      JSON.stringify(mapping.annualVol) !== JSON.stringify(ANNUAL_VOL))
  )
    throw Error("Archived v5 policy does not match this frozen implementation");
  const events = mapping.events
    .filter((e) => current.odds[e.id]?.[2] === e.yesTokenId)
    .map((e) => ({
      ...e,
      slug: e.slug ?? "",
      volume: current.volumes?.[e.id] ?? e.volume,
      yesPrice: current.odds[e.id][1],
      perps: e.perps.filter(
        (p) => current.links[e.id]?.[p.symbol] === p.signedBeta,
      ),
    }));
  const slot = Math.floor(current.t / 60000) * 60000;
  const prior = history.filter((b) => b.t < current.t);
  const boundaries = WINDOWS.flatMap((w) => {
    const target = (v5 ? current.t : slot) - WINDOW_MS[w],
      tolerance = Math.max(30000, Math.min(600000, WINDOW_MS[w] * 0.2));
    const b = prior
      .filter((b) =>
        v5
          ? Math.floor(b.t / 60000) * 60000 >= target - tolerance - 60000 &&
            b.t <= target + 12000
          : Math.floor(b.t / 60000) * 60000 <= target &&
            Math.floor(b.t / 60000) * 60000 >= target - tolerance,
      )
      .sort((a, b) =>
        v5 ? Math.abs(a.t - target) - Math.abs(b.t - target) : b.t - a.t,
      )[0];
    return b ? [b] : [];
  });
  const markHistory: Record<string, Snapshot[]> = {},
    oddsHistory: Record<string, Snapshot[]> = {};
  for (const b of [
    ...new Map([...boundaries, current].map((b) => [b.t, b])).values(),
  ].sort((a, b) => a.t - b.t)) {
    for (const [s, [t, v]] of Object.entries(b.marks))
      (markHistory[s] ??= []).push({ t, v });
    for (const [id, [t, v, token]] of Object.entries(b.odds))
      if (events.find((e) => e.id === id)?.yesTokenId === token)
        (oddsHistory[id] ??= []).push({ t, v });
  }
  const tickers = Object.fromEntries(
    Object.entries(current.marks).map(([symbol, [timestamp, markPrice]]) => [
      symbol,
      { symbol, timestamp, markPrice } as PerpsTicker,
    ]),
  ); // Only these three recorded fields enter scoring.
  const compute = v5 ? computeGaps : v4Gaps,
    unique = v5 ? uniqueGapRows : v4Unique;
  const s: ResearchSnapshot = {
    asOf: current.t,
    modelVersion: current.modelVersion,
    scoreVersion: mapping.scoreVersion,
    events,
    tickers,
    instruments: [],
    markHistory,
    oddsHistory,
    error: null,
    coverage: { startedAt: history[0]?.t ?? current.t, cadenceMs: 60000 },
    windows: Object.fromEntries(
      WINDOWS.map((window) => [
        window,
        unique(
          compute({
            events,
            tickers,
            markHistory,
            oddsHistory,
            window,
            now: current.t,
          }),
        ).map(compactRow),
      ]),
    ) as ResearchSnapshot["windows"],
  };
  if (!v5) return s;
  const recent = prior.filter((b) => b.t >= current.t - 61 * 60000);
  return attachEvidence(
    s,
    [...boundaries, ...recent, current],
    current.evidence ?? { odds: {}, perps: {} },
    current.evaluatedAt ?? current.t,
  );
}

type Observation = {
  t: number;
  symbol: string;
  version: string;
  window: string;
  gross: number | null;
  net: number | null;
  reason?: string;
};
/** Recorded quotes only, one non-overlapping 30-minute research position per asset. */
export function replayReport(archive: ReplayArchive) {
  const batches = [...archive.batches].sort((a, b) => a.t - b.t),
    observations: Observation[] = [],
    unavailable: Record<string, number> = {};
  const occupied = new Map<string, number>(),
    horizon = SIGNAL_POLICY.execution.horizonMs;
  const skip = (reason: string) =>
    (unavailable[reason] = (unavailable[reason] ?? 0) + 1);
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i],
      mapping = archive.mappings[b.modelVersion];
    if (!mapping) {
      skip("missing-mapping");
      continue;
    }
    let s: ResearchSnapshot;
    try {
      s = replaySnapshot(b, batches.slice(Math.max(0, i - 1500), i), mapping);
    } catch {
      skip("unsupported-model-or-policy");
      continue;
    }
    const entryAt = b.evaluatedAt ?? b.t;
    const candidates = Object.values(s.windows)
      .flat()
      .filter(
        mapping.scoreVersion === "heuristic-v5" ? isActionable : v4Candidate,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.eventId.localeCompare(b.eventId) ||
          WINDOW_MS[a.window] - WINDOW_MS[b.window],
      );
    for (const row of candidates) {
      if ((occupied.get(row.symbol) ?? 0) > entryAt) continue;
      occupied.set(row.symbol, entryAt + horizon);
      const exit = batches
        .slice(i + 1)
        .find((x) => (x.marks[row.symbol]?.[0] ?? 0) >= entryAt + horizon);
      const observation: Observation = {
        t: entryAt,
        symbol: row.symbol,
        window: row.window,
        version: mapping.scoreVersion,
        gross: null,
        net: null,
      };
      if (!exit || (exit.evaluatedAt ?? exit.t) - entryAt - horizon > 90000) {
        observation.reason = "missing-forward-observation";
        observations.push(observation);
        continue;
      }
      const later = exit.marks[row.symbol],
        initial = b.marks[row.symbol],
        direction = row.bias === "long" ? 1 : -1;
      if (
        initial &&
        later &&
        initial[0] <= entryAt &&
        entryAt - initial[0] <= 90000 &&
        later[0] <= exit.t &&
        exit.t - later[0] <= 90000
      )
        observation.gross = direction * (later[1] / initial[1] - 1);
      const entry = b.evidence?.perps[row.symbol],
        end = exit.evidence?.perps[row.symbol];
      if (
        !entry?.valid ||
        !end?.valid ||
        entry.takerFee == null ||
        end.takerFee == null ||
        entry.buy == null ||
        entry.sell == null ||
        end.buy == null ||
        end.sell == null ||
        entry.at > entryAt ||
        entryAt - entry.at > 90000 ||
        end.at < entryAt + horizon ||
        end.at > (exit.evaluatedAt ?? exit.t) ||
        (exit.evaluatedAt ?? exit.t) - end.at > 90000
      ) {
        observation.reason = "missing-historical-execution-inputs";
        observations.push(observation);
        continue;
      }
      // Replay the original quantity against archived bounded exit levels.
      const levels = direction === 1 ? end.levels?.bids : end.levels?.asks;
      let remaining = entry.quantity,
        value = 0;
      for (const [price, quantity] of levels ?? []) {
        const fill = Math.min(remaining, quantity);
        value += fill * price;
        remaining -= fill;
        if (remaining < 1e-12) break;
      }
      if (remaining > 1e-12) {
        observation.reason = "missing-exit-depth";
        observations.push(observation);
        continue;
      }
      const interval = entry.fundingIntervalMs,
        next = entry.nextFunding;
      if (!interval || next == null || next < entryAt) {
        observation.reason = "missing-historical-funding";
        observations.push(observation);
        continue;
      }
      let funding = 0,
        known = true;
      for (let t = next; t <= entryAt + horizon; t += interval) {
        const quote = batches
          .slice(i)
          .filter((x) => x.t <= t)
          .at(-1)?.evidence?.perps[row.symbol];
        if (
          !quote ||
          quote.at > t ||
          t - quote.at > 90000 ||
          quote.fundingRate == null ||
          quote.nextFunding !== t
        ) {
          known = false;
          break;
        }
        funding += direction * quote.fundingRate;
      }
      if (!known) {
        observation.reason = "missing-historical-funding";
        observations.push(observation);
        continue;
      }
      const entryPrice = direction === 1 ? entry.buy : entry.sell,
        exitPrice = value / entry.quantity;
      observation.net =
        direction * (exitPrice / entryPrice - 1) -
        entry.takerFee -
        (end.takerFee * exitPrice) / entryPrice -
        funding;
      observations.push(observation);
    }
  }
  const first = batches[0]?.t ?? 0,
    last = batches.at(-1)?.t ?? 0,
    split = first + (last - first) * 0.7,
    purge = 3600000;
  const mean = (v: number[]) =>
    v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  const summary = (rows: Observation[]) => ({
    positions: rows.length,
    grossObservations: rows.filter((r) => r.gross != null).length,
    netObservations: rows.filter((r) => r.net != null).length,
    meanGross: mean(rows.flatMap((r) => (r.gross == null ? [] : [r.gross]))),
    meanNet: mean(rows.flatMap((r) => (r.net == null ? [] : [r.net]))),
  });
  const train = observations.filter((r) => r.t < split - purge),
    test = observations.filter((r) => r.t >= split + purge);
  return {
    schema: 2,
    generatedAt: Date.now(),
    status:
      last - first >= 14 * 86400000 &&
      test.filter((r) => r.net != null).length >= 200
        ? "research-only"
        : "insufficient-data",
    split,
    purgeMs: purge,
    days: (last - first) / 86400000,
    train: summary(train),
    test: summary(test),
    unavailable,
    byVersion: Object.fromEntries(
      [...new Set(observations.map((r) => r.version))].map((v) => [
        v,
        summary(test.filter((r) => r.version === v)),
      ]),
    ),
    missingOutcomes: Object.fromEntries(
      [
        ...new Set(observations.flatMap((r) => (r.reason ? [r.reason] : []))),
      ].map((reason) => [
        reason,
        observations.filter((r) => r.reason === reason).length,
      ]),
    ),
    limitations: [
      "Recorded model and evidence only; missing historical inputs remain unknown.",
      "Depth estimates are research observations, not guaranteed fills.",
      "No automatic model promotion; changing coverage and selection bias limit inference.",
    ],
    observations,
  };
}
