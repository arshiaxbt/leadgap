import { APP_GITHUB, APP_NAME, APP_X } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#1e2636] px-4 py-6 text-xs text-[#5c6478]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {APP_NAME} maps Polymarket event odds to live Perps. Events are signal only — you trade
          the perp. Not financial advice. You are responsible for local law.
        </p>
        <div className="flex shrink-0 flex-wrap gap-4">
          <a href={APP_GITHUB} target="_blank" rel="noreferrer" className="hover:text-white">
            github.com/arshiaxbt/leadgap
          </a>
          <a href={APP_X} target="_blank" rel="noreferrer" className="hover:text-white">
            x.com/0xarshia
          </a>
        </div>
      </div>
    </footer>
  );
}
