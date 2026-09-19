import type { Bias } from "@/lib/score";
import { perpName } from "@/lib/signal";
import { cn } from "@/lib/utils";

const TONE: Record<Bias, string> = {
  long: "bg-[var(--long-soft)] text-long",
  short: "bg-[var(--short-soft)] text-short",
  none: "bg-elevated text-dim",
};

export function biasLabel(bias: Bias): string {
  return bias === "long" ? "Long" : bias === "short" ? "Short" : "No edge";
}

/** Long / Short / No edge, optionally with the perp and score. */
export function DirectionChip({
  bias,
  symbol,
  score,
  size = "md",
  muted = false,
  scoreWord = false,
  className,
}: {
  bias: Bias;
  symbol?: string;
  score?: number;
  /** Spell out "score" before the number: "Long · score 70". */
  scoreWord?: boolean;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
  className?: string;
}) {
  const label = `${biasLabel(bias)}${symbol && bias !== "none" ? ` ${perpName(symbol)}` : ""}${score != null ? ` · ${scoreWord ? "score " : ""}${Math.round(score)}` : ""}`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap font-medium",
        size === "sm" && "rounded-[5px] px-2 py-[3px] text-[11px]",
        size === "md" && "rounded-[5px] px-[9px] py-1 text-[12px]",
        size === "lg" && "rounded-[5px] px-[11px] py-[5px] text-[14px] font-semibold",
        muted ? "bg-elevated text-subtle" : TONE[bias],
        className,
      )}
    >
      {label}
    </span>
  );
}
