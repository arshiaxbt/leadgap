import type { Metadata } from "next";
import { WINDOWS } from "./research";
import type { GapWindow } from "./types";

export function signalWindow(value: unknown): GapWindow {
  return typeof value === "string" && WINDOWS.includes(value as GapWindow)
    ? value as GapWindow : "4h";
}

export function signalShareMetadata(
  { event, symbol }: { event: string; symbol: string },
  value: unknown,
): Metadata {
  const window = signalWindow(value);
  const name = symbol.replace("-USD", "").toUpperCase();
  const title = `${name} signal`;
  const description = `Polymarket odds against the ${name} perp, and the gap between them.`;
  const path = `/signals/${encodeURIComponent(event)}/${encodeURIComponent(symbol)}`;
  const image = (route: string) => ({
    url: `${path}/${route}?window=${window}`,
    width: 1200, height: 630,
    alt: `Leadgap ${name} signal · ${window} window`,
  });
  return {
    title, description,
    // One canonical per signal: the window lives in the query string.
    alternates: { canonical: path },
    // Regenerated every minute and gone when the event resolves; still
    // crawlable, because unfurlers fetch the card regardless of this.
    robots: { index: false, follow: true },
    openGraph: {
      title: `${title} · Leadgap`, description,
      url: `${path}?window=${window}`,
      siteName: "Leadgap", type: "website",
      images: [image("opengraph-image")],
    },
    twitter: {
      card: "summary_large_image", title: `${title} · Leadgap`, description,
      images: [image("twitter-image")],
    },
  };
}
