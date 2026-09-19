import { nameStrength } from "./mapping";
import type { GapRow, GapWindow, MappingKind, ResolvedEvent } from "./types";

/**
 * How much an event's Yes probability says about its perp.
 *
 * Price-threshold markets ("above $X on <date>", "reach $X by <date>") are
 * options on the perp's own price, so the move they imply follows from the
 * strike being fixed: for a digital, ln S = ln K + σ√τ·Φ⁻¹(p). Everything
 * else is assumed to be worth about one day's typical move of the perp if it
 * resolves Yes rather than No (see eventImpact), with the mapping's sign,
 * corrected when the question is bearish for the perp.
 */

const YEAR_MS = 365.25 * 24 * 3600_000;
const MIN_TAU_MS = 5 * 60_000;
/** Markets this close to resolving move on settlement mechanics, not news. */
export const RESOLVING_MS = 15 * 60_000;

/** Days of typical movement a non-threshold event is assumed to be worth. */
export const EVENT_IMPACT_DAYS = 1;

/** Typical annualised volatility. Assumptions, not live estimates. */
export const ANNUAL_VOL: Record<string, number> = {
  "BTC-USD": 0.5,
  "ETH-USD": 0.65,
  "SOL-USD": 0.8,
  "XRP-USD": 0.8,
  "HYPE-USD": 1.0,
  "ZEC-USD": 1.1,
  "PUMP-USD": 1.2,
  "LIT-USD": 1.1,
  "KPEPE-USD": 1.2,
  "SP500-USD": 0.17,
  "NAS100-USD": 0.22,
  "GOLD-USD": 0.16,
  "SILVER-USD": 0.3,
  "WTIOIL-USD": 0.35,
  "DRAM-USD": 0.5,
  "AAPL-USD": 0.28,
  "MSFT-USD": 0.26,
  "GOOG-USD": 0.3,
  "AMZN-USD": 0.32,
  "META-USD": 0.38,
  "NVDA-USD": 0.5,
  "TSLA-USD": 0.6,
  "AMD-USD": 0.55,
  "INTC-USD": 0.5,
  "AVGO-USD": 0.45,
  "QCOM-USD": 0.4,
  "ARM-USD": 0.6,
  "TSM-USD": 0.4,
  "ASML-USD": 0.45,
  "MU-USD": 0.55,
  "SNDK-USD": 0.6,
  "SKHY-USD": 0.5,
  "SKHYNIX-USD": 0.5,
  "SPCX-USD": 0.5,
  "HOOD-USD": 0.8,
  "MSTR-USD": 0.8,
  "STRC-USD": 0.12,
  "CRCL-USD": 0.9,
  "COIN-USD": 0.75,
};
const DEFAULT_VOL = 0.6;

export function annualVol(symbol: string): number {
  return ANNUAL_VOL[symbol] ?? DEFAULT_VOL;
}

/** The perp's typical move over a window, the unit threshold gaps are scored in. */
export function gapScale(symbol: string, windowMs: number): number {
  const move = annualVol(symbol) * Math.sqrt(windowMs / YEAR_MS);
  return Math.min(0.04, Math.max(0.003, move));
}

/** Standard normal density. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Inverse standard normal CDF (Acklam), accurate to ~1e-9 on (0, 1). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - low) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

export type Threshold = {
  /** digital: settles on the price at a time. touch: any time before expiry. */
  kind: "digital" | "touch";
  /** Direction of the affirmative condition, before complementing Yes. */
  direction: 1 | -1;
  strike: number;
  /** Yes is the complement of the affirmative threshold condition. */
  complemented?: true;
};

const UP = "above|over|higher than|greater than|at least|exceed(?:s|ing)?|reach(?:es)?|hit(?:s)?|tops?|surpass(?:es)?|break(?:s)? above|climb(?:s)? to|rise(?:s)? to";
const DOWN = "below|under|lower than|less than|dip(?:s)? (?:to|below)|fall(?:s)? (?:to|below)|drop(?:s)? (?:to|below)|crash(?:es)? (?:to|below)|sink(?:s)? (?:to|below)|plunge(?:s)? (?:to|below)";
const PRICE = String.raw`\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|bn|thousand|million|billion)?\b`;
// A word ("above", "hit", "dip to") or a comparison sign ("close at <$6,000"),
// optionally followed by Polymarket's "(HIGH)"/"(LOW)" tag, then the strike.
const THRESHOLD = new RegExp(
  `(?:\\b(${UP}|${DOWN})\\s+|([<>≤≥])=?\\s*)(?:\\((?:high|low)\\)\\s+)?(?:of\\s+|the\\s+)?${PRICE}`,
  "i",
);
const TOUCH_VERB = /^(reach|hit|top|surpass|break|climb|rise|dip|fall|drop|crash|sink|plunge)/i;
const BY_PERIOD = /\b(by|before|in (?:20\d\d|january|february|march|april|may|june|july|august|september|october|november|december)|during|this (?:week|month|quarter|year)|any ?time|at any (?:time|point)|ever)\b/i;
const NOT_PRICE = /\b(market cap|mcap|fdv|valuation|revenue|earnings|eps|deliver(?:y|ies)|inflows?|outflows?|volume|tvl|supply|holders?|subscribers?|users?|price target|dominance|funding rate|hashrate|etf|reserves|inventor(?:y|ies)|stockpiles?|buybacks?)\b/i;
const RANGE = new RegExp(`\\bbetween\\s+${PRICE}\\s+and\\s+${PRICE}|\\$?\\d[\\d,.]*\\s*[kmb]?\\s*[-–]\\s*\\$?\\d[\\d,.]*\\s*[kmb]?\\b`, "i");

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

/** Perps quoted per 1000 tokens. */
const PER_THOUSAND = new Set(["KPEPE-USD"]);

/**
 * Detect a price-threshold question about the perp's own price. Returns
 * "range" for bucket markets (no single strike, so no clean implied move),
 * or null when the question is not a price threshold on this perp.
 */
export function thresholdTerms(
  question: string,
  mark: number | undefined,
  symbol: string,
): Threshold | "range" | "ambiguous" | null {
  const q = question.replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  if (/\bup or down\b/i.test(q)) {
    if (NEGATION.test(q)) return "ambiguous";
    return mark && mark > 0
      ? { kind: "digital", direction: 1, strike: mark }
      : null;
  }
  if (NOT_PRICE.test(q)) return null;
  const match = THRESHOLD.exec(q);
  if (!match) {
    if (NEGATION.test(q) && /\$\s*\d|\bprice\b/i.test(q)) return "ambiguous";
    return RANGE.test(q) && /\$|\bprice\b/i.test(q) ? "range" : null;
  }
  if (/\bbetween\b/i.test(q)) return "range";
  // Only a single price condition has a well-defined complement. Reject
  // unsupported scope rather than silently falling back to a generic beta.
  if (/\b(and|or|unless|if|while|provided|either)\b/i.test(q) ||
      THRESHOLD.test(q.slice(match.index + match[0].length))) return "ambiguous";
  const before = q.slice(0, match.index);
  const negative = /\b(?:not|never|won't|doesn't|isn't|will not|does not|is not|fail(?:s)? to)\s+(?:be\s+)?$/i.exec(before);
  const remainder = negative
    ? before.slice(0, negative.index) + q.slice(match.index)
    : q;
  if (NEGATION.test(remainder) || /\bfail(?:s|ed)?\b/i.test(remainder)) return "ambiguous";
  const verb = (match[1] ?? match[2]!).toLowerCase();
  const raw = Number(match[3]!.replace(/,/g, ""));
  const unit = match[4] ? (SCALE[match[4].toLowerCase()] ?? 1) : 1;
  let strike = raw * unit;
  if (PER_THOUSAND.has(symbol)) strike *= 1000;
  if (!(strike > 0) || !(mark && mark > 0)) return null;
  const ratio = strike / mark;
  // A strike far from the mark is some other quantity (market cap, index points of another asset…).
  if (ratio <= 0.25 || ratio >= 4) return null;
  const down = /^[<≤]$/.test(verb) || new RegExp(`^(?:${DOWN})$`, "i").test(verb);
  const lowMarker = /\((?:low)\)/i.test(q);
  const highMarker = /\((?:high)\)/i.test(q);
  const direction: 1 | -1 = lowMarker ? -1 : highMarker ? 1 : down ? -1 : 1;
  const touch =
    TOUCH_VERB.test(verb) ||
    lowMarker ||
    highMarker ||
    (BY_PERIOD.test(q) && !/\bon (?:[a-z]+ \d{1,2}|\d{1,2} [a-z]+)\b/i.test(q));
  if (lowMarker && highMarker) return "ambiguous";
  return { kind: touch ? "touch" : "digital", direction, strike, ...(negative ? { complemented: true as const } : {}) };
}

const HAVENS = new Set(["GOLD-USD", "SILVER-USD"]);
const MACRO_DATA = /\b(cpi|inflation|unemployment|jobless|payrolls?|nfp|gdp|pce|ppi|retail sales)\b/i;
const NEGATION = /\b(no|not|avoid|avert|without|never|won't|doesn't|isn't)\b/i;
const HOLD = /\b(no change|pause|hold|unchanged|skip)\b/i;
// Plural "reserves" only: "Federal Reserve" and "Bitcoin Reserve" questions stay signable.
const QUANTITY = /\b(reserves|inventor(?:y|ies)|stockpiles?)\b/i;
const HIKE = /\b(hike|hikes|raise rates|rate increase)\b/i;
const DOWNTURN = /\b(recession|crash|collapse|default|bankrupt(?:cy)?|downturn|bear market|depression)\b/i;
const IDIOSYNCRATIC = /\b(margin call(?:ed)?|delist(?:ed|ing)?|charged|indicted|arrested|banned|ban|sued|hacked|exploit(?:ed)?|liquidat(?:ed|ion)|insolven(?:t|cy)|halt(?:ed)?|sell(?:s)? (?:its |their )?(?:bitcoin|btc)|lower (?:guidance|forecast))\b/i;
const BEARISH_PRICE = /\b(dip|dips|fall|falls|drop|drops|plunge|plunges|sink|sinks)\b|\((?:low)\)/i;

/**
 * Sign of the relationship implied by the question's wording. -1 when Yes is
 * bad news for this perp, +1 when it is not, null when the wording is too
 * ambiguous to sign (negations, holds, macro data prints).
 */
export function eventDirection(question: string, symbol: string): 1 | -1 | null {
  const q = question.replace(/\s+/g, " ");
  const outperform = /^(.*?)\b(outperforms?|beats?|flips?|overtakes?)\b(.*)$/i.exec(q);
  if (outperform) {
    const [, before = "", , after = ""] = outperform;
    if (nameStrength(after, symbol) > 0 && nameStrength(before, symbol) === 0)
      return -1;
    if (nameStrength(before, symbol) > 0) return 1;
  }
  if (NEGATION.test(q) || HOLD.test(q)) return null;
  // Data prints and quantities (inventories, reserves): "fall" is not the perp's price falling.
  if (MACRO_DATA.test(q) || QUANTITY.test(q)) return null;
  if (IDIOSYNCRATIC.test(q)) return -1;
  if (HIKE.test(q)) return -1;
  if (DOWNTURN.test(q)) return HAVENS.has(symbol) ? 1 : -1;
  if (BEARISH_PRICE.test(q)) return -1;
  return 1;
}

export type LinkModel =
  | {
      kind: "threshold";
      terms: Threshold;
      sigma: number;
      endsAt: number;
      /** Direction of the mapping itself (normally +1). */
      sign: 1 | -1;
    }
  | { kind: "linear"; beta: number; source: "direction" | "mapping" }
  | { kind: "drop" };

/** Decide how an event moves a linked perp. */
export function linkModel(args: {
  question: string;
  symbol: string;
  baseBeta: number;
  mappingKind: MappingKind;
  mark: number | undefined;
  endsAt: number | null | undefined;
  now: number;
}): LinkModel {
  const terms = thresholdTerms(args.question, args.mark, args.symbol);
  if (terms === "range" || terms === "ambiguous") return { kind: "drop" };
  const sign: 1 | -1 = args.baseBeta < 0 ? -1 : 1;
  if (terms) {
    // Without an expiry the strike's sensitivity is unknown; wait for it.
    if (args.endsAt == null || !Number.isFinite(args.endsAt)) return { kind: "drop" };
    if (args.endsAt - args.now < RESOLVING_MS) return { kind: "drop" };
    return {
      kind: "threshold",
      terms,
      sigma: annualVol(args.symbol),
      endsAt: args.endsAt,
      sign,
    };
  }
  const direction = eventDirection(args.question, args.symbol);
  const beta = args.baseBeta * eventImpact(args.symbol);
  if (direction == null)
    return args.mappingKind === "cluster"
      ? { kind: "drop" }
      : { kind: "linear", beta, source: "mapping" };
  return direction < 0
    ? { kind: "linear", beta: -beta, source: "direction" }
    : { kind: "linear", beta, source: "mapping" };
}

/**
 * The return a non-threshold event is assumed to be worth: resolving Yes
 * instead of No moves the perp by about one day's typical move
 * (σ·√(days/year)). An assumption about size, not an estimate: the mapping
 * says which way, not how far, and a flat β = 1 read a 10-point odds move
 * as a 10% move in oil.
 */
export function eventImpact(symbol: string): number {
  return annualVol(symbol) * Math.sqrt((EVENT_IMPACT_DAYS * 86_400_000) / YEAR_MS);
}

/** Linear sensitivity for a link when no scored row is available (charts, fallbacks). */
export function mappedBeta(link: { symbol: string; signedBeta: number }): number {
  return link.signedBeta * eventImpact(link.symbol);
}

const clampP = (p: number) => Math.min(0.99, Math.max(0.01, p));

/** Odds this close to 0 or 1 are mostly tick noise for a threshold market. */
export const TAIL_P = 0.05;

/**
 * Whether a threshold market can price a move over this window. Near 0 or 1
 * the inverse normal turns a one-tick wobble into a large move, and when the
 * market resolves within the window, time decay rather than price dominates.
 * Such rows are left out rather than scored.
 */
export function informative(
  model: Exclude<LinkModel, { kind: "drop" }>,
  pThen: number,
  pNow: number,
  windowMs: number,
  now: number,
): boolean {
  if (model.kind !== "threshold") return true;
  if (model.endsAt - now < windowMs) return false;
  return [pThen, pNow].every((p) => p >= TAIL_P && p <= 1 - TAIL_P);
}

/**
 * The perp return the odds imply between two observations. Threshold markets
 * use the exact strike-fixed form, including time decay, so odds drifting
 * toward 0 or 1 as expiry nears are not read as price moves.
 */
export function impliedMove(
  model: Exclude<LinkModel, { kind: "drop" }>,
  pThen: number,
  pNow: number,
  tThen: number,
  tNow: number,
): number {
  if (model.kind === "linear") return (pNow - pThen) * model.beta;
  const tau0 = Math.max(MIN_TAU_MS, model.endsAt - tThen) / YEAR_MS;
  const tau1 = Math.max(MIN_TAU_MS, model.endsAt - tNow) / YEAR_MS;
  const p0 = clampP(model.terms.complemented ? 1 - pThen : pThen);
  const p1 = clampP(model.terms.complemented ? 1 - pNow : pNow);
  const s = model.sigma;
  const logMove =
    model.terms.kind === "digital"
      ? s * (Math.sqrt(tau1) * normInv(p1) - Math.sqrt(tau0) * normInv(p0))
      : s *
        (Math.sqrt(tau0) * normInv(1 - p0 / 2) -
          Math.sqrt(tau1) * normInv(1 - p1 / 2));
  return (Math.exp(model.terms.direction * model.sign * logMove) - 1);
}

/** Local sensitivity (return per unit of probability) at the current odds. */
export function localBeta(
  model: Exclude<LinkModel, { kind: "drop" }>,
  p: number,
  t: number,
): number {
  if (model.kind === "linear") return model.beta;
  const h = 0.001;
  const lo = clampP(p - h);
  const hi = clampP(p + h);
  // Log-return slope is symmetric under p ↔ 1-p, unlike a finite simple return.
  return Math.log1p(impliedMove(model, lo, hi, t, t)) / (hi - lo);
}

export type BetaSource = NonNullable<GapRow["betaSource"]>;

export function betaSourceOf(model: Exclude<LinkModel, { kind: "drop" }>): BetaSource {
  return model.kind === "threshold" ? "threshold" : model.source;
}

/**
 * Rebuild the model for a scored row on the client (charts, history). Uses
 * the row's own mark so it agrees with how the row was scored.
 */
export function modelForRow(
  row: Pick<GapRow, "symbol" | "signedBeta" | "betaSource" | "markPrice" | "mappingKind">,
  event: Pick<ResolvedEvent, "question" | "title" | "endsAt" | "perps"> | undefined,
): Exclude<LinkModel, { kind: "drop" }> {
  if (row.betaSource === "threshold" && event) {
    const base = event.perps.find((p) => p.symbol === row.symbol)?.signedBeta ?? 1;
    const model = linkModel({
      question: event.question || event.title,
      symbol: row.symbol,
      baseBeta: base,
      mappingKind: row.mappingKind,
      mark: row.markPrice,
      endsAt: event.endsAt,
      now: Date.now(),
    });
    if (model.kind === "threshold") return model;
    if (model.kind === "linear") return model;
  }
  return {
    kind: "linear",
    beta: row.signedBeta,
    source: row.betaSource === "direction" ? "direction" : "mapping",
  };
}

/** Scale used to score a row's gap: the perp's typical move over the window (4% for rows scored before v2). */
export function rowScale(
  row: Pick<GapRow, "symbol" | "window" | "betaSource">,
  windowMs: Record<GapWindow, number>,
): number | undefined {
  return row.betaSource
    ? gapScale(row.symbol, windowMs[row.window])
    : undefined;
}

/** Plain-language description of where a row's sensitivity comes from. */
export function betaExplanation(
  row: Pick<GapRow, "signedBeta" | "betaSource" | "symbol">,
  endsAt: number | null | undefined,
  now: number,
): string | null {
  if (row.betaSource === "threshold") {
    const days = endsAt ? Math.max(0, (endsAt - now) / 86_400_000) : null;
    const vol = Math.round(annualVol(row.symbol) * 100);
    return `Derived from the strike${days != null ? `, ${days < 1 ? `${Math.max(1, Math.round(days * 24))}h` : `${days.toFixed(1)} days`} to expiry` : ""} and an assumed ~${vol}% annual volatility: a Yes move maps to the price move that would explain it.`;
  }
  if (!row.betaSource) return null;
  const size = `Assumes Yes instead of No would move ${row.symbol.replace("-USD", "")} about one day’s typical move (~${(eventImpact(row.symbol) * 100).toFixed(1)}%, from an assumed ~${Math.round(annualVol(row.symbol) * 100)}% annual volatility). The size is an assumption; the mapping only sets the direction.`;
  return row.betaSource === "direction"
    ? `The question is bearish for this perp, so a rising Yes implies a falling mark. ${size}`
    : size;
}
