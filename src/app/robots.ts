import type { MetadataRoute } from "next";
import { APP_ORIGIN } from "@/lib/brand";

/**
 * Crawlers get everything except the app's own data routes and the
 * account-only portfolio. Signal and desk pages stay crawlable on purpose:
 * social crawlers honour robots.txt, and blocking them would stop the
 * per-signal share cards from rendering. They are left out of the sitemap
 * instead, since each one is a view of live data.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/portfolio"],
    },
    sitemap: `${APP_ORIGIN}/sitemap.xml`,
    host: APP_ORIGIN,
  };
}
