import type { Metadata } from "next";
import { APP_NAME } from "./brand";

/**
 * One canonical URL per page.
 *
 * Windows, filters and the desk's selected event all travel in the query
 * string, so the same page is reachable at many URLs. Without a canonical
 * those compete with each other, and every page was also declaring the site
 * root as its `og:url`. `metadataBase` in the root layout makes these
 * absolute.
 */
export function pageMetadata(args: {
  /** Query-free path, e.g. "/markets/BTC-USD". */
  path: string;
  title?: string;
  /** Use when the title should not take the "· Leadgap" suffix. */
  absoluteTitle?: string;
  description?: string;
  /**
   * False for pages that are personal, or generated from data that turns
   * over: they stay crawlable so link unfurlers keep working, but are kept
   * out of the index rather than filling it with pages about signals that no
   * longer exist.
   */
  index?: boolean;
}): Metadata {
  const { path, title, absoluteTitle, description, index = true } = args;
  const heading = absoluteTitle ?? (title ? `${title} · ${APP_NAME}` : APP_NAME);
  return {
    ...(absoluteTitle ? { title: { absolute: absoluteTitle } } : title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: {
      title: heading,
      ...(description ? { description } : {}),
      url: path,
      siteName: APP_NAME,
      type: "website",
    },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}
