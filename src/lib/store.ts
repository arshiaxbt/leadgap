import { eligibleMarket } from "./eligibility";
import type { ResearchSnapshot } from "./research";
import { durableEnabled, researchSnapshot } from "./data-service";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  allGammaQueries,
  ASSET_MAP,
  CONFIDENCE_FLOOR,
  MAP_REVISION,
  aliasHit,
  linksForSearchHit,
  mapBySymbol,
  selectLinkedPerps,
} from "./mapping";
import {
  computeGaps,
  eventTitleKey,
  GAP_WINDOWS,
  uniqueGapRows,
  withTraces,
} from "./divergence";
import { isActionable } from "./score";
import {

  fetchOddsHistory,
  parseEndsAt,
  fetchYesMid,
  parseTokenIds,
  parseYesPrice,
  searchGammaEvents,
} from "./gamma";
import { fetchNews } from "./news";
import { fetchKlineCloses, fetchInstruments, fetchTickers } from "./perps";
import type {
  GapRow,
  GapTapePoint,
  GapWindow,
  LinkedPerp,
  NewsItem,
  PerpsInstrument,
  PerpsTicker,
  ResolvedEvent,
  Snapshot,
} from "./types";

const INGEST_MS = 20_000;
const MAP_MS = 3 * 60_000;
const KLINE_MS = 4 * 60_000;
const NEWS_MS = 5 * 60_000;
const HISTORY_MS = 48 * 60 * 60_000;
const DATA_DIR =
  process.env.VERCEL || process.env.NETLIFY
    ? "/tmp"
    : join(process.cwd(), ".data");
const DATA_PATH = join(DATA_DIR, "store.json");

type Store = {
  shared?: ResearchSnapshot;
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  events: ResolvedEvent[];
  markHistory: Record<string, Snapshot[]>;
  oddsHistory: Record<string, Snapshot[]>;
  news: NewsItem[];
  gapTape: GapTapePoint[];
  lastIngest: number;
  lastNews: number;
  lastMap: number;
  lastKlines: number;
  mapRevision: number;
  ingesting: Promise<void> | null;
  error: string | null;
};

const g = globalThis as typeof globalThis & {
  __polyStore?: Store;
  __polyLoop?: boolean;
};

function emptyStore(): Store {
  return {
    instruments: [],
    tickers: {},
    events: [],
    markHistory: {},
    oddsHistory: {},
    news: [],
    gapTape: [],
    lastIngest: 0,
    lastNews: 0,
    lastMap: 0,
    lastKlines: 0,
    mapRevision: 0,
    ingesting: null,
    error: null,
  };
}

function store(): Store {
  if (!g.__polyStore) g.__polyStore = emptyStore();
  return g.__polyStore;
}

function mergeSnaps(
  history: Record<string, Snapshot[]>,
  key: string,
  points: Snapshot[],
) {
  const now = Date.now();
  const byT = new Map<number, number>();
  for (const snap of history[key] ?? []) byT.set(snap.t, snap.v);
  for (const snap of points) byT.set(snap.t, snap.v);
  history[key] = [...byT.entries()]
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => a.t - b.t)
    .filter((snap) => now - snap.t <= HISTORY_MS);
}

function persist() {
  try {
    const s = store();
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      DATA_PATH,
      JSON.stringify({
        instruments: s.instruments,
        tickers: s.tickers,
        events: s.events,
        markHistory: s.markHistory,
        oddsHistory: s.oddsHistory,
        news: s.news,
        gapTape: s.gapTape,
        lastIngest: s.lastIngest,
        lastNews: s.lastNews,
        lastMap: s.lastMap,
        lastKlines: s.lastKlines,
        mapRevision: s.mapRevision,
        error: s.error,
      }),
    );
  } catch {
    // disk is optional
  }
}

function loadPersisted() {
  const s = store();
  if (s.lastIngest) return;
  try {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf8")) as Partial<Store>;
    s.instruments = raw.instruments ?? [];
    s.tickers = raw.tickers ?? {};
    s.events = raw.events ?? [];
    s.markHistory = raw.markHistory ?? {};
    s.oddsHistory = raw.oddsHistory ?? {};
    s.news = raw.news ?? [];
    s.gapTape = raw.gapTape ?? [];
    s.lastIngest = raw.lastIngest ?? 0;
    s.lastNews = raw.lastNews ?? 0;
    s.lastMap = raw.lastMap ?? 0;
    s.lastKlines = raw.lastKlines ?? 0;
    s.mapRevision = raw.mapRevision ?? 0;
    s.error = raw.error ?? null;
  } catch {
    // first boot
  }
}

function addLink(event: ResolvedEvent, link: LinkedPerp) {
  if (link.confidence < CONFIDENCE_FLOOR) return;
  const existing = event.perps.find((p) => p.symbol === link.symbol);
  if (!existing || link.confidence > existing.confidence) {
    event.perps = event.perps.filter((p) => p.symbol !== link.symbol);
    event.perps.push(link);
  }
}

function uniqueEvents(events: ResolvedEvent[]): ResolvedEvent[] {
  const ranked = [...events].sort((a, b) => b.volume - a.volume);
  const out: ResolvedEvent[] = [];
  const seenId = new Set<string>();
  const seenTitle = new Set<string>();
  for (const event of ranked) {
    if (seenId.has(event.id)) continue;
    const key = eventTitleKey(event.title) || event.id;
    if (seenTitle.has(key)) continue;
    const perps = selectLinkedPerps(
      `${event.title} ${event.question}`,
      event.perps,
    );
    if (perps.length === 0) continue;
    seenId.add(event.id);
    seenTitle.add(key);
    out.push({ ...event, perps });
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = await Promise.all(items.slice(i, i + size).map(fn));
    out.push(...chunk);
  }
  return out;
}

async function resolveEvents(): Promise<ResolvedEvent[]> {
  const s = store();
  const queries = allGammaQueries();
  const byId = new Map<string, ResolvedEvent>();

  await mapPool(queries, 6, async (q) => {
    const found = await searchGammaEvents(q.query, 3);
    for (const raw of found) {
      const market = eligibleMarket(raw, ASSET_MAP.map(a=>a.symbol), Object.fromEntries(Object.values(s.tickers).map(t=>[t.symbol,t.markPrice])), Date.now());
      if (!market) continue;
      const yesPrice = parseYesPrice(market);
      if (yesPrice == null || yesPrice <= 0.02 || yesPrice >= 0.98) continue;
      const volume = Number(market.volume ?? 0);
      if (volume < 500) continue;
      const tokens = parseTokenIds(market);
      let event = byId.get(raw.id);
      if (!event) {
        event = {
          id: String(raw.id),
          marketId: market.id,
          slug: raw.slug,
          title: raw.title,
          question: market.question ?? raw.title,
          volume,
          yesTokenId: tokens.yes,
          noTokenId: tokens.no,
          yesPrice,
          liquidityScore: Math.min(1, Math.log10(Math.max(volume, 10)) / 6),
          perps: [],
          endsAt: parseEndsAt(market, raw),
        };
        byId.set(event.id, event);
      } else {
        event.yesPrice = yesPrice;
        event.volume = Math.max(event.volume, volume);
        event.endsAt ??= parseEndsAt(market, raw);
      }

      const hay = `${event.title} ${event.question}`;
      for (const link of linksForSearchHit({
        hay,
        source: q.source,
        id: q.id,
        query: q.query,
      })) {
        addLink(event, link);
      }
    }
  });

  for (const event of byId.values()) {
    const hay = `${event.title} ${event.question}`.toLowerCase();
    for (const row of ASSET_MAP) {
      if (event.perps.some((p) => p.symbol === row.symbol)) continue;
      const hit = row.aliases.some((a) => aliasHit(hay, a));
      if (hit) {
        addLink(event, {
          symbol: row.symbol,
          signedBeta: row.signedBeta,
          confidence: Math.min(row.confidence, 0.65),
          cluster: row.cluster,
          mappingReason: `Alias match on ${row.symbol}`,
          mappingKind: "named",
        });
      }
    }
  }

  const ranked = [...byId.values()]
    .filter((e) => e.perps.length > 0)
    .sort((a, b) => b.volume - a.volume);
  const out: ResolvedEvent[] = [];
  const seenTitle = new Set<string>();
  for (const event of ranked) {
    event.perps = selectLinkedPerps(
      `${event.title} ${event.question}`,
      event.perps,
    );
    if (event.perps.length === 0) continue;
    const key = eventTitleKey(event.title) || event.id;
    if (seenTitle.has(key)) continue;
    seenTitle.add(key);
    out.push(event);
  }
  return out;
}

async function ingestOnce() {
  const s = store();
  const now = Date.now();
  const refreshedOdds = new Set<string>();
  let oddsFailures = 0;
  try {
    const needMap =
      now - s.lastMap > MAP_MS ||
      s.events.length === 0 ||
      s.mapRevision !== MAP_REVISION;
    const needKlines = now - s.lastKlines > KLINE_MS;
    const [instruments, tickerRows] = await Promise.all([
      fetchInstruments(),
      fetchTickers(),
    ]);
    s.instruments = instruments;

    let klineMap: Record<
      string,
      { change1h: number | null; closes: Snapshot[] }
    > = {};
    if (needKlines) {
      const klineEntries = await mapPool(instruments, 8, async (inst) => {
        const klines = await fetchKlineCloses(
          inst.instrumentId,
          "5m",
          HISTORY_MS,
        );
        return [inst.symbol, klines] as const;
      });
      klineMap = Object.fromEntries(klineEntries);
      s.lastKlines = now;
    }

    const tickers: Record<string, PerpsTicker> = {};
    for (const t of tickerRows) {
      tickers[t.symbol] = {
        ...t,
        change1h:
          klineMap[t.symbol]?.change1h ?? s.tickers[t.symbol]?.change1h ?? null,
      };
      if (klineMap[t.symbol]?.closes.length) {
        mergeSnaps(s.markHistory, t.symbol, klineMap[t.symbol]!.closes);
      }
      mergeSnaps(s.markHistory, t.symbol, [{ t: now, v: t.markPrice }]);
    }
    s.tickers = tickers;

    if (needMap) {
      const events = await resolveEvents();
      for (const event of events) {
        const prior = s.events.find((previous) => previous.id === event.id);
        // Gamma can choose a different binary market inside an event. Never splice
        // one outcome token's history into another outcome token's probability.
        if (prior && prior.yesTokenId !== event.yesTokenId)
          delete s.oddsHistory[event.id];
      }
      const missing = events.filter(
        (event) => !s.oddsHistory[event.id]?.length && event.yesTokenId,
      );
      await mapPool(missing, 6, async (event) => {
        const history = await fetchOddsHistory(event.yesTokenId!);
        if (history.length) mergeSnaps(s.oddsHistory, event.id, history);
      });
      s.events = events;
      for (const event of events) refreshedOdds.add(event.id);
      s.lastMap = now;
      s.mapRevision = MAP_REVISION;
    } else {
      await mapPool(s.events, 8, async (event) => {
        if (!event.yesTokenId) return;
        try {
          const mid = await fetchYesMid(event.yesTokenId);
          if (mid != null) {
            event.yesPrice = mid;
            refreshedOdds.add(event.id);
          } else oddsFailures += 1;
        } catch {
          oddsFailures += 1;
        }
      });
    }
    s.events = uniqueEvents(s.events);

    for (const event of s.events) {
      if (!refreshedOdds.has(event.id)) continue;
      mergeSnaps(s.oddsHistory, event.id, [{ t: now, v: event.yesPrice }]);
    }

    if (now - s.lastNews > NEWS_MS) {
      s.news = await fetchNews(s.events);
      s.lastNews = now;
    }

    const scored = computeGaps({
      events: s.events,
      tickers: s.tickers,
      oddsHistory: s.oddsHistory,
      markHistory: s.markHistory,
      window: "15m",
      now,
    });
    const tape = scored.map((row) => ({
      t: now,
      eventId: row.eventId,
      symbol: row.symbol,
      score: row.score,
      gap: row.gap,
      leader: row.leader,
      bias: row.bias,
    }));
    s.gapTape = [...(s.gapTape ?? []), ...tape]
      .filter((p) => now - p.t <= HISTORY_MS)
      .slice(-2000);

    s.lastIngest = now;
    s.error = oddsFailures ? "Some event odds could not refresh." : null;
    persist();
  } catch (err) {
    s.error = err instanceof Error ? err.message : "ingest failed";
  }
}

export async function ensureFresh(): Promise<Store> {
  if (durableEnabled()) {
    const remote = await researchSnapshot();
    return {
      ...emptyStore(),
      shared: remote,
      instruments: remote.instruments,
      tickers: remote.tickers,
      events: remote.events,
      markHistory: remote.markHistory,
      oddsHistory: remote.oddsHistory,
      lastIngest: remote.asOf,
      error: remote.error,
    };
  }
  loadPersisted();
  const s = store();
  if (Date.now() - s.lastIngest < INGEST_MS && s.instruments.length) return s;
  if (!s.ingesting) {
    s.ingesting = ingestOnce().finally(() => {
      s.ingesting = null;
    });
  }
  await s.ingesting;
  return s;
}

export function startIngestLoop() {
  // Serverless isolates don't keep a background timer. Cron hits GET /api/ingest instead.
  if (process.env.VERCEL || process.env.NETLIFY || durableEnabled()) return;
  if (g.__polyLoop) return;
  g.__polyLoop = true;
  loadPersisted();
  void ensureFresh();
  setInterval(() => {
    void ensureFresh();
  }, INGEST_MS);
}

export async function getMarkets() {
  const s = await ensureFresh();
  const eventCounts: Record<string, number> = {};
  for (const event of uniqueEvents(s.events)) {
    const seen = new Set<string>();
    for (const perp of event.perps) {
      if (seen.has(perp.symbol)) continue;
      seen.add(perp.symbol);
      eventCounts[perp.symbol] = (eventCounts[perp.symbol] ?? 0) + 1;
    }
  }
  return {
    instruments: s.instruments,
    tickers: s.tickers,
    eventCounts,
    error: s.error,
    asOf: s.lastIngest,
    ...(s.shared
      ? {
          dataSource: "shared",
          modelVersion: s.shared.modelVersion,
          coverage: s.shared.coverage,
        }
      : { dataSource: "local" }),
  };
}

export async function getGaps(window: GapWindow): Promise<{
  gaps: GapRow[];
  asOf: number;
  error: string | null;
  polling: boolean;
  summary: { oddsFirst: number; actionable: number; topScore: number };
}> {
  const s = await ensureFresh();
  // Shared rows were scored when the snapshot was taken; local rows are scored now.
  const now = s.shared ? s.shared.asOf : Date.now();
  const gaps = s.shared
    ? s.shared.windows[window]
    : uniqueGapRows(
        computeGaps({
          events: s.events,
          tickers: s.tickers,
          oddsHistory: s.oddsHistory,
          markHistory: s.markHistory,
          window,
          now,
        }),
      );
  return {
    gaps: withTraces(gaps, {
      oddsHistory: s.oddsHistory,
      markHistory: s.markHistory,
      window,
      events: s.events,
      now,
    }),
    asOf: s.lastIngest,
    ...(s.shared
      ? {
          dataSource: "shared",
          modelVersion: s.shared.modelVersion,
          coverage: s.shared.coverage,
        }
      : { dataSource: "local" }),
    error: s.error,
    polling: true,
    summary: {
      oddsFirst: gaps.filter((g) => !isActionable(g))
        .length,
      actionable: gaps.filter(isActionable).length,
      topScore: gaps[0]?.score ?? 0,
    },
  };
}

export async function getEvents() {
  const s = await ensureFresh();
  return {
    events: uniqueEvents(s.events),
    tickers: s.tickers,
    asOf: s.lastIngest,
    ...(s.shared
      ? {
          dataSource: "shared",
          modelVersion: s.shared.modelVersion,
          coverage: s.shared.coverage,
        }
      : { dataSource: "local" }),
    error: s.error,
  };
}

export async function getEvent(id: string) {
  const s = await ensureFresh();
  const event = s.events.find((e) => e.id === id || e.slug === id);
  if (!event) return null;
  const relatedTickers = Object.fromEntries(
    event.perps
      .map((p) => s.tickers[p.symbol])
      .filter(Boolean)
      .map((t) => [t.symbol, t]),
  );
  const news = s.news.filter(
    (n) =>
      n.eventIds.includes(event.id) ||
      n.symbols.some((sym) => event.perps.some((p) => p.symbol === sym)),
  );
  const now = s.shared ? s.shared.asOf : Date.now();
  const windows = Object.fromEntries(
    GAP_WINDOWS.map((window) => {
      const rows = s.shared
        ? s.shared.windows[window].filter((row) => row.eventId === event.id)
        : uniqueGapRows(
            computeGaps({
              events: [event],
              tickers: s.tickers,
              oddsHistory: s.oddsHistory,
              markHistory: s.markHistory,
              window,
              now,
            }),
          );
      return [
        window,
        withTraces(rows, {
          oddsHistory: s.oddsHistory,
          markHistory: s.markHistory,
          window,
          events: s.events,
          now,
          points: 24,
        }),
      ];
    }),
  ) as Record<GapWindow, GapRow[]>;
  const dayAgo = now - 24 * 60 * 60_000;
  const odds = (s.oddsHistory[event.id] ?? []).filter((p) => p.t >= dayAgo);
  const stride = Math.max(1, Math.ceil(odds.length / 240));
  const oddsHistory = odds.filter(
    (_, i) => i % stride === 0 || i === odds.length - 1,
  );
  return {
    event,
    tickers: relatedTickers,
    windows,
    oddsHistory,
    instruments: s.instruments,
    news,
    asOf: s.lastIngest,
    ...(s.shared
      ? {
          dataSource: "shared",
          modelVersion: s.shared.modelVersion,
          coverage: s.shared.coverage,
        }
      : { dataSource: "local" }),
  };
}

export async function getAsset(symbol: string) {
  const s = await ensureFresh();
  const instrument = s.instruments.find((i) => i.symbol === symbol);
  if (!instrument) return null;
  const ticker = s.tickers[symbol];
  const events = uniqueEvents(
    s.events.filter((e) => e.perps.some((p) => p.symbol === symbol)),
  );
  const news = durableEnabled()
    ? (await getNews({ symbol })).news
    : s.news.filter((n) => n.symbols.includes(symbol));
  const mapping = mapBySymbol().get(symbol) ?? null;
  const now = s.shared ? s.shared.asOf : Date.now();
  const windows = Object.fromEntries(
    GAP_WINDOWS.map((window) => [
      window,
      withTraces(
        (s.shared
          ? s.shared.windows[window]
          : uniqueGapRows(
              computeGaps({
                events,
                tickers: s.tickers,
                oddsHistory: s.oddsHistory,
                markHistory: s.markHistory,
                window,
                now,
              }),
            )
        ).filter((row) => row.symbol === symbol),
        {
          oddsHistory: s.oddsHistory,
          markHistory: s.markHistory,
          window,
          events,
          now,
          points: 48,
        },
      ),
    ]),
  ) as Record<GapWindow, GapRow[]>;
  const gaps = windows["15m"];
  const oddsHistory = Object.fromEntries(
    events.map((event) => [event.id, s.oddsHistory[event.id] ?? []]),
  );
  const tape = (s.gapTape ?? []).filter((p) => p.symbol === symbol);
  return {
    instrument,
    ticker,
    events,
    news,
    mapping,
    markHistory: s.markHistory[symbol] ?? [],
    oddsHistory,
    gaps,
    windows,
    tape,
    instruments: s.instruments,
    asOf: s.lastIngest,
    ...(s.shared
      ? {
          dataSource: "shared",
          modelVersion: s.shared.modelVersion,
          coverage: s.shared.coverage,
        }
      : { dataSource: "local" }),
  };
}

const sharedNews: {
  items: Store["news"];
  at: number;
  pending?: Promise<void>;
} = { items: [], at: 0 };
export async function getNews(filter?: { symbol?: string; eventId?: string }) {
  const s = await ensureFresh();
  if (durableEnabled()) {
    if (Date.now() - sharedNews.at > 300_000 && !sharedNews.pending)
      sharedNews.pending = fetchNews(s.events)
        .then((items) => {
          sharedNews.items = items;
          sharedNews.at = Date.now();
        })
        .catch(() => {
          sharedNews.at = Date.now();
        })
        .finally(() => {
          sharedNews.pending = undefined;
        });
    await sharedNews.pending;
    s.news = sharedNews.items;
    s.lastNews = sharedNews.at;
  }
  let items = s.news;
  if (filter?.symbol)
    items = items.filter((n) => n.symbols.includes(filter.symbol!));
  if (filter?.eventId)
    items = items.filter((n) => n.eventIds.includes(filter.eventId!));
  return { news: items, asOf: s.lastNews };
}

export async function getSnapshot() {
  const s = await ensureFresh();
  return {
    instrumentCount: s.instruments.length,
    eventCount: s.events.length,
    newsCount: s.news.length,
    asOf: s.lastIngest,
    ...(s.shared
      ? {
          dataSource: "shared",
          modelVersion: s.shared.modelVersion,
          coverage: s.shared.coverage,
        }
      : { dataSource: "local" }),
    error: s.error,
  };
}
