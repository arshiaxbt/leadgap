/** Ice path leads; stone path lags. The empty band is the gap. */
export function LogoMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M1 17 C6 17, 7 5, 12 5 C17 5, 18 9, 23 9 L23 13 C18 13, 17 9, 12 9 C7 9, 6 21, 1 21 Z"
        fill="var(--odds)"
        fillOpacity="0.16"
      />
      <path
        d="M1 17 C6 17, 7 5, 12 5 C17 5, 18 9, 23 9"
        stroke="var(--odds)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M1 21 C6 21, 7 9, 12 9 C17 9, 18 13, 23 13"
        stroke="var(--mark)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { LogoMark as GapMark };
