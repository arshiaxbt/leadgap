import { cn } from "@/lib/utils";

export type TraceSeries = { implied: number[]; observed: number[] };

/** Straight-line stand-in when only the window's endpoints are known. */
export function endpointTrace(expected: number, actual: number): TraceSeries {
  return { implied: [0, expected], observed: [0, actual] };
}

type Geometry = {
  implied: string;
  observed: string;
  band: string;
  zeroY: number;
  impliedEnd: [number, number];
  observedEnd: [number, number];
};

/** Map both series onto one shared scale that always includes zero. */
export function traceGeometry(
  trace: TraceSeries,
  width: number,
  height: number,
  pad = 6,
  padX = 0,
  headroom = 0,
): Geometry | null {
  const n = Math.min(trace.implied.length, trace.observed.length);
  if (n < 2) return null;
  const implied = trace.implied.slice(0, n);
  const observed = trace.observed.slice(0, n);
  const all = [...implied, ...observed, 0].filter(Number.isFinite);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  // Optional room on the empty side of zero so the baseline is not the floor.
  if (headroom > 0) {
    const range = hi - lo || 1;
    if (lo >= 0) lo = -range * headroom;
    else if (hi <= 0) hi = range * headroom;
  }
  const span = hi - lo || 1;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const x = (i: number) => padX + (i / (n - 1)) * (width - padX * 2);
  const pts = (vals: number[]) =>
    vals.map((v, i) => [x(i), y(Number.isFinite(v) ? v : 0)] as [number, number]);
  const ip = pts(implied);
  const op = pts(observed);
  const line = (p: [number, number][]) =>
    p.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const band = `${line(ip)} ${op
    .slice()
    .reverse()
    .map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(" ")} Z`;
  return {
    implied: line(ip),
    observed: line(op),
    band,
    zeroY: y(0),
    impliedEnd: ip[n - 1]!,
    observedEnd: op[n - 1]!,
  };
}

/**
 * The signature: lime is the move the odds imply, bone is what the perp did,
 * the band between them is the gap. Dashed strokes mean only endpoints are known.
 */
export function GapTrace({
  trace,
  width = 152,
  height = 46,
  pad = 6,
  zero = true,
  dots = true,
  estimated = false,
  dim = false,
  strokeScale = 1,
  className,
}: {
  trace: TraceSeries;
  width?: number;
  height?: number;
  pad?: number;
  zero?: boolean;
  dots?: boolean;
  estimated?: boolean;
  dim?: boolean;
  strokeScale?: number;
  className?: string;
}) {
  const g = traceGeometry(trace, width, height, pad, dots ? 3 : 0);
  if (!g) return null;
  const dash = estimated ? "3 3" : undefined;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
      className={cn("block shrink-0 overflow-visible", dim && "opacity-60", className)}
      preserveAspectRatio="none"
    >
      <path d={g.band} fill="var(--band)" />
      {zero ? (
        <line
          x1="0"
          y1={g.zeroY}
          x2={width}
          y2={g.zeroY}
          stroke="var(--line-strong)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <path
        d={g.observed}
        fill="none"
        stroke="var(--mark)"
        strokeWidth={1.6 * strokeScale}
        strokeLinejoin="round"
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={g.implied}
        fill="none"
        stroke="var(--odds)"
        strokeWidth={1.8 * strokeScale}
        strokeLinejoin="round"
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
      {dots ? (
        <>
          <circle cx={g.impliedEnd[0]} cy={g.impliedEnd[1]} r="2.4" fill="var(--odds)" />
          <circle cx={g.observedEnd[0]} cy={g.observedEnd[1]} r="2.4" fill="var(--mark)" />
        </>
      ) : null}
    </svg>
  );
}

/** Row sparkline straight from a scored row; falls back to endpoints. */
export function RowTrace({
  row,
  ...rest
}: {
  row: {
    trace?: TraceSeries;
    expected: number;
    actual: number;
    oddsMove: number;
    signedBeta: number;
    perpMove: number;
  };
} & Omit<Parameters<typeof GapTrace>[0], "trace" | "estimated">) {
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? row.perpMove;
  const trace = row.trace ?? endpointTrace(expected, actual);
  return <GapTrace trace={trace} estimated={!row.trace} {...rest} />;
}
