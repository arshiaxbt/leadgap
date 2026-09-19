import { ASSET_MAP, nameStrength } from "./mapping";
import { thresholdTerms, type Threshold } from "./sensitivity";
import type { GammaMarket, GammaSearchEvent } from "./gamma";
import { parseEndsAt, parseTokenIds, parseYesPrice } from "./gamma";

export type Eligibility =
  { eligible: true; terms: Threshold } | { eligible: false; reason: string };
const NON_PRICE =
  /\b(search(?:ed|es)?|say|mention|release|launch|merger|acqui(?:re|sition)|earnings|revenue|score|exam|benchmark|market cap|valuation|fdv|reserves|inventor(?:y|ies)|volume|tvl|supply|holders|dominance|funding|hashrate|buybacks?|inflows?|outflows?|etf|subscribers|users|deliveries|raised|airdrop)\b/i;
const RELATIVE =
  /\b(outperform|performance|versus|vs\.?|beats?|flips?|overtakes?|best|worst)\b/i;

/** The selected question must name its own underlying; parent titles are not evidence. */
export function priceEligibility(
  question: string,
  symbol: string,
  mark: number | undefined,
  endsAt: number | null | undefined,
): Eligibility {
  if (NON_PRICE.test(question))
    return { eligible: false, reason: "non-price-event" };
  if (RELATIVE.test(question))
    return { eligible: false, reason: "relative-performance" };
  if (!nameStrength(question, symbol))
    return { eligible: false, reason: "underlying-not-in-question" };
  if (
    ASSET_MAP.some(
      (a) => a.symbol !== symbol && nameStrength(question, a.symbol) > 0,
    )
  )
    return { eligible: false, reason: "multiple-underlyings" };
  if (!(mark && Number.isFinite(mark) && mark > 0))
    return { eligible: false, reason: "missing-mark" };
  if (endsAt == null || !Number.isFinite(endsAt))
    return { eligible: false, reason: "missing-expiry" };
  const terms = thresholdTerms(question, mark, symbol);
  if (!terms || typeof terms === "string")
    return {
      eligible: false,
      reason: typeof terms === "string" ? terms : "unsupported-price-condition",
    };
  return { eligible: true, terms };
}

/** Stable choice among eligible child markets, never merely the parent's busiest market. */
export function eligibleMarket(
  event: GammaSearchEvent,
  symbols: string[],
  marks: Record<string, number>,
  now: number,
): GammaMarket | null {
  return (
    (event.markets ?? [])
      .filter((m) => {
        const p = parseYesPrice(m),
          end = parseEndsAt(m, event),
          tokens = parseTokenIds(m);
        return (
          event.closed !== true &&
          m.closed !== true &&
          m.active !== false &&
          p != null &&
          p > 0.02 &&
          p < 0.98 &&
          Number(m.volume) >= 500 &&
          Number.isFinite(Number(m.volume)) &&
          tokens.yes &&
          tokens.no &&
          end != null &&
          end > now &&
          symbols.some(
            (symbol) =>
              priceEligibility(m.question ?? "", symbol, marks[symbol], end)
                .eligible,
          )
        );
      })
      .sort(
        (a, b) =>
          Number(b.volume) - Number(a.volume) ||
          String(a.id ?? parseTokenIds(a).yes).localeCompare(
            String(b.id ?? parseTokenIds(b).yes),
          ),
      )[0] ?? null
  );
}
