"use client";

import { traceGeometry, type TraceSeries } from "@/components/signal/GapTrace";
import { fmtPct } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";

function tickLabel(ts: number, withDate: boolean): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return withDate ? `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}` : `${hh}:${mm}`;
}

/** The hero: implied and observed moves across the window, the band between them. */
export function ResidualChart({
  trace,
  windowMs,
  end,
  estimated = false,
  height = 300,
  label,
}: {
  trace: TraceSeries;
  windowMs: number;
  end: number;
  estimated?: boolean;
  height?: number;
  label: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const gutter = 76;
  const plotW = Math.max(0, width - gutter);
  const top = 28;
  const bottom = 40;
  const plotH = height - top - bottom;
  const g = plotW > 0 ? traceGeometry(trace, plotW, plotH, 10, 0, 0.45) : null;
  const n = Math.min(trace.implied.length, trace.observed.length);
  const impliedEnd = trace.implied[n - 1] ?? 0;
  const observedEnd = trace.observed[n - 1] ?? 0;
  const ticks = [1, 2, 3, 4, 5].map((i) => i / 6);
  let yI = g ? g.impliedEnd[1] + top : 0;
  let yO = g ? g.observedEnd[1] + top : 0;
  if (Math.abs(yI - yO) < 24) {
    const mid = (yI + yO) / 2;
    const up = impliedEnd >= observedEnd;
    yI = mid + (up ? -12 : 12);
    yO = mid + (up ? 12 : -12);
  }
  const dash = estimated ? "4 4" : undefined;
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {g ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block"
        >
          <g stroke="var(--raise)" strokeWidth="1">
            {[0.2, 0.4, 0.6, 0.8].map((f) => (
              <line key={f} x1="0" x2={plotW} y1={top + plotH * f} y2={top + plotH * f} />
            ))}
            {ticks.map((f) => (
              <line key={f} x1={plotW * f} x2={plotW * f} y1="0" y2={height - 20} />
            ))}
          </g>
          <g transform={`translate(0 ${top})`}>
            <path d={g.band} fill="var(--band)" />
            <line
              x1="0"
              x2={plotW}
              y1={g.zeroY}
              y2={g.zeroY}
              stroke="var(--zero)"
              strokeDasharray="3 4"
            />
            <text
              x="4"
              y={g.zeroY - 6}
              className="num"
              fontSize="10"
              fill="var(--dim)"
            >
              0%
            </text>
            <path
              d={g.observed}
              fill="none"
              stroke="var(--mark)"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeDasharray={dash}
            />
            <path
              d={g.implied}
              fill="none"
              stroke="var(--odds)"
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeDasharray={dash}
            />
            <line
              x1={g.impliedEnd[0]}
              x2={g.observedEnd[0]}
              y1={g.impliedEnd[1]}
              y2={g.observedEnd[1]}
              stroke="var(--odds)"
              strokeWidth="1.5"
            />
            <circle cx={g.impliedEnd[0]} cy={g.impliedEnd[1]} r="4" fill="var(--odds)" />
            <circle cx={g.observedEnd[0]} cy={g.observedEnd[1]} r="4" fill="var(--mark)" />
          </g>
          <g className="num" fontSize="11" textAnchor="middle">
            <rect x={plotW + 8} y={yI - 10} width="62" height="20" rx="4" fill="var(--odds)" />
            <text x={plotW + 39} y={yI + 4} fill="var(--on-odds)">
              {fmtPct(impliedEnd)}
            </text>
            <rect x={plotW + 8} y={yO - 10} width="62" height="20" rx="4" fill="var(--active)" />
            <text x={plotW + 39} y={yO + 4} fill="var(--mark)">
              {fmtPct(observedEnd)}
            </text>
          </g>
          <g className="num" fontSize="10" fill="var(--dim)" textAnchor="middle">
            {ticks.map((f) => (
              <text key={f} x={plotW * f} y={height - 8}>
                {tickLabel(end - windowMs * (1 - f), windowMs >= 12 * 3_600_000)}
              </text>
            ))}
          </g>
        </svg>
      ) : null}
    </div>
  );
}

/** Small single-series sparkline, e.g. Yes probability or the rolling gap. */
export function Sparkline({
  values,
  width = 320,
  height = 34,
  stroke = "var(--odds)",
  fill,
  baseline,
  dot = false,
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  baseline?: number;
  dot?: boolean;
  className?: string;
  label?: string;
}) {
  if (values.length < 2) return null;
  const all = baseline != null ? [...values, baseline] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const pad = 4;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const last = values[values.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {fill ? (
        <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={fill} />
      ) : null}
      {baseline != null ? (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="var(--line-strong)"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {dot ? <circle cx={width} cy={y(last)} r="3" fill={stroke} /> : null}
    </svg>
  );
}
