import { SIGNAL_POLICY } from "./signal-policy";
import { impliedMove, type LinkModel } from "./sensitivity";
import type { HistoryBatch } from "./research";
import type { PerpsBook, PerpsInstrument, PerpsTicker } from "./types";

export type TimingEvidence = {
  status: "odds-leads" | "perp-leads" | "simultaneous" | "unknown";
  reason?: string;
  lagMinutes: number | null;
  correlation: number | null;
  samples: number;
  coverage: number;
};
export type OddsQuote = { at: number; bid: number; ask: number };
export type ExecutionEvidence = {
  status: "pass" | "fail" | "unknown";
  reasons: string[];
  at: number;
  notional: 100;
  horizonMs: 1800000;
  spreadCost?: number;
  slippageCost?: number;
  feeCost?: number;
  fundingCost?: number;
  totalCost?: number;
  depthSufficient?: boolean;
};
export type PerpQuality = {
  levels?: { bids: [number, number][]; asks: [number, number][] };
  at: number;
  bid: number;
  ask: number;
  buy: number | null;
  sell: number | null;
  quantity: number;
  notional: number;
  takerFee: number | null;
  fundingRate: number | null;
  fundingIntervalMs: number | null;
  nextFunding: number | null;
  valid: boolean;
  reason?: string;
};
export type QuoteEvidence = {
  odds: Record<string, OddsQuote>;
  perps: Record<string, PerpQuality>;
};
const finite = (x: number) => Number.isFinite(x);

function correlation(a: number[], b: number[]): number | null {
  const n = a.length,
    ma = a.reduce((s, x) => s + x, 0) / n,
    mb = b.reduce((s, x) => s + x, 0) / n;
  let aa = 0,
    bb = 0,
    ab = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma,
      y = b[i] - mb;
    aa += x * x;
    bb += y * y;
    ab += x * y;
  }
  return aa > 1e-18 && bb > 1e-18 ? ab / Math.sqrt(aa * bb) : null;
}

/** Positive lag pairs odds at minute i with a later perpetual return at i+lag. */
export function timingEvidence(
  batches: HistoryBatch[],
  eventId: string,
  symbol: string,
  token: string,
  model: Exclude<LinkModel, { kind: "drop" }>,
  windowMs: number,
  now: number,
): TimingEvidence {
  const policy = SIGNAL_POLICY.timing,
    minutes = Math.min(policy.maxMinutes, Math.floor(windowMs / 60000));
  const unknown = (
    reason: string,
    samples = 0,
    coverage = 0,
  ): TimingEvidence => ({
    status: "unknown",
    reason,
    lagMinutes: null,
    correlation: null,
    samples,
    coverage,
  });
  if (minutes < policy.minPairs) return unknown("insufficient-history");
  const bySlot = new Map<number, HistoryBatch>();
  for (const b of batches)
    if (b.t <= now && b.t >= now - (minutes + 1) * 60000)
      bySlot.set(Math.floor(b.t / 60000), b);
  const returns = new Map<number, [number, number]>(),
    end = Math.floor(now / 60000);
  const valid = (b: HistoryBatch | undefined): b is HistoryBatch => {
    const o = b?.odds[eventId],
      m = b?.marks[symbol];
    return !!(
      b &&
      o &&
      m &&
      o[2] === token &&
      finite(o[1]) &&
      o[1] >= 0.05 &&
      o[1] <= 0.95 &&
      finite(m[1]) &&
      m[1] > 0 &&
      o[0] <= b.t &&
      m[0] <= b.t &&
      b.t - o[0] <= 90000 &&
      b.t - m[0] <= 90000
    );
  };
  for (let slot = end - minutes + 1; slot <= end; slot++) {
    const a = bySlot.get(slot - 1),
      b = bySlot.get(slot);
    if (!valid(a) || !valid(b) || b.t - a.t > 90000 || b.t <= a.t) continue;
    returns.set(slot, [
      impliedMove(
        model,
        a.odds[eventId][1],
        b.odds[eventId][1],
        a.odds[eventId][0],
        b.odds[eventId][0],
      ),
      b.marks[symbol][1] / a.marks[symbol][1] - 1,
    ]);
  }
  const coverage = returns.size / minutes;
  if (returns.size < policy.minPairs || coverage < policy.coverage)
    return unknown("insufficient-coverage", returns.size, coverage);
  const lags: { lag: number; r: number; n: number }[] = [];
  for (let lag = -policy.maxLag; lag <= policy.maxLag; lag++) {
    const a: number[] = [],
      b: number[] = [];
    for (const [slot, pair] of returns) {
      const other = returns.get(slot + lag);
      if (other) {
        a.push(pair[0]);
        b.push(other[1]);
      }
    }
    const r = a.length >= policy.minPairs ? correlation(a, b) : null;
    if (r != null) lags.push({ lag, r, n: a.length });
  }
  const best = lags.sort(
    (a, b) => b.r - a.r || Math.abs(a.lag) - Math.abs(b.lag),
  )[0];
  if (!best || best.r < policy.correlation)
    return unknown("weak-or-flat-series", returns.size, coverage);
  const zero = lags.find((l) => l.lag === 0)?.r ?? -1;
  const opposite = Math.max(
    -1,
    ...lags.filter((l) => l.lag * best.lag < 0).map((l) => l.r),
  );
  if (
    best.lag !== 0 &&
    best.r - zero >= policy.margin &&
    best.r - opposite >= policy.margin
  )
    return {
      status: best.lag > 0 ? "odds-leads" : "perp-leads",
      lagMinutes: best.lag,
      correlation: best.r,
      samples: best.n,
      coverage,
    };
  if (zero >= policy.correlation && best.r - zero < policy.margin)
    return {
      status: "simultaneous",
      lagMinutes: 0,
      correlation: zero,
      samples: returns.size,
      coverage,
    };
  return unknown("conflicting-timing", returns.size, coverage);
}

export function summarizeBook(
  book: PerpsBook,
  instrument: PerpsInstrument,
  ticker: PerpsTicker,
  takerFee: number | null,
  now: number,
): PerpQuality {
  const p = SIGNAL_POLICY.execution,
    raw = [...book.bids, ...book.asks];
  const valid =
    raw.every(
      (l) =>
        finite(l.price) && l.price > 0 && finite(l.quantity) && l.quantity > 0,
    ) &&
    book.timestamp <= now &&
    now - book.timestamp <= p.maxAgeMs &&
    ticker.timestamp <= now &&
    now - ticker.timestamp <= p.maxAgeMs;
  const bids = [...book.bids].sort((a, b) => b.price - a.price),
    asks = [...book.asks].sort((a, b) => a.price - b.price);
  const bid = bids[0]?.price ?? 0,
    ask = asks[0]?.price ?? 0,
    mid = (bid + ask) / 2;
  const factor = 10 ** instrument.quantityDecimals;
  const quantity =
    mid > 0 ? Math.floor((p.notional / mid) * factor) / factor : 0;
  const walk = (levels: PerpsBook["bids"]) => {
    let left = quantity,
      cost = 0;
    for (const l of levels) {
      const q = Math.min(left, l.quantity);
      cost += q * l.price;
      left -= q;
      if (left < 1e-12) break;
    }
    return quantity > 0 && left < 1e-12 ? cost / quantity : null;
  };
  const interval = /^(\d+(?:\.\d+)?)([hms])$/.exec(instrument.fundingInterval);
  const fundingIntervalMs = interval
    ? Number(interval[1]) * { h: 3600000, m: 60000, s: 1000 }[interval[2]]!
    : null;
  const okay =
    valid &&
    bid > 0 &&
    ask > bid &&
    quantity > 0 &&
    quantity * mid >= Number(instrument.minNotional);
  const compact = (levels: PerpsBook["bids"]) => {
    let depth = 0;
    return levels
      .filter((l) => {
        if (depth >= quantity * 2) return false;
        depth += l.quantity;
        return true;
      })
      .slice(0, 8)
      .map((l) => [l.price, l.quantity] as [number, number]);
  };
  return {
    levels: { bids: compact(bids), asks: compact(asks) },
    at: book.timestamp,
    bid,
    ask,
    buy: okay ? walk(asks) : null,
    sell: okay ? walk(bids) : null,
    quantity,
    notional: quantity * mid,
    takerFee:
      finite(takerFee!) && takerFee != null && takerFee >= 0 ? takerFee : null,
    fundingRate: finite(ticker.fundingRate) ? ticker.fundingRate : null,
    fundingIntervalMs,
    nextFunding: finite(ticker.nextFunding) ? ticker.nextFunding : null,
    valid: okay,
    reason: okay ? undefined : "invalid-stale-or-below-minimum-book",
  };
}

export function executionEvidence(
  quote: PerpQuality | undefined,
  current: OddsQuote | undefined,
  prior: OddsQuote | undefined,
  oddsMove: number,
  bias: "long" | "short" | "none",
  now: number,
): ExecutionEvidence {
  const p = SIGNAL_POLICY.execution;
  const result: ExecutionEvidence = {
    status: "unknown",
    reasons: [],
    at: quote?.at ?? 0,
    notional: 100,
    horizonMs: 1800000,
  };
  if (!quote || !current || !prior)
    return { ...result, reasons: ["missing-quote-history"] };
  if (!quote.valid || quote.at > now || now - quote.at > p.maxAgeMs)
    return { ...result, reasons: ["invalid-or-stale-book"] };
  if (current.at > now || now - current.at > p.maxAgeMs)
    return { ...result, reasons: ["stale-odds-book"] };
  if (
    [current, prior].some(
      (q) =>
        ![q.bid, q.ask, q.at].every(finite) ||
        q.bid <= 0 ||
        q.ask >= 1 ||
        q.bid >= q.ask,
    )
  )
    return { ...result, status: "fail", reasons: ["invalid-odds-book"] };
  if ([current, prior].some((q) => q.ask - q.bid > p.maxOddsSpread + 1e-12))
    return { ...result, status: "fail", reasons: ["wide-odds-spread"] };
  if (
    Math.abs(oddsMove) <=
    (current.ask - current.bid + (prior.ask - prior.bid)) / 2
  )
    return { ...result, status: "fail", reasons: ["movement-within-spread"] };
  if (quote.buy == null || quote.sell == null)
    return {
      ...result,
      status: "fail",
      depthSufficient: false,
      reasons: ["insufficient-depth"],
    };
  if (
    quote.takerFee == null ||
    quote.fundingRate == null ||
    !quote.fundingIntervalMs ||
    quote.nextFunding == null ||
    quote.nextFunding < now
  )
    return { ...result, reasons: ["unknown-fees-or-funding"] };
  if (bias === "none")
    return { ...result, status: "fail", reasons: ["no-direction"] };
  const mid = (quote.bid + quote.ask) / 2;
  result.spreadCost = (quote.ask - quote.bid) / mid;
  result.slippageCost = Math.max(
    0,
    (quote.buy - quote.ask + quote.bid - quote.sell) / mid,
  );
  result.feeCost = 2 * quote.takerFee;
  const settlements =
    quote.nextFunding > now + p.horizonMs
      ? 0
      : 1 +
        Math.floor(
          (now + p.horizonMs - quote.nextFunding) / quote.fundingIntervalMs,
        );
  result.fundingCost =
    Math.max(0, (bias === "long" ? 1 : -1) * quote.fundingRate) * settlements;
  result.totalCost =
    result.spreadCost +
    result.slippageCost +
    result.feeCost +
    result.fundingCost;
  return { ...result, status: "pass", depthSufficient: true };
}
