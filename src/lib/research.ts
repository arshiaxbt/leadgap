import type {
  GapRow,
  GapWindow,
  PerpsInstrument,
  PerpsTicker,
  ResolvedEvent,
  Snapshot,
} from "./types";
export const WINDOWS: GapWindow[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "12h",
  "1d",
];
export type ResearchSnapshot = {
  asOf: number;
  modelVersion: string;
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  events: ResolvedEvent[];
  markHistory: Record<string, Snapshot[]>;
  oddsHistory: Record<string, Snapshot[]>;
  windows: Record<GapWindow, GapRow[]>;
  error: string | null;
  coverage: { startedAt: number; cadenceMs: number };
};
export type HistoryBatch = {
  t: number;
  modelVersion: string;
  links: Record<string, Record<string, number>>;
  volumes?: Record<string, number>;
  marks: Record<string, [number, number]>;
  odds: Record<string, [number, number, string]>;
};
export type WatchItem = {
  id: string;
  symbol: string;
  eventId: string;
  label: string;
  window: GapWindow;
  filter: "all" | "actionable" | "odds";
};
export type AlertRule = {
  id: string;
  symbol: string;
  eventId: string;
  window: GapWindow;
  minScore: number;
  minGap: number;
  muted: boolean;
};
export type Notice = {
  id: string;
  ruleId: string;
  title: string;
  symbol: string;
  eventId: string;
  createdAt: number;
  read: boolean;
};
export type AlertState = { matched: boolean; lastFired: number };
export function evaluateAlert(
  rule: AlertRule,
  previous: AlertState,
  row: GapRow | undefined,
  now: number,
  asOf: number,
): { state: AlertState; fire: boolean } {
  // Missing/stale data must not re-arm a rule or manufacture a new crossing.
  if (rule.muted || !row || now - asOf > 90_000)
    return { state: previous, fire: false };
  const matched =
    row.score >= rule.minScore && Math.abs(row.gap) >= rule.minGap;
  const fire =
    matched &&
    !previous.matched &&
    (!previous.lastFired || now - previous.lastFired >= 30 * 60_000);
  return {
    state: { matched, lastFired: fire ? now : previous.lastFired },
    fire,
  };
}
export function validRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== "object") return false;
  const r = value as AlertRule;
  return (
    typeof r.id === "string" &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(r.id) &&
    typeof r.symbol === "string" &&
    /^[A-Z0-9._-]{1,40}$/.test(r.symbol) &&
    typeof r.eventId === "string" &&
    /^\d{1,80}$/.test(r.eventId) &&
    WINDOWS.includes(r.window) &&
    Number.isFinite(r.minScore) &&
    r.minScore >= 0 &&
    r.minScore <= 100 &&
    Number.isFinite(r.minGap) &&
    r.minGap >= 0 &&
    r.minGap <= 1 &&
    typeof r.muted === "boolean"
  );
}
export function validWatch(value: unknown): value is WatchItem {
  if (!value || typeof value !== "object") return false;
  const v = value as WatchItem;
  return (
    validRule({ ...v, minScore: 0, minGap: 0, muted: false }) &&
    typeof v.label === "string" &&
    v.label.length <= 240 &&
    ["all", "actionable", "odds"].includes(v.filter)
  );
}

/** Recheck every response, including cached reads, against each source's timestamp. */
export function freshResearchSnapshot(
  snapshot: ResearchSnapshot,
  now = Date.now(),
): ResearchSnapshot {
  const stale = now - snapshot.asOf > 90_000;
  return {
    ...snapshot,
    error: stale ? "Data collection is delayed." : snapshot.error,
    windows: Object.fromEntries(
      WINDOWS.map((window) => [
        window,
        stale
          ? []
          : snapshot.windows[window].filter((row) => {
              const ticker = snapshot.tickers[row.symbol],
                odds = snapshot.oddsHistory[row.eventId]?.at(-1);
              return (
                ticker &&
                odds &&
                now - ticker.timestamp <= 90_000 &&
                now - odds.t <= 90_000
              );
            }),
      ]),
    ) as ResearchSnapshot["windows"],
  };
}
