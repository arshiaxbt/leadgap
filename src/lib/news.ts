import Parser from "rss-parser";
import { aliasHit, ASSET_MAP } from "./mapping";
import { NEWS_LINK_HOSTS, safeHttpsUrl } from "./safe-url";
import type { NewsItem, ResolvedEvent } from "./types";

const FEEDS = [
  { source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
];

function idFrom(link: string, title: string): string {
  return Buffer.from(`${link}|${title}`).toString("base64url").slice(0, 24);
}

function matchSymbols(text: string): string[] {
  const hay = text.toLowerCase();
  const hits: string[] = [];
  for (const row of ASSET_MAP) {
    if (row.aliases.some((alias) => aliasHit(hay, alias))) hits.push(row.symbol);
  }
  return Array.from(new Set(hits));
}

function matchEvents(text: string, events: ResolvedEvent[]): string[] {
  const hay = text.toLowerCase();
  return events
    .filter((event) => {
      const bits = `${event.title} ${event.question}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return bits.slice(0, 6).some((w) => hay.includes(w));
    })
    .map((event) => event.id);
}

export async function fetchNews(events: ResolvedEvent[]): Promise<NewsItem[]> {
  const parser = new Parser({ timeout: 8000 });
  const items: NewsItem[] = [];
  await Promise.all(
    FEEDS.map(async (feed) => {
      const url = safeHttpsUrl(feed.url, NEWS_LINK_HOSTS);
      if (!url) return;
      try {
        const parsed = await parser.parseURL(url);
        for (const entry of parsed.items.slice(0, 20)) {
          const title = entry.title?.trim();
          const link = (entry.link || entry.guid)?.toString().trim();
          if (!title || !link) continue;
          const publishedAt = entry.isoDate ? Date.parse(entry.isoDate) : Date.now();
          const symbols = matchSymbols(`${title} ${entry.contentSnippet ?? ""}`);
          items.push({
            id: idFrom(link, title),
            title,
            link,
            publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now(),
            source: feed.source,
            symbols,
            eventIds: matchEvents(title, events),
          });
        }
      } catch {
        // Feed outages should not break the terminal.
      }
    }),
  );
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 80);
}
