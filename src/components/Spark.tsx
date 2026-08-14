"use client";

import type { Snapshot } from "@/lib/types";

export function Spark({ points, className = "" }: { points: Snapshot[]; className?: string }) {
  if (points.length < 2) {
    return <div className={`h-16 text-xs text-[#5c6478] ${className}`}>Collecting price history…</div>;
  }
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 200;
      const y = 48 - ((p.v - min) / span) * 44;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox="0 0 200 52" className={`h-16 w-full ${up ? "text-[#3ee0a8]" : "text-rose-400"} ${className}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
