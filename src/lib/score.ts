/** Increment when scoring coefficients or formula change. */
export const SCORE_MODEL_VERSION = "heuristic-v2";
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

/** The multiplicative factors behind a score, each in 0–1. */
export type ScoreFactors = {
  /**
   * |gap| relative to a 4% residual, capped at 1. Threshold-market rows
   * instead measure the gap against two of the perp's typical window moves.
   */
  magnitude: number;
  /** 1 when odds led, 0.42 when in line, 0.12 when the perp led. */
  lead: number;
  /** Mapping confidence of the event → perp link. */
  confidence: number;
  /** log10(event volume) / 6, capped at 1. */
  liquidity: number;
  /** 1 for ≥0.8 pt odds moves, 0.65 for ≥0.3 pts, else 0.3. */
  movement: number;
  /** Damps implausibly large odds or implied moves. */
  sanity: number;
};

export type ScoreInputs = {
  oddsMove: number;
  perpMove: number;
  signedBeta: number;
  confidence: number;
  volume: number;
  /** The implied perp move when it is not simply oddsMove × signedBeta. */
  expected?: number;
  /** Threshold rows: the perp's typical move over the window (see sensitivity.gapScale). */
  scale?: number;
};

/** Gaps smaller than this are noise: 0.2% for mapped rows, 5% of the window's typical move for threshold rows. */
export function biasCutoff(scale?: number): number {
  return scale ? 0.05 * scale : 0.002;
}

export function scoreFactors(args: ScoreInputs): ScoreFactors & {
  expected: number;
  actual: number;
  gap: number;
  leader: GapRow["leader"];
} {
  const expected = args.expected ?? args.oddsMove * args.signedBeta;
  const actual = args.perpMove;
  const gap = expected - actual;
  const oddsAbs = Math.abs(args.oddsMove);
  const perpAbs = Math.abs(actual);
  // Compare like with like: the move the odds imply against the move the perp made.
  const impliedAbs = Math.abs(expected);
  const leader: GapRow["leader"] =
    impliedAbs > perpAbs * 1.25
      ? "odds"
      : perpAbs > impliedAbs * 1.25
        ? "perp"
        : "flat";
  return {
    expected,
    actual,
    gap,
    leader,
    magnitude: Math.min(
      1,
      Math.abs(gap) / (args.scale ? 2 * args.scale : 0.04),
    ),
    lead: leader === "odds" ? 1 : leader === "flat" ? 0.42 : 0.12,
    confidence: args.confidence,
    liquidity: Math.min(1, Math.log10(Math.max(args.volume, 10)) / 6),
    movement: oddsAbs >= 0.008 ? 1 : oddsAbs >= 0.003 ? 0.65 : 0.3,
    sanity:
      oddsAbs > 0.25 || Math.abs(expected) > 0.12
        ? 0.22
        : oddsAbs > 0.12 || Math.abs(expected) > 0.06
          ? 0.55
          : 1,
  };
}

/**
 * Leadgap Score is 0–100.
 * Magnitude of residual (odds-implied perp move minus actual mark move),
 * scaled by odds-first leadership, mapping confidence, and event liquidity.
 * Perp-first prints are down-weighted — that is not this product's edge.
 */
export function leadgapMetrics(args: ScoreInputs): LeadgapMetrics {
  const f = scoreFactors(args);
  const { expected, actual, gap, leader } = f;
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        100 *
          f.magnitude *
          f.lead *
          f.confidence *
          f.liquidity *
          f.movement *
          f.sanity,
      ),
    ),
  );

  const bias: Bias =
    leader !== "odds" || Math.abs(gap) < biasCutoff(args.scale) || score < 12
      ? "none"
      : gap > 0
        ? "long"
        : "short";

  const catchup = Math.abs(expected) < 1e-6 ? null : actual / expected;

  return { expected, actual, gap, leader, bias, catchup, score };
}

export type ScorePart = { label: string; points: number };

/** Split the published score into additive parts from the same factors. Does not change the score. */
export function scoreBreakdown(
  args: ScoreInputs & { score: number; leader: GapRow["leader"] },
): ScorePart[] {
  const expected = args.expected ?? args.oddsMove * args.signedBeta;
  const gap = expected - args.perpMove;
  const oddsAbs = Math.abs(args.oddsMove);
  const liquidity = Math.min(1, Math.log10(Math.max(args.volume, 10)) / 6);
  const magnitude = Math.min(
    1,
    Math.abs(gap) / (args.scale ? 2 * args.scale : 0.04),
  );
  const leadWeight =
    args.leader === "odds" ? 1 : args.leader === "flat" ? 0.42 : 0.12;
  const moveWeight = oddsAbs >= 0.008 ? 1 : oddsAbs >= 0.003 ? 0.65 : 0.3;

  const raw: ScorePart[] = [
    { label: "Odds movement", points: moveWeight },
    { label: "Perp lag", points: magnitude * leadWeight },
    { label: "Volume / liquidity", points: liquidity },
    { label: "Mapping confidence", points: Math.max(0, args.confidence) },
  ];
  const sum = raw.reduce((s, p) => s + p.points, 0);
  if (sum <= 0 || args.score <= 0) return raw.map((p) => ({ ...p, points: 0 }));
  const parts = raw.map((p) => ({
    label: p.label,
    points: Math.round((args.score * p.points) / sum),
  }));
  const drift = args.score - parts.reduce((s, p) => s + p.points, 0);
  if (parts[0]) parts[0].points += drift;
  return parts;
}

export function isActionable(
  row: Pick<GapRow, "bias" | "score" | "catchup">,
): boolean {
  if (row.bias === "none" || row.score < 28) return false;
  if (
    row.catchup != null &&
    Number.isFinite(row.catchup) &&
    row.catchup >= 0.85
  )
    return false;
  return true;
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

export function residualTrend(
  path: { gap: number }[],
): "expanding" | "closing" | "stable" {
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
