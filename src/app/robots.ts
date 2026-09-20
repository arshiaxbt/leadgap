import type { MetadataRoute } from "next";
import { APP_ORIGIN } from "@/lib/brand";

/**
 * Only the app's own data routes are off limits. Everything else stays
 * crawlable on purpose: social crawlers honour robots.txt, so blocking
 * /signals would stop the per-signal share cards from rendering, and a
 * disallowed page can still be listed because the crawler never sees its
 * noindex. Pages that should not be indexed say so in their own metadata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${APP_ORIGIN}/sitemap.xml`,
    host: APP_ORIGIN,
  };
}
