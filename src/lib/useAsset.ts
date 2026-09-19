"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { readJson } from "@/lib/http";
import type {
  GapRow,
  GapTapePoint,
  GapWindow,
  MapRow,
  NewsItem,
  PerpsInstrument,
  PerpsTicker,
  ResolvedEvent,
  Snapshot,
} from "@/lib/types";

export type AssetPayload = {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  events: ResolvedEvent[];
  news: NewsItem[];
  mapping: MapRow | null;
  markHistory: Snapshot[];
  oddsHistory: Record<string, Snapshot[]>;
  gaps: GapRow[];
  windows?: Record<GapWindow, GapRow[]>;
  tape?: GapTapePoint[];
  instruments: PerpsInstrument[];
  asOf: number;
  modelVersion?: string;
};

export function assetQuery(symbol: string) {
  return queryOptions({
    queryKey: ["asset", symbol],
    queryFn: ({ signal }) =>
      readJson<AssetPayload>(`/api/assets/${encodeURIComponent(symbol)}`, signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useAsset(symbol: string) {
  return useQuery(assetQuery(symbol));
}
