"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandSearch } from "@/components/CommandSearch";
import { LoginButton } from "@/components/LoginButton";
import { LogoMark } from "@/components/LogoMark";
import { PortfolioStripAlert, PortfolioStripProvider } from "@/components/PortfolioStrip";
import { APP_NAME } from "@/lib/brand";
import { APP_NAV, navItemActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Header() {
  const path = usePathname();

  return (
    <PortfolioStripProvider>
      <header className="sticky top-0 z-30 bg-[var(--bg)]">
        <div className="flex h-10 w-full min-w-0 items-center gap-3 border-b border-[var(--line)] px-3">
          <Link
            href="/"
            className="lg-focus flex shrink-0 items-center gap-2 rounded-[4px] text-[15px] font-medium tracking-tight text-[var(--text)]"
          >
            <LogoMark />
            <span>{APP_NAME}</span>
          </Link>
          <nav className="hidden h-full items-stretch text-[12px] md:flex" aria-label="Primary">
            {APP_NAV.map((link) => {
              const on = navItemActive(path, link);
              return (
                <Link
                  key={link.href}
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
            <CommandSearch />
            <LoginButton />
          </div>
        </div>
        <PortfolioStripAlert />
      </header>
    </PortfolioStripProvider>
  );
}
