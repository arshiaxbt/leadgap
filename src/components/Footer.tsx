import { BUILDER_NAME } from "@/lib/builder";
import { APP_NAME } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#1e2636] px-4 py-6 text-xs text-[#5c6478]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {APP_NAME} maps Polymarket event odds to live Perps. Events are signal only — you trade
          the perp. Not financial advice. You are responsible for local law.
        </p>
        <p className="shrink-0">
          Builder {BUILDER_NAME} · 0% add-on
        </p>
      </div>
    </footer>
  );
}
