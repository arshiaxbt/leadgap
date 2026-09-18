import type { HistoryBatch } from "./research";
export type CalibrationPair = {
  t: number;
  eventId: string;
  symbol: string;
  oddsMove: number;
  perpMove: number;
  futureMove: number;
  beta: number;
};
/** Strictly historical boundary selection. No later observation can fill missing history. */
export function calibrationPairs(
  input: HistoryBatch[],
  windowMs = 15 * 60_000,
  horizonMs = 30 * 60_000,
): CalibrationPair[] {
  const batches = [...input].sort((a, b) => a.t - b.t),
    result: CalibrationPair[] = [];
  function near(target: number) {
    let lo = 0,
      hi = batches.length - 1,
      best: HistoryBatch | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (batches[mid].t <= target) {
        best = batches[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best && target - best.t <= 90_000 ? best : undefined;
  }
  for (const current of batches) {
    const before = near(current.t - windowMs),
      after = near(current.t + horizonMs);
    if (!before || !after || after.t <= current.t) continue;
    for (const [id, [oddsAt, odds, token]] of Object.entries(current.odds)) {
      const old = before.odds[id],
        future = after.odds[id];
      if (
        !old ||
        !future ||
        old[2] !== token ||
        future[2] !== token ||
        current.t - oddsAt > 90_000
      )
        continue;
      for (const [symbol, beta] of Object.entries(current.links[id] ?? {})) {
        const mark = current.marks[symbol],
          prior = before.marks[symbol],
          later = after.marks[symbol];
        if (
          !mark ||
          !prior ||
          !later ||
          before.links[id]?.[symbol] !== beta ||
          after.links[id]?.[symbol] !== beta ||
          prior[1] <= 0 ||
          mark[1] <= 0
        )
          continue;
        if (
          current.t - mark[0] > 90_000 ||
          before.t - prior[0] > 90_000 ||
          after.t - later[0] > 90_000
        )
          continue;
        result.push({
          t: current.t,
          eventId: id,
          symbol,
          oddsMove: odds - old[1],
          perpMove: mark[1] / prior[1] - 1,
          futureMove: later[1] / mark[1] - 1,
          beta,
        });
      }
    }
  }
  return result;
}
export function calibrationReport(pairs: CalibrationPair[]) {
  const times = [...new Set(pairs.map((p) => p.t))].sort((a, b) => a - b),
    split = times[Math.floor(times.length * 0.7)] ?? 0;
  // Purge a full forward horizon on both sides of the chronological split.
  const train = pairs.filter((p) => p.t < split - 30 * 60_000),
    test = pairs.filter((p) => p.t >= split + 30 * 60_000);
  const candidates: Record<string, number> = {};
  for (const symbol of new Set(train.map((p) => p.symbol))) {
    const samples = train.filter((p) => p.symbol === symbol),
      den = samples.reduce((s, p) => s + p.oddsMove ** 2, 0);
    if (samples.length >= 100 && den > 1e-8)
      candidates[symbol] =
        samples.reduce((s, p) => s + p.oddsMove * p.perpMove, 0) / den;
  }
  const mean = (v: number[]) =>
    v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  const summary = (rows: CalibrationPair[]) => ({
    samples: rows.length,
    baselineMSE: mean(rows.map((p) => (p.beta * p.oddsMove - p.perpMove) ** 2)),
    candidateMSE: mean(
      rows
        .filter((p) => Number.isFinite(candidates[p.symbol]))
        .map((p) => (candidates[p.symbol] * p.oddsMove - p.perpMove) ** 2),
    ),
    directionalHitRate: mean(
      rows.map((p) =>
        Math.sign(p.beta * p.oddsMove - p.perpMove) * p.futureMove > 0 ? 1 : 0,
      ),
    ),
    meanSignedForwardReturn: mean(
      rows.map(
        (p) => Math.sign(p.beta * p.oddsMove - p.perpMove) * p.futureMove,
      ),
    ),
  });
  return {
    schema: 1,
    generatedAt: Date.now(),
    status:
      train.length >= 500 && test.length >= 200
        ? "research-only"
        : "insufficient-data",
    split,
    train: summary(train),
    test: summary(test),
    bySymbol: Object.fromEntries(
      [...new Set(test.map((p) => p.symbol))].map((s) => [
        s,
        summary(test.filter((p) => p.symbol === s)),
      ]),
    ),
    candidateBetas: candidates,
    limitations: [
      "Overlapping observations are correlated; sample count is not independent evidence.",
      "No fees, slippage, funding or execution simulation. Returns are descriptive, not tradable profit.",
      "Survivorship and discovery coverage can bias this archive.",
      "Candidates are fitted on training observations only and never automatically promoted.",
    ],
  };
}
