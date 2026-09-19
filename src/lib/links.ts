import type { GapRow, GapWindow } from "./types";

type SignalKey = Pick<GapRow, "eventId" | "symbol"> & { window?: GapWindow };

/** Full signal: one event, one perp, one comparison window. */
export function signalHref(row: SignalKey): string {
  const path = `/signals/${encodeURIComponent(row.eventId)}/${encodeURIComponent(row.symbol)}`;
  return row.window ? `${path}?window=${row.window}` : path;
}

/** Trade desk for the signal's perp, with the driving event preselected. */
export function deskHref(row: SignalKey): string {
  const params = new URLSearchParams({ event: row.eventId });
  if (row.window) params.set("window", row.window);
  return `/markets/${encodeURIComponent(row.symbol)}?${params}`;
}

export function eventHref(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}
