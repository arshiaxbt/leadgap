import { POLYMARKET_ORIGIN } from "@/lib/brand";

export function FundControls() {
  return (
    <a
      href={POLYMARKET_ORIGIN}
      target="_blank"
      rel="noreferrer"
      className="text-[12px] text-[var(--signal)] hover:underline"
    >
      Fund on Polymarket
    </a>
  );
}
