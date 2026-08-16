import type { ResidualPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ResidualSpark({
  points,
  className = "",
}: {
  points: ResidualPoint[];
  className?: string;
}) {
  if (points.length < 3) {
    return <div className={cn("h-10 text-[11px] text-[var(--dim)]", className)}>Collecting residual history…</div>;
  }
  const exp = points.map((p) => p.expected);
  const act = points.map((p) => p.actual);
  const min = Math.min(...exp, ...act);
  const max = Math.max(...exp, ...act);
  const span = max - min || 1;
  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * 200;
        const y = 36 - ((v - min) / span) * 30;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg viewBox="0 0 200 40" className={cn("h-10 w-full", className)} aria-hidden>
      <path d={toPath(exp)} fill="none" stroke="var(--odds)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={toPath(act)} fill="none" stroke="var(--mark)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
