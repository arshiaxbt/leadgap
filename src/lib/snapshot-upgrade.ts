import { computeGaps, uniqueGapRows } from "./divergence";
import { attachEvidence } from "./enrichment";
import { priceEligibility } from "./eligibility";
import { WINDOWS, type ResearchSnapshot } from "./research";
import { SCORE_MODEL_VERSION } from "./score";

/** Read-only compatibility during rollout. Archived v4 observations stay intact. */
export function currentSnapshot(source: ResearchSnapshot): ResearchSnapshot {
  if (source.scoreVersion === SCORE_MODEL_VERSION) return source;
  const now = Math.max(source.asOf, ...Object.values(source.tickers).map(t =>
    Number.isFinite(t.timestamp) && t.timestamp <= Date.now() && t.timestamp-source.asOf <= 5000 ? t.timestamp : source.asOf));
  const events = source.events
    .map((event) => ({
      ...event,
      perps: event.perps.filter(
        (p) =>
          priceEligibility(
            event.question,
            p.symbol,
            source.tickers[p.symbol]?.markPrice,
            event.endsAt,
          ).eligible,
      ),
    }))
    .filter((e) => e.perps.length);
  const snapshot: ResearchSnapshot = {
    ...source,
    asOf: now,
    events,
    scoreVersion: SCORE_MODEL_VERSION,
    modelVersion: `preview-v5:${source.modelVersion}`,
    windows: Object.fromEntries(
      WINDOWS.map((window) => [
        window,
        uniqueGapRows(
          computeGaps({
            events,
            tickers: source.tickers,
            markHistory: source.markHistory,
            oddsHistory: source.oddsHistory,
            window,
            now,
          }),
        ),
      ]),
    ) as ResearchSnapshot["windows"],
  };
  return attachEvidence(snapshot, [], { odds: {}, perps: {} });
}
