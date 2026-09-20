import type { MetadataRoute } from "next";
import { APP_ORIGIN } from "@/lib/brand";
import { marketSymbols } from "@/lib/mapping";

// Rebuilt daily rather than per request, so lastModified means something.
export const revalidate = 86_400;

/**
 * The stable surfaces, plus one desk per mapped perpetual. Signal and event
 * pages are left out: they are generated from live data that turns over
 * continuously, so listing them would advertise URLs that stop being
 * meaningful. The desk list comes from the mapping rather than from live
 * data, so the file cannot flap between requests.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: APP_ORIGIN, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${APP_ORIGIN}/markets`, lastModified, changeFrequency: "hourly", priority: 0.8 },
    { url: `${APP_ORIGIN}/model`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${APP_ORIGIN}/about`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    ...marketSymbols().map((symbol) => ({
      url: `${APP_ORIGIN}/markets/${symbol}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
