"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV, isDeskPath, navItemActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MobileTabBar() {
  const path = usePathname();
  const onDesk = isDeskPath(path);

  const tabs = [
    { href: "/", label: "Signals", on: navItemActive(path, APP_NAV[0]) },
    { href: "/markets", label: "Markets", on: navItemActive(path, APP_NAV[1]) },
    { href: onDesk ? path : "/markets", label: "Trade", on: onDesk },
    { href: "/portfolio", label: "Portfolio", on: navItemActive(path, APP_NAV[2]) },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_75%,var(--bg))] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Primary"
    >
      <ul className="grid h-12 grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.label}>
            <Link
              href={tab.href}
              aria-current={tab.on ? "page" : undefined}
              className={cn(
                "lg-focus relative flex h-full items-center justify-center text-[11px] font-medium transition-colors",
                tab.on ? "text-[var(--text)]" : "text-[var(--muted)]",
              )}
            >
              {tab.on ? (
                <span
                  className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-b-full bg-[var(--odds)] shadow-[0_0_8px_color-mix(in_srgb,var(--odds)_70%,transparent)]"
                  aria-hidden
                />
              ) : null}
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
