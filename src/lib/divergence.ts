import { CONFIDENCE_FLOOR } from "./mapping";
import type { GapRow, GapWindow, PerpsTicker, ResolvedEvent, Snapshot } from "./types";

export const WINDOW_MS: Record<GapWindow, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

function valueAt(history: Snapshot[] | undefined, ageMs: number, now: number): number | null {
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

      const gap = oddsMove * link.signedBeta - perpMove;
      const liquidityScore = Math.min(1, Math.log10(Math.max(event.volume, 10)) / 6);
      const score = Math.abs(gap) * liquidityScore * link.confidence;
      const leader =
        Math.abs(oddsMove) > Math.abs(perpMove) * 1.25
          ? "odds"
          : Math.abs(perpMove) > Math.abs(oddsMove) * 1.25
            ? "perp"
            : "flat";

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
        gap,
        score,
        confidence: link.confidence,
        yesPrice: event.yesPrice,
        markPrice: ticker.markPrice,
        mappingReason: link.mappingReason,
        leader,
      });
    }
  }

  return rows.sort((a, b) => b.score - a.score);
}
