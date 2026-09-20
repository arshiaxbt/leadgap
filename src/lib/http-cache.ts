/**
 * Shared caching for public market data.
 *
 * Collection advances once a minute, so serving every visitor from the origin
 * spends the free Worker and D1 allowances on identical answers. These routes
 * carry no per-user data, so one origin read can serve everyone for a few
 * seconds: browsers revalidate on each poll and the CDN answers them.
 */
export function publicCache(seconds: number): Record<string, string> {
  return {
    "cache-control": `public, max-age=0, must-revalidate, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`,
    "cdn-cache-control": `max-age=${seconds}, stale-while-revalidate=${seconds * 2}`,
  };
}

/** Collection interval: every published snapshot is stamped a minute apart. */
const COLLECTION_MS = 60_000;

/**
 * How long a fetched snapshot may be reused in-process. A snapshot is only
 * replaced once a minute, so reuse it until the next one is due, with a floor
 * that keeps recovery quick when collection is late and a ceiling that keeps
 * rows clear of the 90-second staleness cutoff in `freshResearchSnapshot`.
 */
export function snapshotTtl(asOf: number, now: number): number {
  if (!Number.isFinite(asOf) || asOf <= 0) return 8_000;
  const due = asOf + COLLECTION_MS - now;
  return Math.min(25_000, Math.max(8_000, due));
}
