import { LiveStamp } from "@/components/LiveStamp";
import { SocialLinks } from "@/components/SocialLinks";

export function StatusStrip() {
  return (
    <div className="relative z-20 mb-[calc(3rem+env(safe-area-inset-bottom))] flex h-6 shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--bg)] px-3 text-[11px] text-[var(--dim)] md:mb-0">
      <LiveStamp className="hidden md:inline-flex" />
      <p className="hidden min-w-0 truncate md:block">Not financial advice</p>
      <SocialLinks className="ml-auto" />
    </div>
  );
}
