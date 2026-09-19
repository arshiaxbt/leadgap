export type AppNavItem = {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short?: string;
  /** Extra path prefixes that belong to this section. */
  also?: string[];
};

export const APP_NAV: AppNavItem[] = [
  { href: "/", label: "Signals", also: ["/signals", "/events"] },
  { href: "/markets", label: "Markets" },
  { href: "/watchlist", label: "Watchlist", short: "Watch" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/model", label: "Model" },
  { href: "/about", label: "Guide" },
];

/** Sections reachable from the mobile tab bar. The rest live in search. */
export const MOBILE_NAV = APP_NAV.filter((item) =>
  ["/", "/markets", "/watchlist", "/portfolio"].includes(item.href),
);

export function isDeskPath(path: string): boolean {
  return path.startsWith("/markets/") && path !== "/markets";
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function navItemActive(path: string, item: AppNavItem): boolean {
  if (item.href === "/") {
    return path === "/" || (item.also ?? []).some((p) => under(path, p));
  }
  return (
    under(path, item.href) || (item.also ?? []).some((p) => under(path, p))
  );
}
