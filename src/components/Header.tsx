"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandSearch } from "@/components/CommandSearch";
import { LiveStamp } from "@/components/LiveStamp";
import { LoginButton } from "@/components/LoginButton";
import { LogoMark } from "@/components/LogoMark";
import { APP_NAME } from "@/lib/brand";
import { APP_NAV, navItemActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Header() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,var(--bg))] backdrop-blur-md">
      <div className="flex h-12 w-full min-w-0 items-center gap-3 px-3 sm:px-4">
        <Link
          href="/"
          className="lg-focus flex shrink-0 items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-tight text-[var(--text)]"
        >
          <LogoMark className="h-6 w-6" />
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>

        <nav
          className="ml-1 hidden items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1 text-[12px] md:flex"
          aria-label="Primary"
        >
          {APP_NAV.map((link) => {
            const on = navItemActive(path, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "lg-focus relative flex items-center rounded-full px-3.5 py-1.5 font-medium transition-colors",
                  on
                    ? "bg-[var(--elevated)] text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--odds)_35%,transparent)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CommandSearch />
          <LiveStamp className="hidden sm:inline-flex" />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
