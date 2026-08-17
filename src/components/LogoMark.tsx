import { cn } from "@/lib/utils";

/**
 * Meridian mark — the periwinkle path leads, the stone path lags, and the
 * dark channel between them is the gap. The dot marks where the lead print lands.
 */
export function LogoMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} fill="none" aria-hidden>
      <rect x="1" y="1" width="62" height="62" rx="16" fill="var(--surface)" />
      <rect x="1" y="1" width="62" height="62" rx="16" stroke="var(--line-strong)" strokeWidth="1" />
      {/* lead path (periwinkle) — climbs early */}
      <path
        d="M13 41 L27 41 L27 21 L50 21"
        stroke="var(--odds)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* lag path (stone) — same shape, offset down and right = the gap */}
      <path
        d="M13 51 L37 51 L37 33 L50 33"
        stroke="var(--mark)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="21" r="3" fill="var(--odds)" />
    </svg>
  );
}

export { LogoMark as GapMark };
