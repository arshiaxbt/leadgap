/** Odds (copper) step first; the perp (stone) has not followed. The empty band is the gap. */
export function LogoMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="2" fill="var(--surface)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="1.5" fill="none" stroke="var(--line)" />
      <path
        d="M5 20H13V9H27"
        fill="none"
        stroke="var(--signal)"
        strokeWidth="2.75"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <path
        d="M5 25H19V16H27"
        fill="none"
        stroke="var(--perp)"
        strokeWidth="2.75"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </svg>
  );
}
