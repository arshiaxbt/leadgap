import type { PerpsBookLevel } from "./types";
export function acceptStreamMessage(
  event: {
    timestamp: number;
    sequence: number;
    payload: { instrumentId: number };
  },
  instrumentId: number,
  previousSequence: number,
  now = Date.now(),
) {
  return (
    event.payload.instrumentId === instrumentId &&
    Number.isFinite(event.timestamp) &&
    Number.isSafeInteger(event.sequence) &&
    event.sequence > previousSequence &&
    event.timestamp <= now + 5000 &&
    now - event.timestamp <= 15_000
  );
}
/** Book messages are full snapshots, so every accepted update replaces both sides. */
export function streamLevels(
  rows: { price: string; quantity: string }[],
  side: "bids" | "asks",
): PerpsBookLevel[] {
  return rows
    .map((r) => ({ price: Number(r.price), quantity: Number(r.quantity) }))
    .filter(
      (r) =>
        Number.isFinite(r.price) &&
        r.price > 0 &&
        Number.isFinite(r.quantity) &&
        r.quantity > 0,
    )
    .sort((a, b) => (side === "bids" ? b.price - a.price : a.price - b.price));
}
