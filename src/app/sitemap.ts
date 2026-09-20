import type { MetadataRoute } from "next";
import { APP_ORIGIN } from "@/lib/brand";

/**
 * The stable surfaces only. Signal, desk and event pages are generated from
 * live data that turns over continuously, so listing them would advertise URLs
 * that stop being meaningful.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: APP_ORIGIN, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${APP_ORIGIN}/markets`, lastModified, changeFrequency: "hourly", priority: 0.8 },
    { url: `${APP_ORIGIN}/model`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${APP_ORIGIN}/about`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${APP_ORIGIN}/watchlist`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
