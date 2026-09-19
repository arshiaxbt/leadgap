import { cn } from "@/lib/utils";

/** Lime path leads, bone path lags. The space between the steps is the gap. */
export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      fill="none"
      aria-hidden
    >
      <path
        d="M2 17h9V7h11"
        stroke="var(--odds)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M2 21h13v-7h7"
        stroke="var(--mark)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { LogoMark as GapMark };
