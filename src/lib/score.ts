import type { GapRow } from "./types";

export type Bias = "long" | "short" | "none";

export type LeadgapMetrics = {
  expected: number;
  actual: number;
  gap: number;
  leader: GapRow["leader"];
  bias: Bias;
  catchup: number | null;
  score: number;
};

/**
 * Leadgap Score is 0–100.
 * Magnitude of residual (odds-implied perp move minus actual mark move),
 * scaled by odds-first leadership, mapping confidence, and event liquidity.
 * Perp-first prints are down-weighted — that is not this product's edge.
 */
export function leadgapMetrics(args: {
  oddsMove: number;
  perpMove: number;
  signedBeta: number;
  confidence: number;
  volume: number;
}): LeadgapMetrics {
  const expected = args.oddsMove * args.signedBeta;
  const actual = args.perpMove;
  const gap = expected - actual;
  const oddsAbs = Math.abs(args.oddsMove);
  const perpAbs = Math.abs(actual);
  const leader: GapRow["leader"] =
    oddsAbs > perpAbs * 1.25 ? "odds" : perpAbs > oddsAbs * 1.25 ? "perp" : "flat";

  const liquidity = Math.min(1, Math.log10(Math.max(args.volume, 10)) / 6);
  const magnitude = Math.min(1, Math.abs(gap) / 0.04);
  const leadWeight = leader === "odds" ? 1 : leader === "flat" ? 0.42 : 0.12;
  const moveWeight = oddsAbs >= 0.008 ? 1 : oddsAbs >= 0.003 ? 0.65 : 0.3;
  const sanity =
    oddsAbs > 0.25 || Math.abs(expected) > 0.12 ? 0.22 : oddsAbs > 0.12 || Math.abs(expected) > 0.06 ? 0.55 : 1;
  const score = Math.round(
    Math.max(
      0,
      Math.min(100, 100 * magnitude * leadWeight * args.confidence * liquidity * moveWeight * sanity),
    ),
  );

  const bias: Bias =
    leader !== "odds" || Math.abs(gap) < 0.002 || score < 12 ? "none" : gap > 0 ? "long" : "short";

  const catchup = Math.abs(expected) < 1e-6 ? null : actual / expected;

  return { expected, actual, gap, leader, bias, catchup, score };
}

export type ScorePart = { label: string; points: number };

/** Split the published score into additive parts from the same factors. Does not change the score. */
export function scoreBreakdown(args: {
  oddsMove: number;
  perpMove: number;
  signedBeta: number;
  confidence: number;
  volume: number;
  score: number;
  leader: GapRow["leader"];
}): ScorePart[] {
  const expected = args.oddsMove * args.signedBeta;
  const gap = expected - args.perpMove;
  const oddsAbs = Math.abs(args.oddsMove);
  const liquidity = Math.min(1, Math.log10(Math.max(args.volume, 10)) / 6);
  const magnitude = Math.min(1, Math.abs(gap) / 0.04);
  const leadWeight = args.leader === "odds" ? 1 : args.leader === "flat" ? 0.42 : 0.12;
  const moveWeight = oddsAbs >= 0.008 ? 1 : oddsAbs >= 0.003 ? 0.65 : 0.3;

  const raw: ScorePart[] = [
    { label: "Odds movement", points: moveWeight },
    { label: "Perp lag", points: magnitude * leadWeight },
    { label: "Volume / liquidity", points: liquidity },
    { label: "Historical confidence", points: Math.max(0, args.confidence) },
  ];
  const sum = raw.reduce((s, p) => s + p.points, 0);
  if (sum <= 0 || args.score <= 0) return raw.map((p) => ({ ...p, points: 0 }));
  const parts = raw.map((p) => ({ label: p.label, points: Math.round((args.score * p.points) / sum) }));
  const drift = args.score - parts.reduce((s, p) => s + p.points, 0);
  if (parts[0]) parts[0].points += drift;
  return parts;
}

export function isActionable(row: Pick<GapRow, "bias" | "score" | "catchup">): boolean {
  if (row.bias === "none" || row.score < 28) return false;
  if (row.catchup != null && Number.isFinite(row.catchup) && row.catchup >= 0.85) return false;
  return true;
}

export function scoreTone(score: number): "lead" | "warn" | "mute" {
  if (score >= 55) return "lead";
  if (score >= 28) return "warn";
  return "mute";
}

export function scoreClass(score: number): string {
  if (score >= 55) return "text-[var(--signal)]";
  if (score >= 28) return "text-[var(--warn)]";
  return "text-[var(--dim)]";
}

export function biasCopy(bias: Bias, symbol?: string): string {
  const name = symbol ? symbol.replace("-USD", "") : "";
  switch (bias) {
    case "long":
      return name ? `Long ${name}` : "Long";
    case "short":
      return name ? `Short ${name}` : "Short";
    case "none":
      return "No edge";
    default: {
      const _never: never = bias;
      return _never;
    }
  }
}

export function catchupCopy(catchup: number | null): string {
  if (catchup == null || !Number.isFinite(catchup)) return "—";
  const pct = Math.round(catchup * 100);
  if (pct < 15) return `${pct}% caught`;
  if (pct < 85) return `${pct}% caught`;
  if (pct < 115) return "Mostly caught up";
  return "Overshot";
}

export function residualTrend(path: { gap: number }[]): "expanding" | "closing" | "stable" {
  if (path.length < 4) return "stable";
  const recent = path.slice(-6);
  const first = Math.abs(recent[0]!.gap);
  const last = Math.abs(recent[recent.length - 1]!.gap);
  if (last > first * 1.25 + 0.001) return "expanding";
  if (last < first * 0.75 - 0.001) return "closing";
  return "stable";
}

export function decisionLine(args: {
  bias: Bias;
  leader: GapRow["leader"];
  symbol: string;
  catchup: number | null;
  score: number;
}): string {
  const name = args.symbol.replace("-USD", "");
  if (args.leader === "perp") {
    return `Perp already led. ${name} moved first — this is not a Leadgap setup.`;
  }
  if (args.bias === "none" || args.score < 12) {
    return `Odds and ${name} are in line. Gap is too small to act on.`;
  }
  const caught =
    args.catchup != null && Number.isFinite(args.catchup)
      ? ` Mark captured ${Math.round(Math.max(0, Math.min(1.8, args.catchup)) * 100)}% of the implied move.`
      : "";
  if (args.bias === "long") {
    return `Odds imply LONG ${name}. Yes repriced; the mark has not fully followed.${caught}`;
  }
  return `Odds imply SHORT ${name}. Yes repriced against the mapped beta; the mark has not fully followed.${caught}`;
}
