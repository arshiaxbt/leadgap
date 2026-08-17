import { fmtOdds, fmtOddsDelta, signedClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OddsFigure({
  yes,
  delta,
  size = "md",
  className,
}: {
  yes: number;
  delta?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const yesSize = size === "sm" ? "text-[13px]" : "text-[16px]";
  const deltaSize = size === "sm" ? "text-[11px]" : "text-[12px]";
  const label =
    delta == null ? `Yes ${fmtOdds(yes)}` : `Yes ${fmtOdds(yes)}, ${fmtOddsDelta(delta)}`;

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)} aria-label={label}>
      <span className={cn("num font-semibold text-[var(--odds)]", yesSize)}>{fmtOdds(yes)}</span>
      {delta == null ? null : (
        <span className={cn("num", deltaSize, signedClass(delta))}>{fmtOddsDelta(delta)}</span>
      )}
    </span>
  );
}
