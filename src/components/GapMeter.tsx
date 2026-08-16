import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Ice = expected, stone = actual, the band between them is the gap. */
export function GapMeter({
  expected,
  actual,
  dense = false,
  className,
}: {
  expected: number;
  actual: number;
  dense?: boolean;
  className?: string;
}) {
  const residual = expected - actual;
  const lo = Math.min(expected, actual, 0);
  const hi = Math.max(expected, actual, 0);
  const pad = (hi - lo) * 0.12 || 0.01;
  const min = lo - pad;
  const max = hi + pad;
  const span = max - min || 1;
  const pos = (value: number) => ((value - min) / span) * 100;
  const expectedPct = pos(expected);
  const actualPct = pos(actual);
  const zeroPct = pos(0);
  const bandLeft = Math.min(expectedPct, actualPct);
  const bandWidth = Math.abs(expectedPct - actualPct);

  return (
    <div
      className={cn(dense ? "w-16" : "w-full", className)}
      role="img"
      aria-label={`Expected ${fmtPct(expected)}, actual ${fmtPct(actual)}, gap ${fmtPct(residual)}`}
    >
      <div className={cn("relative overflow-hidden bg-[var(--elevated)]", dense ? "h-1.5" : "h-2.5")}>
        <div
          className="absolute inset-y-0 bg-[color-mix(in_srgb,var(--odds)_16%,transparent)]"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-[color-mix(in_srgb,var(--text)_22%,transparent)]"
          style={{ left: `${zeroPct}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--odds)]"
          style={{ left: `calc(${expectedPct}% - 1px)` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--mark)]"
          style={{ left: `calc(${actualPct}% - 1px)` }}
        />
      </div>
      {dense ? null : (
        <div className="mt-2 flex items-center justify-between font-mono text-[11px] tabular-nums">
          <span className="text-[var(--mark)]">Actual {fmtPct(actual)}</span>
          <span className="text-[var(--odds)]">Gap {fmtPct(residual)}</span>
          <span className="text-[var(--dim)]">Expected {fmtPct(expected)}</span>
        </div>
      )}
    </div>
  );
}
