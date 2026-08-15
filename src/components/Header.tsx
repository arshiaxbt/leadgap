"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginButton } from "@/components/LoginButton";
import { LogoMark } from "@/components/LogoMark";
import { APP_NAME } from "@/lib/brand";

const PortfolioStrip = dynamic(() => import("@/components/PortfolioStrip").then((m) => m.PortfolioStrip), {
  ssr: false,
});

const LINKS = [
  { href: "/", label: "Wire" },
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Account" },
  { href: "/about", label: "About" },
];

export function Header() {
  const path = usePathname();
  const onDesk = path.startsWith("/markets/") && path !== "/markets";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]">
      <div className="flex h-10 w-full min-w-0 items-center gap-4 overflow-x-auto px-3 whitespace-nowrap">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 border-r border-[var(--line)] pr-4 text-[13px] font-medium tracking-tight text-[var(--text)]"
        >
          <LogoMark />
          <span className="event-title text-[15px] italic">{APP_NAME}</span>
        </Link>
        <nav className="flex shrink-0 items-stretch self-stretch text-[12px]">
          {LINKS.map((link) => {
            const on = path === link.href || (link.href !== "/" && path.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center border-b-2 px-3 ${
                  on
                    ? "border-[var(--signal)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        {onDesk ? <span className="lg-label hidden sm:inline">Desk</span> : null}
        <div className="ml-auto flex items-center gap-3">
          <PortfolioStrip />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
