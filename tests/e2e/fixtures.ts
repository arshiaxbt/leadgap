import type { Page } from "@playwright/test";
import type {
  GapRow,
  PerpsInstrument,
  PerpsTicker,
  ResolvedEvent,
} from "../../src/lib/types";
export const instruments: PerpsInstrument[] = ["BTC", "ETH", "AAPL"].map(
  (base, i) => ({
    instrumentId: i + 1,
    instrumentType: "perpetual",
    category: i === 2 ? "equity" : "crypto",
    symbol: `${base}-USD`,
    baseAsset: base,
    quoteAsset: "USD",
    fundingInterval: "1h",
    quantityDecimals: 4,
    priceDecimals: 2,
    liquidationFee: "0.01",
    minNotional: "10",
    maxLeverage: 20,
    isolatedOnly: false,
    riskTiers: [],
  }),
);
export const events: ResolvedEvent[] = instruments.map((inst, i) => ({
  id: String(i + 1),
  title: [
    "Bitcoin above $100,000 this month?",
    "Ethereum above $4,000 this month?",
    "Will Apple trade above $250?",
  ][i],
  question: [
    "Will Bitcoin exceed $100,000 before month end?",
    "Will Ethereum exceed $4,000 before month end?",
    "Will Apple trade above $250 before month end?",
  ][i],
  slug: `fixture-event-${i}`,
  volume: 120000,
  yesTokenId: String(100 + i),
  noTokenId: String(200 + i),
  yesPrice: 0.64 - i * 0.1,
  liquidityScore: 0.9,
  perps: [
    {
      symbol: inst.symbol,
      signedBeta: 1,
      confidence: 0.8,
      cluster: "named",
      mappingReason: `Named event references ${inst.baseAsset}`,
      mappingKind: "named",
    },
  ],
}));
export const gaps: GapRow[] = events.map((e, i) => ({
  scoreVersion: "heuristic-v5",
  eligibility: { status: "eligible", rule: "own-price-threshold-v1" },
  timing: { status: "odds-leads", lagMinutes: 2, correlation: .8, samples: 50, coverage: 1 },
  execution: { status: "pass", reasons: [], at: Date.now(), notional:100, horizonMs:1800000, totalCost:.001 },
  candidateReasons: [],
  eventId: e.id,
  title: e.title,
  question: e.question,
  slug: e.slug,
  symbol: instruments[i].symbol,
  window: "4h",
  oddsMove: 0.035,
  perpMove: 0.004,
  signedBeta: 1,
  gap: 0.031,
  score: 70 - i * 25,
  confidence: 0.8,
  yesPrice: e.yesPrice,
  markPrice: [98000, 3500, 220][i],
  mappingReason: e.perps[0].mappingReason,
  mappingKind: "named",
  leader: "odds",
  expected: 0.035,
  actual: 0.004,
  bias: "long",
  catchup: 0.11,
  volume: e.volume,
  // Cumulative implied / observed path across the window, as served by /api/gaps.
  trace:
    i < 2
      ? {
          implied: [0, 0.002, 0.005, 0.014, 0.021, 0.025, 0.028, 0.03, 0.032, 0.0335, 0.0345, 0.035],
          observed: [0, 0.0002, 0.0005, 0.0012, 0.002, 0.0028, 0.0032, 0.0028, 0.003, 0.0034, 0.0037, 0.004],
        }
      : undefined,
}));
export async function mockFeeds(page: Page) {
  await page.route("**/api/**", async (route) => {
    // Only replace Leadgap feeds; Privy also serves its SDK config under /api/.
    if (new URL(route.request().url()).origin !== new URL(page.url()).origin)
      return route.continue();
    const url = new URL(route.request().url()),
      now = Date.now();
    const tickers: Record<string, PerpsTicker> = Object.fromEntries(
      instruments.map((inst, i) => [
        inst.symbol,
        {
          instrumentId: inst.instrumentId,
          symbol: inst.symbol,
          indexPrice: gaps[i].markPrice,
          markPrice: gaps[i].markPrice,
          lastPrice: gaps[i].markPrice,
          midPrice: gaps[i].markPrice,
          openInterest: 1500000,
          fundingRate: 0.00001,
          nextFunding: now + 3600000,
          timestamp: now,
          change1h: 0.004,
        },
      ]),
    );
    let body: unknown;
    if (url.pathname === "/api/markets")
      body = {
        instruments,
        tickers,
        eventCounts: { "BTC-USD": 1, "ETH-USD": 1, "AAPL-USD": 1 },
        asOf: now,
        error: null,
      };
    else if (url.pathname === "/api/gaps")
      body = {
        gaps: gaps.map((g) => ({
          ...g,
          window: url.searchParams.get("window"),
        })),
        summary: { actionable: 2, oddsFirst: 1, topScore: 70 },
        asOf: now,
        error: null,
      };
    else if (url.pathname === "/api/events")
      body = { events, tickers, asOf: now, error: null };
    else if (url.pathname.startsWith("/api/events/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
      const event = events.find((e) => e.id === id);
      if (!event)
        return route.fulfill({ status: 404, json: { error: "not found" } });
      const rows = gaps.filter((g) => g.eventId === id);
      body = {
        event,
        tickers,
        windows: Object.fromEntries(
          ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"].map((w) => [
            w,
            rows.map((g) => ({ ...g, window: w })),
          ]),
        ),
        oddsHistory: Array.from({ length: 24 }, (_, i) => ({
          t: now - (23 - i) * 60 * 60_000,
          v: event.yesPrice - 0.06 + 0.06 * (i / 23),
        })),
        news: [],
        instruments,
        asOf: now,
      };
    }
    else if (url.pathname.startsWith("/api/assets/")) {
      const symbol = url.pathname.split("/").at(-1)!;
      const inst = instruments.find((i) => i.symbol === symbol);
      if (!inst)
        return route.fulfill({ status: 404, json: { error: "not found" } });
      const event = events.find((e) => e.perps[0].symbol === symbol)!;
      body = {
        instrument: inst,
        ticker: tickers[symbol],
        events: [event],
        news: [],
        mapping: null,
        markHistory: [],
        oddsHistory: {
          [event.id]: Array.from({ length: 13 }, (_, i) => ({
            t: now - (12 - i) * 5 * 60_000,
            v: event.yesPrice - 0.035 + (0.035 * Math.min(1, i / 8)),
          })),
        },
        gaps: gaps.filter((g) => g.symbol === symbol),
        windows: Object.fromEntries(
          ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"].map((w) => [
            w,
            gaps
              .filter((g) => g.symbol === symbol)
              .map((g) => ({ ...g, window: w })),
          ]),
        ),
        instruments,
        asOf: now,
      };
    } else if (url.pathname === "/api/klines")
      body = {
        candles: Array.from({ length: 80 }, (_, i) => ({
          time: Math.floor(now / 1000 / 300) * 300 - (80 - i) * 300,
          open: 97000 + i * 12,
          close: 97015 + i * 12,
          high: 97025 + i * 12,
          low: 96990 + i * 12,
          volume: 100,
        })),
      };
    else if (url.pathname === "/api/book")
      body = {
        instrumentId: 1,
        timestamp: now,
        bids: Array.from({ length: 14 }, (_, i) => ({
          price: 97999 - i,
          quantity: 0.2 + i * 0.1,
        })),
        asks: Array.from({ length: 14 }, (_, i) => ({
          price: 98001 + i,
          quantity: 0.3 + i * 0.1,
        })),
      };
    else if (url.pathname === "/api/odds") body = { odds: [] };
    else if (url.pathname === "/api/history") body = { batches: [] };
    else if (url.pathname === "/api/geo")
      body = {
        blocked: true,
        country: "XX",
        reason: "Location could not be verified.",
      };
    else body = {};
    await route.fulfill({ json: body });
  });
}
