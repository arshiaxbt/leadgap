import { fmtOddsDelta } from "./format";
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
  const pts = `${(Math.abs(gap.oddsMove) * 100).toFixed(1)} pts`;
  const odds =
    gap.oddsMove > 0.002
      ? `Yes probability rose ${pts}`
      : gap.oddsMove < -0.002
        ? `Yes probability fell ${pts}`
        : "Yes probability little changed";
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

export function whyAsset(row: Pick<GapRow, "mappingReason" | "symbol" | "title">): string {
  const name = perpName(row.symbol);
  const reason = row.mappingReason;
  if (reason.startsWith("Direct map") || reason.startsWith("Named ") || reason.startsWith("Alias match")) {
    return `Event names ${name}.`;
  }
  if (reason.includes("macro")) return `Fed/macro cluster → ${name}.`;
  if (reason.includes("oil")) return `Oil/geopolitics cluster → ${name}.`;
  if (reason.includes("crypto")) return `Crypto cluster → ${name}.`;
  if (reason.includes("semi")) return `Chips/AI cluster → ${name}.`;
  return reason;
}

export function whyNow(row: Pick<GapRow, "window" | "oddsMove" | "perpMove" | "symbol" | "catchup" | "leader">): string {
  const name = perpName(row.symbol);
  const mark = `${row.perpMove >= 0 ? "+" : ""}${(row.perpMove * 100).toFixed(2)}%`;
  if (row.leader === "perp") return `${row.window}: ${name} already moved ${mark}. Odds are not leading.`;
  const caught =
    row.catchup != null && Number.isFinite(row.catchup)
      ? ` Mark captured ${Math.round(Math.max(0, Math.min(1.8, row.catchup)) * 100)}% of the implied move.`
      : "";
  return `${row.window}: Yes moved ${fmtOddsDelta(row.oddsMove)}; ${name} moved ${mark}.${caught}`;
}

export function whyDirection(row: Pick<GapRow, "expected" | "actual" | "gap" | "bias" | "symbol" | "oddsMove" | "signedBeta">): string {
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? 0;
  const action = signalAction(row.bias, row.symbol);
  if (row.bias === "none") {
    return `Expected ${(expected * 100).toFixed(2)}% vs actual ${(actual * 100).toFixed(2)}%. Gap is too small for a side.`;
  }
  return `Expected ${(expected * 100).toFixed(2)}% vs actual ${(actual * 100).toFixed(2)}% → gap ${(row.gap * 100).toFixed(2)}%. ${action}.`;
}
