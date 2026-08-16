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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      <ul className="grid h-12 grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.label}>
            <Link
              href={tab.href}
              className={cn(
                "lg-focus flex h-full items-center justify-center text-[11px] font-medium",
                tab.on ? "text-[var(--text)]" : "text-[var(--muted)]",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
