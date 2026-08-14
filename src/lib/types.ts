export type PerpsCategory = "index" | "commodity" | "crypto" | "equity" | string;

export type PerpsInstrument = {
  instrumentId: number;
  instrumentType: string;
  category: PerpsCategory;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  fundingInterval: string;
  quantityDecimals: number;
  priceDecimals: number;
  liquidationFee: string;
  minNotional: string;
  maxLeverage: number;
  isolatedOnly: boolean;
  riskTiers: { lowerBound: string; maxLeverage: number }[];
};

export type PerpsTicker = {
  instrumentId: number;
  symbol: string;
  indexPrice: number;
  markPrice: number;
  lastPrice: number;
  midPrice: number;
  openInterest: number;
  fundingRate: number;
  nextFunding: number;
  timestamp: number;
  change1h: number | null;
};

export type MapRow = {
  symbol: string;
  aliases: string[];
  gammaQueries: string[];
  tags: string[];
  signedBeta: number;
  confidence: number;
  cluster: string;
};

export type ClusterMember = {
  symbol: string;
  signedBeta: number;
  confidence: number;
};

export type ClusterRule = {
  id: string;
  queries: string[];
  members: ClusterMember[];
};

export type Snapshot = { t: number; v: number };

export type LinkedPerp = {
  symbol: string;
  signedBeta: number;
  confidence: number;
  cluster: string;
  mappingReason: string;
};

export type ResolvedEvent = {
  id: string;
  slug: string;
  title: string;
  question: string;
  volume: number;
  yesTokenId: string | null;
  noTokenId: string | null;
  yesPrice: number;
  liquidityScore: number;
  perps: LinkedPerp[];
};

export type GapWindow = "1m" | "5m" | "15m" | "1h";

export type GapRow = {
  eventId: string;
  title: string;
  question: string;
  slug: string;
  symbol: string;
  window: GapWindow;
  oddsMove: number;
  perpMove: number;
  signedBeta: number;
  gap: number;
  score: number;
  confidence: number;
  yesPrice: number;
  markPrice: number;
  mappingReason: string;
  leader: "odds" | "perp" | "flat";
  expected: number;
  actual: number;
  bias: "long" | "short" | "none";
  catchup: number | null;
  volume: number;
};

export type GapTapePoint = {
  t: number;
  eventId: string;
  symbol: string;
  score: number;
  gap: number;
  leader: GapRow["leader"];
  bias: GapRow["bias"];
};

export type ResidualPoint = {
  t: number;
  expected: number;
  actual: number;
  gap: number;
};

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  publishedAt: number;
  source: string;
  symbols: string[];
  eventIds: string[];
};

export type SessionLabel = "RTH" | "overnight" | "24h";

export type KlineInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export type PerpsBookLevel = { price: number; quantity: number };

export type PerpsBook = {
  instrumentId: number;
  bids: PerpsBookLevel[];
  asks: PerpsBookLevel[];
  timestamp: number;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
