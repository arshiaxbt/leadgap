import { LiveStamp } from "@/components/LiveStamp";
import { SocialLinks } from "@/components/SocialLinks";

export function StatusStrip() {
  return (
    <div className="relative z-20 mb-[calc(3rem+env(safe-area-inset-bottom))] flex h-7 shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_60%,var(--bg))] px-3 text-[11px] text-[var(--dim)] backdrop-blur-sm sm:px-4 md:mb-0">
      <LiveStamp className="hidden md:inline-flex" />
      <p className="hidden min-w-0 truncate md:block">Not financial advice</p>
      <SocialLinks className="ml-auto" />
    </div>
  );
}
