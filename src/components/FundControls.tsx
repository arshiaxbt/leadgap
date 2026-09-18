import { POLYMARKET_REFERRAL_URL } from "@/lib/brand";

export function FundControls() {
  return (
    <a
      href={POLYMARKET_REFERRAL_URL}
      target="_blank"
      rel="noreferrer"
      className="text-[12px] text-[var(--text)] hover:underline"
    >
      Fund on Polymarket
    </a>
  );
}
