import type { PerpsInstrument, PerpsTicker } from "./types";

const PERPS_API = "https://api.perpetuals.polymarket.com";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PERPS_API}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Perps ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

type RawInstrument = {
  instrument_id: number;
  instrument_type: string;
  category: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  funding_interval: string;
  quantity_decimals: number;
  price_decimals: number;
  liquidation_fee: string;
  min_notional: string;
  max_leverage: number;
  isolated_only: boolean;
  risk_tiers: { lower_bound: string; max_leverage: number }[];
};

type RawTicker = {
  instrument_id: number;
  symbol: string;
  index_price: string;
  mark_price: string;
  last_price: string;
  mid_price: string;
  open_interest: string;
  funding_rate: string;
  next_funding: number;
  timestamp: number;
};

export function maintenanceMarginRate(maxLeverage: number): number {
  return 0.5 / maxLeverage;
}

export async function fetchInstruments(): Promise<PerpsInstrument[]> {
  const raw = await getJson<RawInstrument[]>("/v1/info/instruments");
  return raw.map((item) => ({
    instrumentId: item.instrument_id,
    instrumentType: item.instrument_type,
    category: item.category,
    symbol: item.symbol,
    baseAsset: item.base_asset,
    quoteAsset: item.quote_asset,
    fundingInterval: item.funding_interval,
    quantityDecimals: item.quantity_decimals,
    priceDecimals: item.price_decimals,
    liquidationFee: item.liquidation_fee,
    minNotional: item.min_notional,
    maxLeverage: item.max_leverage,
    isolatedOnly: item.isolated_only,
    riskTiers: (item.risk_tiers ?? []).map((tier) => ({
      lowerBound: tier.lower_bound,
      maxLeverage: tier.max_leverage,
    })),
  }));
}

export async function fetchTickers(): Promise<Omit<PerpsTicker, "change1h">[]> {
  const raw = await getJson<RawTicker[]>("/v1/info/tickers");
  return raw.map((item) => ({
    instrumentId: item.instrument_id,
    symbol: item.symbol,
    indexPrice: Number(item.index_price),
    markPrice: Number(item.mark_price),
    lastPrice: Number(item.last_price),
    midPrice: Number(item.mid_price),
    openInterest: Number(item.open_interest),
    fundingRate: Number(item.funding_rate),
    nextFunding: item.next_funding,
    timestamp: item.timestamp,
  }));
}

export async function fetchKlineCloses(
  instrumentId: number,
  interval: "5m" | "1h" = "5m",
  lookbackMs = 3 * 60 * 60 * 1000,
): Promise<{
  change1h: number | null;
  closes: { t: number; v: number }[];
}> {
  const start = Date.now() - lookbackMs;
  const res = await fetch(
    `${PERPS_API}/v1/info/klines?instrument_id=${instrumentId}&interval=${interval}&start_timestamp=${start}`,
    { cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) return { change1h: null, closes: [] };
  const body = (await res.json()) as { data?: [number, string, string, string, string, string, number][] };
  const rows = body.data ?? [];
  const closes = rows
    .map((row) => ({ t: row[0], v: Number(row[4]) }))
    .filter((row) => Number.isFinite(row.v) && row.v > 0);
  if (closes.length < 2) return { change1h: null, closes };
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const prev = closes.findLast((c) => c.t <= hourAgo)?.v ?? closes[0]!.v;
  const last = closes[closes.length - 1]!.v;
  return { change1h: prev ? (last - prev) / prev : null, closes };
}

export async function fetchHourlyKlines(instrumentId: number): Promise<{
  change1h: number | null;
  closes: { t: number; v: number }[];
}> {
  return fetchKlineCloses(instrumentId, "5m", 3 * 60 * 60 * 1000);
}

export async function fetchHourlyChange(instrumentId: number): Promise<number | null> {
  const { change1h } = await fetchHourlyKlines(instrumentId);
  return change1h;
}

export async function fetchExchange() {
  return getJson<{
    name: string;
    version: string;
    chain_id: number;
    cancel_only: boolean;
    engine_version: string;
  }>("/v1/info/exchange");
}
