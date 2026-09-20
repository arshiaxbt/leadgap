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

export function thesisLine(
  row: Pick<GapRow, "leader" | "bias" | "symbol" | "catchup">,
): string {
  const name = perpName(row.symbol);
  switch (row.leader) {
    case "perp":
      return `The ${name} move is larger than the odds change in this window.`;
    case "flat":
      return `Odds and ${name} are in line. The residual is small.`;
    case "odds": {
      const caught =
        row.catchup != null && Number.isFinite(row.catchup)
          ? ` Mark captured ${Math.round(row.catchup * 100)}% of the implied move.`
          : "";
      if (row.bias === "long")
        return `The model indicates a positive ${name} residual.${caught}`;
      if (row.bias === "short")
        return `The model indicates a negative ${name} residual.${caught}`;
      return `The odds change is larger, but the residual does not meet the score threshold.${caught}`;
    }
    default: {
      const _never: never = row.leader;
      return _never;
    }
  }
}

export function catalystImpact(
  gap?: Pick<GapRow, "oddsMove" | "bias" | "symbol" | "leader">,
): string | null {
  if (!gap) return null;
  const name = perpName(gap.symbol);
  const pts = `${(Math.abs(gap.oddsMove) * 100).toFixed(1)} pts`;
  const odds =
    gap.oddsMove > 0.002
      ? `Yes probability rose ${pts}`
      : gap.oddsMove < -0.002
        ? `Yes probability fell ${pts}`
        : "Yes probability little changed";
  if (gap.leader === "perp")
    return `${odds}. The ${name} observed move is larger than the implied move.`;
  const bias = biasCopy(gap.bias, gap.symbol);
  if (gap.bias === "none") return `${odds}. No clear ${name} residual.`;
  return `${odds}. Residual bias: ${bias}.`;
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
      return "Compare the odds change with the observed perp move.";
    case "perp":
      return "The perpetual move is larger than the implied move.";
    case "flat":
      return "Odds and mark are in line.";
    default: {
      const _never: never = leader;
      return _never;
    }
  }
}

export function whyAsset(
  row: Pick<GapRow, "mappingReason" | "symbol" | "title">,
): string {
  const name = perpName(row.symbol);
  const reason = row.mappingReason;
  if (
    reason.startsWith("Direct map") ||
    reason.startsWith("Named ") ||
    reason.startsWith("Alias match")
  ) {
    return `Event names ${name}.`;
  }
  if (reason.includes("macro")) return `Fed/macro cluster → ${name}.`;
  if (reason.includes("oil")) return `Oil/geopolitics cluster → ${name}.`;
  if (reason.includes("crypto")) return `Crypto cluster → ${name}.`;
  if (reason.includes("semi")) return `Chips/AI cluster → ${name}.`;
  return reason;
}

export function whyNow(
  row: Pick<
    GapRow,
    "window" | "oddsMove" | "perpMove" | "symbol" | "catchup" | "leader"
  >,
): string {
  const name = perpName(row.symbol);
  const mark = `${row.perpMove >= 0 ? "+" : ""}${(row.perpMove * 100).toFixed(2)}%`;
  if (row.leader === "perp")
    return `${row.window}: ${name} already moved ${mark}. Odds are not leading.`;
  const caught =
    row.catchup != null && Number.isFinite(row.catchup)
      ? ` Mark captured ${Math.round(row.catchup * 100)}% of the implied move.`
      : "";
  return `${row.window}: Yes moved ${fmtOddsDelta(row.oddsMove)}; ${name} moved ${mark}.${caught}`;
}

export function whyDirection(
  row: Pick<
    GapRow,
    | "expected"
    | "actual"
    | "gap"
    | "bias"
    | "symbol"
    | "oddsMove"
    | "signedBeta"
  >,
): string {
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? 0;
  const action = signalAction(row.bias, row.symbol);
  if (row.bias === "none") {
    return `Expected ${(expected * 100).toFixed(2)}% vs actual ${(actual * 100).toFixed(2)}%. Gap is too small for a side.`;
  }
  return `Expected ${(expected * 100).toFixed(2)}% vs actual ${(actual * 100).toFixed(2)}% → gap ${(row.gap * 100).toFixed(2)}%. ${action}.`;
}

const CLUSTER_LABELS: Record<string, string> = {
  macro: "Fed/macro cluster",
  oil: "Oil/geopolitics cluster",
  semi: "Chips/AI cluster",
  "crypto-spot": "Crypto cluster",
  "crypto-equity": "Crypto-equity cluster",
};

function clusterId(reason: string): string | null {
  const match = /^(?:Cluster|Named \S+ in cluster) ([a-z-]+)/.exec(reason);
  return match?.[1] ?? null;
}

/** Short, plain description of how the event is tied to the perp. */
export function mappingLabel(
  row: Pick<GapRow, "mappingKind" | "mappingReason">,
): string {
  if (row.mappingKind === "named") return "Direct event link";
  const id = clusterId(row.mappingReason);
  return (id && CLUSTER_LABELS[id]) || "Related event";
}

/** One or two sentences for "Why these are linked". */
export function mappingExplanation(
  row: Pick<GapRow, "mappingKind" | "mappingReason" | "symbol" | "signedBeta">,
): string {
  const name = perpName(row.symbol);
  const link =
    row.mappingKind === "named"
      ? `Direct map — the event question names ${name}.`
      : `${mappingLabel(row)} — the event belongs to a topic the model maps to ${name}. A named or clustered relationship, not a verified economic link.`;
  const sign =
    row.signedBeta >= 0
      ? "Sensitivity is signed positive: a rising Yes probability implies a rising mark."
      : "Sensitivity is signed negative: a rising Yes probability implies a falling mark.";
  return `${link} ${sign}`;
}

export function leaderLabel(leader: GapRow["leader"]): string {
  switch (leader) {
    case "odds":
      return "Larger implied move";
    case "perp":
      return "Larger perp move";
    case "flat":
      return "In line";
    default: {
      const _never: never = leader;
      return _never;
    }
  }
}

/** Where a score sits among the live signals on the same window. */
export function scoreStanding(score: number, scores: number[]): string {
  if (scores.length < 3) return "Leadgap score";
  const below = scores.filter((s) => s < score).length / scores.length;
  if (below >= 0.9) return "Leadgap score · top decile of live signals";
  if (below >= 0.75) return "Leadgap score · top quartile of live signals";
  if (below >= 0.5) return "Leadgap score · above the live median";
  return "Leadgap score · below the live median";
}
