"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, isDeskPath, navItemActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MobileTabBar() {
  const path = usePathname();
  // The desk keeps its Long / Short bar at the bottom instead.
  if (isDeskPath(path)) return null;

  return (
    <nav
      className="shrink-0 border-t border-line bg-chrome pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      <ul className="grid h-[54px] grid-cols-4">
        {MOBILE_NAV.map((tab) => {
          const on = navItemActive(path, tab);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "lg-focus flex h-full items-center justify-center text-[11px] font-medium",
                  on ? "text-odds" : "text-subtle",
                )}
              >
                {tab.short ?? tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
