"use client";

import { ResearchControls } from "@/components/ResearchControls";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandSearch } from "@/components/CommandSearch";
import { LoginButton } from "@/components/LoginButton";
import { LogoMark } from "@/components/LogoMark";
import { PortfolioStripAlert } from "@/components/PortfolioStrip";
import { APP_NAME } from "@/lib/brand";
import { APP_NAV, navItemActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Header() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg)]">
      <div className="flex h-16 w-full min-w-0 items-center gap-6 border-b border-[var(--line)] px-4 md:px-7">
        <Link
          href="/"
          className="lg-focus flex shrink-0 items-center gap-2 rounded-[4px] text-[19px] font-medium tracking-tight text-[var(--text)]"
        >
          <LogoMark />
          <span>{APP_NAME}</span>
        </Link>
        <nav
          className="hidden h-full items-stretch text-[13px] md:flex"
          aria-label="Primary"
        >
          {APP_NAV.map((link) => {
            const on = navItemActive(path, link);
            return (
              <Link
                key={link.href}
                aria-current={on ? "page" : undefined}
                href={link.href}
                className={cn(
                  "lg-focus flex items-center border-b-2 px-3",
                  on
                    ? "border-[var(--text)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <ResearchControls />
          <CommandSearch />
          <LoginButton />
        </div>
      </div>
      <PortfolioStripAlert />
    </header>
  );
}
