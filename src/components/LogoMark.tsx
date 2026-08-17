import { cn } from "@/lib/utils";

/** Ice path leads; stone path lags. The empty band is the gap. */
export function LogoMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} fill="none" aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--bg)" />
      <rect
        x="1.25"
        y="1.25"
        width="61.5"
        height="61.5"
        rx="12.75"
        stroke="var(--line)"
        strokeWidth="1.5"
      />
      <rect x="10.5" y="36.5" width="21" height="7" fill="var(--odds)" />
      <rect x="24.5" y="16.5" width="7" height="27" fill="var(--odds)" />
      <rect x="24.5" y="16.5" width="29" height="7" fill="var(--odds)" />
      <rect x="10.5" y="46.5" width="31" height="7" fill="var(--mark)" />
      <rect x="34.5" y="28.5" width="7" height="25" fill="var(--mark)" />
      <rect x="34.5" y="28.5" width="19" height="7" fill="var(--mark)" />
    </svg>
  );
}

export { LogoMark as GapMark };
