import { biasCopy, type Bias } from "./score";
import type { GapRow } from "./types";

export function perpName(symbol: string): string {
  return symbol.replace("-USD", "");
}

/** Reconstruct Yes odds at the start of the window. `oddsMove` is Yes now minus Yes then. */
export function oddsPrior(yesNow: number, oddsMove: number): number {
  if (!Number.isFinite(yesNow) || !Number.isFinite(oddsMove)) return yesNow;
  return Math.min(0.999, Math.max(0.001, yesNow - oddsMove));
}

export function thesisLine(row: Pick<GapRow, "leader" | "bias" | "symbol" | "catchup">): string {
  const name = perpName(row.symbol);
  switch (row.leader) {
    case "perp":
      return `Perp already led. ${name} moved first — this is not a Leadgap setup.`;
    case "flat":
      return `Odds and ${name} are in line. Gap is too small to act on.`;
    case "odds": {
      const caught =
        row.catchup != null && Number.isFinite(row.catchup)
          ? ` Mark captured ${Math.round(Math.max(0, Math.min(1.8, row.catchup)) * 100)}% of the implied move.`
          : "";
      if (row.bias === "long") return `Prediction market is leading ${name}.${caught}`;
      if (row.bias === "short") return `Prediction market is leading a ${name} short.${caught}`;
      return `Odds moved first on ${name}, but the residual is not yet a trade.${caught}`;
    }
    default: {
      const _never: never = row.leader;
      return _never;
    }
  }
}

export function catalystImpact(gap?: Pick<GapRow, "oddsMove" | "bias" | "symbol" | "leader">): string | null {
  if (!gap) return null;
  const name = perpName(gap.symbol);
  const odds =
    gap.oddsMove > 0.002 ? "Yes odds increased" : gap.oddsMove < -0.002 ? "Yes odds dropped" : "Odds little changed";
  if (gap.leader === "perp") return `${odds}. ${name} already moved — not a Leadgap edge.`;
  const bias = biasCopy(gap.bias, gap.symbol);
  if (gap.bias === "none") return `${odds}. No ${name} edge yet.`;
  return `${odds}. ${bias} while the mark lags.`;
}

export function confidencePct(confidence: number): string {
  if (!Number.isFinite(confidence)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}% conf`;
}

export function signalAction(bias: Bias, symbol: string): string {
  return biasCopy(bias, symbol);
}

export function chartStory(leader: GapRow["leader"]): string {
  switch (leader) {
    case "odds":
      return "Odds moved first → perp has not fully followed.";
    case "perp":
      return "Perp already led. This is not a Leadgap setup.";
    case "flat":
      return "Odds and mark are in line.";
    default: {
      const _never: never = leader;
      return _never;
    }
  }
}
