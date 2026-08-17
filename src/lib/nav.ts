export const APP_NAV = [
  { href: "/", label: "Signals", match: "exact" },
  { href: "/markets", label: "Markets", match: "exact" },
  { href: "/portfolio", label: "Portfolio", match: "prefix" },
  { href: "/about", label: "About", match: "prefix" },
] as const;

export type AppNavItem = (typeof APP_NAV)[number];

export function isDeskPath(path: string): boolean {
  return path.startsWith("/markets/") && path !== "/markets";
}

export function navItemActive(path: string, item: AppNavItem): boolean {
  switch (item.match) {
    case "exact":
      return path === item.href;
    case "prefix":
      return path === item.href || path.startsWith(`${item.href}/`);
    default: {
      const _never: never = item;
      return _never;
    }
  }
}
