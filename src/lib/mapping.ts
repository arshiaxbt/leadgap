import type { ClusterRule, LinkedPerp, MapRow } from "./types";

function equity(
  symbol: string,
  aliases: string[],
  extraQueries: string[] = [],
  cluster = "single-name",
): MapRow {
  const ticker = symbol.replace("-USD", "");
  const name = aliases[0] ?? ticker;
  return {
    symbol,
    aliases: Array.from(new Set([ticker, ...aliases])),
    gammaQueries: Array.from(
      new Set([
        `${name} earnings`,
        `${ticker} stock`,
        name,
        ...extraQueries,
      ]),
    ),
    tags: ["earnings", "equity"],
    signedBeta: 1,
    confidence: 0.78,
    cluster,
  };
}

export const ASSET_MAP: MapRow[] = [
  {
    symbol: "SP500-USD",
    aliases: ["SP500", "S&P 500", "S&P500", "SPX"],
    gammaQueries: ["S&P 500", "SPX"],
    tags: ["index", "macro"],
    signedBeta: 1,
    confidence: 0.7,
    cluster: "macro",
  },
  {
    symbol: "NAS100-USD",
    aliases: ["NAS100", "Nasdaq", "NDX", "Nasdaq 100"],
    gammaQueries: ["Nasdaq", "NDX"],
    tags: ["index", "macro", "tech"],
    signedBeta: 1,
    confidence: 0.7,
    cluster: "macro",
  },
  {
    symbol: "DRAM-USD",
    aliases: ["DRAM", "memory prices", "HBM"],
    gammaQueries: ["DRAM", "HBM memory", "memory chip"],
    tags: ["index", "semi"],
    signedBeta: 1,
    confidence: 0.72,
    cluster: "semi",
  },
  {
    symbol: "GOLD-USD",
    aliases: ["gold", "XAU", "bullion"],
    gammaQueries: ["gold price", "XAU"],
    tags: ["commodity", "macro"],
    signedBeta: 1,
    confidence: 0.7,
    cluster: "macro",
  },
  {
    symbol: "SILVER-USD",
    aliases: ["silver", "XAG"],
    gammaQueries: ["silver price", "XAG"],
    tags: ["commodity", "macro"],
    signedBeta: 1,
    confidence: 0.62,
    cluster: "macro",
  },
  {
    symbol: "WTIOIL-USD",
    aliases: ["WTI", "crude oil", "oil"],
    gammaQueries: ["oil price", "WTI crude"],
    tags: ["commodity", "oil"],
    signedBeta: 1,
    confidence: 0.74,
    cluster: "oil",
  },
  {
    symbol: "BTC-USD",
    aliases: ["Bitcoin", "BTC"],
    gammaQueries: ["Bitcoin above", "Bitcoin price", "BTC ETF"],
    tags: ["crypto"],
    signedBeta: 1,
    confidence: 0.9,
    cluster: "crypto-spot",
  },
  {
    symbol: "ETH-USD",
    aliases: ["Ethereum", "ETH"],
    gammaQueries: ["Ethereum above", "ETH price", "ETH ETF"],
    tags: ["crypto"],
    signedBeta: 1,
    confidence: 0.88,
    cluster: "crypto-spot",
  },
  {
    symbol: "SOL-USD",
    aliases: ["Solana", "SOL"],
    gammaQueries: ["Solana above", "SOL price", "Solana ETF"],
    tags: ["crypto"],
    signedBeta: 1,
    confidence: 0.86,
    cluster: "crypto-spot",
  },
  {
    symbol: "HYPE-USD",
    aliases: ["Hyperliquid", "HYPE"],
    gammaQueries: ["Hyperliquid", "HYPE price"],
    tags: ["crypto"],
    signedBeta: 1,
    confidence: 0.8,
    cluster: "crypto-spot",
  },
  {
    symbol: "XRP-USD",
    aliases: ["XRP", "Ripple"],
    gammaQueries: ["XRP price", "Ripple SEC", "XRP ETF"],
    tags: ["crypto", "lawsuit"],
    signedBeta: 1,
    confidence: 0.84,
    cluster: "crypto-spot",
  },
  {
    symbol: "ZEC-USD",
    aliases: ["Zcash", "ZEC"],
    gammaQueries: ["Zcash", "ZEC price"],
    tags: ["crypto", "privacy"],
    signedBeta: 1,
    confidence: 0.7,
    cluster: "crypto-spot",
  },
  {
    symbol: "PUMP-USD",
    aliases: ["pump.fun", "PUMP"],
    gammaQueries: ["pump.fun", "PUMP token"],
    tags: ["crypto"],
    signedBeta: 1,
    confidence: 0.68,
    cluster: "crypto-spot",
  },
  {
    symbol: "LIT-USD",
    aliases: ["Litecoin", "LTC", "Lit Protocol", "LIT"],
    gammaQueries: ["Litecoin", "LIT price"],
    tags: ["crypto"],
    signedBeta: 1,
    confidence: 0.6,
    cluster: "crypto-spot",
  },
  {
    symbol: "KPEPE-USD",
    aliases: ["PEPE", "Pepe", "KPEPE", "1000PEPE"],
    gammaQueries: ["PEPE price", "Pepe coin"],
    tags: ["crypto", "meme"],
    signedBeta: 1,
    confidence: 0.66,
    cluster: "crypto-spot",
  },
  equity("AAPL-USD", ["Apple", "iPhone"], ["Apple iPhone"]),
  equity("MSFT-USD", ["Microsoft", "Azure"], ["Microsoft Azure"]),
  equity("GOOG-USD", ["Google", "Alphabet", "GOOGL"], ["Google earnings", "Alphabet"]),
  equity("AMZN-USD", ["Amazon", "AWS"], ["Amazon AWS"]),
  equity("NVDA-USD", ["Nvidia", "NVIDIA"], ["Nvidia earnings", "Nvidia GPU"], "semi"),
  equity("META-USD", ["Meta", "Facebook", "Instagram"], ["Meta earnings"]),
  equity("TSLA-USD", ["Tesla", "Elon Musk"], ["Tesla deliveries", "Robotaxi"]),
  equity("AMD-USD", ["AMD", "Advanced Micro Devices"], ["AMD earnings"], "semi"),
  equity("INTC-USD", ["Intel"], ["Intel earnings", "Intel foundry"], "semi"),
  equity("AVGO-USD", ["Broadcom"], ["Broadcom earnings", "VMware"], "semi"),
  equity("QCOM-USD", ["Qualcomm", "Snapdragon"], ["Qualcomm earnings"], "semi"),
  equity("ARM-USD", ["Arm Holdings", "ARM"], ["Arm earnings"], "semi"),
  equity("TSM-USD", ["TSMC", "Taiwan Semiconductor"], ["TSMC earnings", "TSMC"], "semi"),
  equity("ASML-USD", ["ASML", "EUV"], ["ASML earnings"], "semi"),
  equity("MU-USD", ["Micron"], ["Micron earnings", "HBM"], "semi"),
  equity("SNDK-USD", ["SanDisk", "SNDK"], ["SanDisk", "NAND flash"], "semi"),
  equity("SKHY-USD", ["SK Hynix", "Hynix", "SKHY"], ["SK Hynix earnings"], "semi"),
  equity("SKHYNIX-USD", ["SK Hynix", "Hynix", "SKHYNIX"], ["SK Hynix"], "semi"),
  equity("SPCX-USD", ["SpaceX", "Starship"], ["SpaceX IPO", "Starship launch"]),
  equity("HOOD-USD", ["Robinhood"], ["Robinhood earnings"], "crypto-equity"),
  equity("MSTR-USD", ["MicroStrategy", "MSTR", "Saylor"], ["MicroStrategy Bitcoin"], "crypto-equity"),
  equity("STRC-USD", ["STRC", "Strategy Strike"], ["MicroStrategy preferred"], "crypto-equity"),
  equity("CRCL-USD", ["Circle", "USDC"], ["Circle IPO", "USDC"], "crypto-equity"),
  equity("COIN-USD", ["Coinbase"], ["Coinbase earnings", "Coinbase"], "crypto-equity"),
];

export const CLUSTER_RULES: ClusterRule[] = [
  {
    id: "macro",
    queries: [
      "Fed rate cut",
      "FOMC",
      "CPI inflation",
      "nonfarm payrolls",
      "recession",
    ],
    members: [
      { symbol: "SP500-USD", signedBeta: 1, confidence: 0.86 },
      { symbol: "NAS100-USD", signedBeta: 1, confidence: 0.82 },
      { symbol: "GOLD-USD", signedBeta: 1, confidence: 0.78 },
      { symbol: "SILVER-USD", signedBeta: 1, confidence: 0.64 },
    ],
  },
  {
    id: "oil",
    queries: ["OPEC", "Strait of Hormuz", "Iran oil", "crude inventory"],
    members: [
      { symbol: "WTIOIL-USD", signedBeta: 1, confidence: 0.88 },
      { symbol: "GOLD-USD", signedBeta: 1, confidence: 0.6 },
    ],
  },
  {
    id: "semi",
    queries: [
      "Nvidia earnings",
      "AI chip",
      "TSMC",
      "HBM memory",
      "export controls chips",
    ],
    members: [
      { symbol: "NVDA-USD", signedBeta: 1, confidence: 0.9 },
      { symbol: "TSM-USD", signedBeta: 1, confidence: 0.8 },
      { symbol: "ASML-USD", signedBeta: 1, confidence: 0.72 },
      { symbol: "MU-USD", signedBeta: 1, confidence: 0.7 },
      { symbol: "SKHY-USD", signedBeta: 1, confidence: 0.7 },
      { symbol: "SKHYNIX-USD", signedBeta: 1, confidence: 0.7 },
      { symbol: "DRAM-USD", signedBeta: 1, confidence: 0.74 },
      { symbol: "AMD-USD", signedBeta: 1, confidence: 0.68 },
      { symbol: "AVGO-USD", signedBeta: 1, confidence: 0.66 },
      { symbol: "ARM-USD", signedBeta: 1, confidence: 0.64 },
      { symbol: "QCOM-USD", signedBeta: 1, confidence: 0.58 },
      { symbol: "INTC-USD", signedBeta: 1, confidence: 0.55 },
      { symbol: "SNDK-USD", signedBeta: 1, confidence: 0.55 },
      { symbol: "NAS100-USD", signedBeta: 1, confidence: 0.5 },
    ],
  },
  {
    id: "crypto-spot",
    queries: ["Bitcoin ETF", "crypto regulation", "SEC crypto"],
    members: [
      { symbol: "BTC-USD", signedBeta: 1, confidence: 0.8 },
      { symbol: "ETH-USD", signedBeta: 1, confidence: 0.7 },
      { symbol: "SOL-USD", signedBeta: 1, confidence: 0.62 },
      { symbol: "MSTR-USD", signedBeta: 1, confidence: 0.74 },
      { symbol: "COIN-USD", signedBeta: 1, confidence: 0.7 },
    ],
  },
  {
    id: "crypto-equity",
    queries: ["MicroStrategy Bitcoin", "Coinbase", "Circle IPO", "Saylor"],
    members: [
      { symbol: "MSTR-USD", signedBeta: 1, confidence: 0.86 },
      { symbol: "STRC-USD", signedBeta: 1, confidence: 0.7 },
      { symbol: "COIN-USD", signedBeta: 1, confidence: 0.84 },
      { symbol: "CRCL-USD", signedBeta: 1, confidence: 0.76 },
      { symbol: "HOOD-USD", signedBeta: 1, confidence: 0.6 },
      { symbol: "BTC-USD", signedBeta: 1, confidence: 0.72 },
    ],
  },
];

export const CONFIDENCE_FLOOR = 0.5;
export const MAP_REVISION = 2;

export function mapBySymbol(): Map<string, MapRow> {
  return new Map(ASSET_MAP.map((row) => [row.symbol, row]));
}

export function aliasesForSymbol(symbol: string): string[] {
  return mapBySymbol().get(symbol)?.aliases ?? [symbol.replace("-USD", "")];
}

export function aliasHit(text: string, alias: string): boolean {
  const hay = text.toLowerCase();
  const needle = alias.toLowerCase().trim();
  if (needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(hay);
}

export function eventMentionsQuery(hay: string, query: string): boolean {
  const text = hay.toLowerCase();
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  return words.every((w) => {
    if (aliasHit(text, w)) return true;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}[a-z]{0,3}(?:$|[^a-z0-9])`).test(text);
  });
}

export function nameStrength(hay: string, symbol: string): number {
  const row = mapBySymbol().get(symbol);
  if (!row) return 0;
  const ticker = symbol.replace("-USD", "");
  if (aliasHit(hay, ticker)) return 3;
  if (row.aliases.some((alias) => aliasHit(hay, alias))) return 2;
  return 0;
}

export function preferredPerps<T extends { symbol: string; confidence: number }>(
  hay: string,
  perps: T[],
): T[] {
  return [...perps].sort((a, b) => nameStrength(hay, b.symbol) - nameStrength(hay, a.symbol) || b.confidence - a.confidence);
}

export function linksForSearchHit(args: {
  hay: string;
  source: "cluster" | "asset";
  id: string;
  query: string;
}): LinkedPerp[] {
  switch (args.source) {
    case "asset": {
      const row = mapBySymbol().get(args.id);
      if (!row || nameStrength(args.hay, row.symbol) === 0) return [];
      return [
        {
          symbol: row.symbol,
          signedBeta: row.signedBeta,
          confidence: row.confidence,
          cluster: row.cluster,
          mappingReason: `Direct map ${row.symbol} via “${args.query}”`,
        },
      ];
    }
    case "cluster": {
      const rule = CLUSTER_RULES.find((r) => r.id === args.id);
      if (!rule) return [];
      const named = rule.members.filter((member) => nameStrength(args.hay, member.symbol) > 0);
      const members = named.length
        ? named
        : eventMentionsQuery(args.hay, args.query)
          ? rule.members.slice(0, 1)
          : [];
      return members.map((member) => ({
        symbol: member.symbol,
        signedBeta: member.signedBeta,
        confidence: named.length ? member.confidence : Math.min(member.confidence, 0.72),
        cluster: args.id,
        mappingReason: named.length
          ? `Named ${member.symbol} in cluster ${args.id}`
          : `Cluster ${args.id} topic via “${args.query}”`,
      }));
    }
    default: {
      const _never: never = args.source;
      return _never;
    }
  }
}

export function allGammaQueries(): { query: string; source: "cluster" | "asset"; id: string }[] {
  const out: { query: string; source: "cluster" | "asset"; id: string }[] = [];
  const seen = new Set<string>();
  for (const rule of CLUSTER_RULES) {
    for (const query of rule.queries) {
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ query, source: "cluster", id: rule.id });
    }
  }
  for (const row of ASSET_MAP) {
    const query = row.gammaQueries[0];
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ query, source: "asset", id: row.symbol });
  }
  return out;
}
