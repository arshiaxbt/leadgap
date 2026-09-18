"use client";

import { useQuery } from "@tanstack/react-query";
import { readJson } from "@/lib/http";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

export type MarketsPayload = {
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  eventCounts: Record<string, number>;
  error: string | null;
  asOf: number;
};
const EMPTY: MarketsPayload = {
  instruments: [],
  tickers: {},
  eventCounts: {},
  error: null,
  asOf: 0,
};

export function useMarkets() {
  const query = useQuery({
    queryKey: ["markets"],
    queryFn: ({ signal }) => readJson<MarketsPayload>("/api/markets", signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  });
  return {
    ...(query.data ?? EMPTY),
    error:
      query.error?.message ??
      (query.data?.error
        ? "Some market data could not refresh. Last available values are shown."
        : null),
    loading: query.isPending,
    retry: () => void query.refetch(),
  };
}
