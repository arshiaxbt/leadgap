"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandSearch } from "@/components/CommandSearch";
import { LoginButton } from "@/components/LoginButton";
import { LogoMark } from "@/components/LogoMark";
import { PortfolioStripAlert } from "@/components/PortfolioStrip";
import { APP_NAME } from "@/lib/brand";
import { APP_NAV, isDeskPath, navItemActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Header() {
  const path = usePathname();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0 bg-chrome",
        // The mobile desk carries its own instrument bar with a back link.
        isDeskPath(path) && "hidden md:block",
      )}
    >
      <div className="flex h-14 w-full min-w-0 items-center gap-4 border-b border-line px-4 md:h-[52px] md:gap-5 md:px-5 xl:gap-7">
        <Link
          href="/"
          className="lg-focus flex shrink-0 items-center gap-[9px] rounded-[4px] text-[15px] font-semibold tracking-[-0.015em] text-text md:text-base"
        >
          <LogoMark className="size-[19px] md:size-5" />
          <span>{APP_NAME}</span>
        </Link>
        <nav
          className="hidden items-center gap-0.5 text-[13px] md:flex"
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
                  "lg-focus rounded-[7px] px-2.5 py-[5px] transition-colors",
                  on
                    ? "bg-elevated font-medium text-text"
                    : "text-subtle hover:text-text",
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
  );
}
