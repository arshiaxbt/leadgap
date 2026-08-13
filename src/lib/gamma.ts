export type GammaSearchEvent = {
  id: string;
  slug: string;
  title: string;
  closed?: boolean;
  active?: boolean;
  markets?: GammaMarket[];
};

export type GammaMarket = {
  question?: string;
  closed?: boolean;
  active?: boolean;
  volume?: string | number;
  liquidity?: string | number;
  clobTokenIds?: string | string[];
  outcomePrices?: string | string[];
  outcomes?: string | string[];
};

function parseMaybeJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function parseTokenIds(market: GammaMarket): { yes: string | null; no: string | null } {
  const ids = parseMaybeJson<string[]>(market.clobTokenIds) ?? [];
  return { yes: ids[0] ?? null, no: ids[1] ?? null };
}

export function parseYesPrice(market: GammaMarket): number | null {
  const prices = parseMaybeJson<string[]>(market.outcomePrices);
  if (!prices?.[0]) return null;
  const n = Number(prices[0]);
  return Number.isFinite(n) ? n : null;
}

export async function searchGammaEvents(query: string, limit = 4): Promise<GammaSearchEvent[]> {
  const url = new URL("https://gamma-api.polymarket.com/public-search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit_per_type", String(limit));
  url.searchParams.set("events_status", "active");
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { events?: GammaSearchEvent[] };
  return (body.events ?? []).filter((event) => event.closed !== true);
}

export async function fetchGammaEvent(id: string): Promise<GammaSearchEvent | null> {
  const url = `https://gamma-api.polymarket.com/events/${id}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as GammaSearchEvent;
}

export function bestMarket(event: GammaSearchEvent): GammaMarket | null {
  const markets = (event.markets ?? []).filter((m) => m.closed !== true);
  if (markets.length === 0) return null;
  return [...markets].sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0))[0] ?? null;
}

export async function fetchYesMid(tokenId: string): Promise<number | null> {
  const res = await fetch(`https://clob.polymarket.com/midpoint?token_id=${tokenId}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { mid?: string };
  const n = Number(body.mid);
  return Number.isFinite(n) ? n : null;
}

export async function fetchOddsHistory(tokenId: string): Promise<{ t: number; v: number }[]> {
  const url = new URL("https://clob.polymarket.com/prices-history");
  url.searchParams.set("market", tokenId);
  url.searchParams.set("interval", "6h");
  url.searchParams.set("fidelity", "5");
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { history?: { t: number; p: number | string }[] };
  return (body.history ?? [])
    .map((row) => ({ t: Number(row.t) * 1000, v: Number(row.p) }))
    .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.v) && row.v > 0);
}

