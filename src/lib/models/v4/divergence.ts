// Frozen heuristic-v4 implementation for historical replay. Do not modify formulas.
import { CONFIDENCE_FLOOR, isClearMapping, mappingKindOf } from "./mapping";
import { leadgapMetrics } from "./score";
import {
  betaSourceOf,
  gapScale,
  impliedMove,
  informative,
  linkModel,
  localBeta,
  modelForRow,
} from "./sensitivity";
import type {
  GapRow,
  GapWindow,
  PerpsTicker,
  ResidualPoint,
  ResolvedEvent,
  Snapshot,
} from "../../types";

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

export const GAP_WINDOWS: GapWindow[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "12h",
  "1d",
];

export function valueAt(
  history: Snapshot[] | undefined,
  ageMs: number,
  now: number,
): number | null {
  if (!history?.length) return null;
  const target = now - ageMs;
  let best: Snapshot | null = null;
  for (const snap of history) {
    // Scheduled collection can jitter slightly around the boundary. Never
    // accept a half-window sample or a future observation for the current value.
    if (snap.t > now || snap.t > target + (ageMs ? 12_000 : 0)) break;
    if (!best || Math.abs(snap.t - target) < Math.abs(best.t - target))
      best = snap;
  }
  // Require history near the requested boundary. A half-window or arbitrarily
  // old observation cannot represent the selected comparison window.
  const tolerance =
    ageMs === 0 ? 90_000 : Math.max(30_000, Math.min(10 * 60_000, ageMs * 0.2));
  if (best && Math.abs(target - best.t) <= tolerance && Number.isFinite(best.v))
    return best.v;
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
    const latestOdds = args.oddsHistory[event.id]?.at(-1);
    if (!latestOdds || now - latestOdds.t > 90_000) continue;
    const oddsNow = event.yesPrice;
    const oddsThen = valueAt(args.oddsHistory[event.id], age, now);
    const oddsMove = oddsThen == null ? null : oddsNow - oddsThen;

    for (const link of event.perps) {
      if (link.confidence < CONFIDENCE_FLOOR) continue;
      const ticker = args.tickers[link.symbol];
      if (
        !ticker ||
        now - ticker.timestamp > 90_000 ||
        !Number.isFinite(ticker.markPrice) ||
        ticker.markPrice <= 0
      )
        continue;
      const perpMove = move(
        valueAt(args.markHistory[link.symbol], age, now),
        ticker.markPrice,
      );
      if (oddsMove == null || oddsThen == null || perpMove == null) continue;

      const model = linkModel({
        question: event.question || event.title,
        symbol: link.symbol,
        baseBeta: link.signedBeta,
        mappingKind: mappingKindOf(link),
        mark: ticker.markPrice,
        endsAt: event.endsAt,
        now,
      });
      if (model.kind === "drop") continue;
      if (!informative(model, oddsThen, oddsNow, age, now)) continue;
      const expected = impliedMove(model, oddsThen, oddsNow, now - age, now);
      // Keep row.oddsMove × row.signedBeta ≈ row.expected for every consumer.
      const signedBeta =
        Math.abs(oddsMove) >= 0.002
          ? expected / oddsMove
          : localBeta(model, oddsNow, now);
      const metrics = leadgapMetrics({
        oddsMove,
        perpMove,
        signedBeta,
        confidence: link.confidence,
        volume: event.volume,
        expected,
        scale: gapScale(link.symbol, age),
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
        signedBeta,
        betaSource: betaSourceOf(model),
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
    .replace(/(\d+(?:\.\d+)?)k\b/g, (_, n) =>
      String(Math.round(Number(n) * 1000)),
    )
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
    if (
      !prev ||
      row.score > prev.score ||
      (row.score === prev.score && row.volume > prev.volume)
    ) {
      byTitleSymbol.set(key, row);
    }
  }
  return [...byTitleSymbol.values()].sort(
    (a, b) => b.score - a.score || Math.abs(b.gap) - Math.abs(a.gap),
  );
}

/** Implied perp return between two odds observations taken at two times. */
export type ImpliedFn = (
  pThen: number,
  pNow: number,
  tThen: number,
  tNow: number,
) => number;

export function residualPath(args: {
  odds: Snapshot[];
  marks: Snapshot[];
  signedBeta: number;
  /** Overrides the linear odds × beta model, e.g. for threshold markets. */
  implied?: ImpliedFn;
  windowMs?: number;
  now?: number;
}): ResidualPoint[] {
  const implied: ImpliedFn =
    args.implied ?? ((pThen, pNow) => (pNow - pThen) * args.signedBeta);
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
    if (
      oddsThen == null ||
      markNow == null ||
      markThen == null ||
      markThen === 0
    )
      continue;
    const expected = implied(oddsThen, o.v, o.t - windowMs, o.t);
    const actual = (markNow - markThen) / markThen;
    out.push({ t: o.t, expected, actual, gap: expected - actual });
  }
  const last = odds[odds.length - 1];
  if (last && out[out.length - 1]?.t !== last.t) {
    const oddsThen = valueAt(args.odds, windowMs, last.t);
    const markNow = valueAt(args.marks, 0, last.t);
    const markThen = valueAt(args.marks, windowMs, last.t);
    if (oddsThen != null && markNow != null && markThen && markThen !== 0) {
      const expected = implied(oddsThen, last.v, last.t - windowMs, last.t);
      const actual = (markNow - markThen) / markThen;
      out.push({ t: last.t, expected, actual, gap: expected - actual });
    }
  }
  return out;
}

/** Cumulative implied vs observed move from the window start to now. */
export type GapTrace = { implied: number[]; observed: number[] };

function sortedSnapshots(history: Snapshot[] | undefined): Snapshot[] {
  if (!history?.length) return [];
  for (let i = 1; i < history.length; i++) {
    if (history[i]!.t < history[i - 1]!.t)
      return [...history].sort((a, b) => a.t - b.t);
  }
  return history;
}

/** Last observation at or before `t` in an ascending series. */
export function valueAtOrBefore(history: Snapshot[], t: number): number | null {
  let lo = 0,
    hi = history.length - 1,
    found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const snap = history[mid]!;
    if (snap.t <= t) {
      if (Number.isFinite(snap.v)) found = snap.v;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Sample the path of a signal across its comparison window. Both series start
 * at zero on the same boundary the row was scored from and end exactly on the
 * row's expected and actual moves, so the trace never disagrees with the row.
 * Returns null when the window start cannot be observed.
 */
export function gapTrace(args: {
  odds: Snapshot[] | undefined;
  marks: Snapshot[] | undefined;
  signedBeta: number;
  implied?: ImpliedFn;
  windowMs: number;
  expected: number;
  actual: number;
  now?: number;
  points?: number;
}): GapTrace | null {
  const now = args.now ?? Date.now();
  const n = Math.max(2, Math.min(240, Math.round(args.points ?? 12)));
  const odds = sortedSnapshots(args.odds);
  const marks = sortedSnapshots(args.marks);
  const oddsStart = valueAt(odds, args.windowMs, now);
  const markStart = valueAt(marks, args.windowMs, now);
  if (oddsStart == null || markStart == null || markStart === 0) return null;
  const start = now - args.windowMs;
  const implied: number[] = [];
  const observed: number[] = [];
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      implied.push(0);
      observed.push(0);
      continue;
    }
    if (i === n - 1) {
      implied.push(round(args.expected));
      observed.push(round(args.actual));
      continue;
    }
    const t = start + (i / (n - 1)) * args.windowMs;
    const o = valueAtOrBefore(odds, t) ?? oddsStart;
    const m = valueAtOrBefore(marks, t) ?? markStart;
    implied.push(
      round(
        args.implied
          ? args.implied(oddsStart, o, start, t)
          : (o - oddsStart) * args.signedBeta,
      ),
    );
    observed.push(round(m / markStart - 1));
  }
  return { implied, observed };
}

/** Attach window traces to scored rows. Rows without an observable start keep no trace. */
export function withTraces<T extends GapRow>(
  rows: T[],
  args: {
    oddsHistory: Record<string, Snapshot[]>;
    markHistory: Record<string, Snapshot[]>;
    window: GapWindow;
    /** Events the rows came from, so threshold rows trace with their own model. */
    events?: ResolvedEvent[];
    now?: number;
    points?: number;
  },
): (T & { trace?: GapTrace })[] {
  const byId = new Map((args.events ?? []).map((e) => [e.id, e]));
  return rows.map((row) => {
    const model =
      row.betaSource === "threshold"
        ? modelForRow(row, byId.get(row.eventId))
        : null;
    const trace = gapTrace({
      odds: args.oddsHistory[row.eventId],
      marks: args.markHistory[row.symbol],
      signedBeta: row.signedBeta,
      implied:
        model?.kind === "threshold"
          ? (pThen, pNow, tThen, tNow) =>
              impliedMove(model, pThen, pNow, tThen, tNow)
          : undefined,
      windowMs: WINDOW_MS[args.window],
      expected: row.expected ?? row.oddsMove * row.signedBeta,
      actual: row.actual ?? row.perpMove,
      now: args.now,
      points: args.points,
    });
    return trace ? { ...row, trace } : row;
  });
}
