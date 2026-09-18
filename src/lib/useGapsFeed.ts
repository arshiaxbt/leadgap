"use client";

import { useQuery } from "@tanstack/react-query";
import { readJson } from "@/lib/http";
import type { GapRow, GapWindow, PerpsTicker } from "@/lib/types";
import { useMarkets } from "@/lib/useMarkets";

export type FeedMappedEvent = {
  id: string;
  title: string;
  question: string;
  yesPrice: number;
  volume: number;
  perps: { symbol: string }[];
};
export type GapsFeed = {
  gaps: GapRow[];
  summary: { oddsFirst: number; actionable: number; topScore: number };
  events: FeedMappedEvent[];
  tickers: Record<string, PerpsTicker>;
  asOf: number;
  error: string | null;
  coverage?: { startedAt: number; cadenceMs: number };
  loading: boolean;
  retry: () => void;
};
type GapPayload = Pick<
  GapsFeed,
  "gaps" | "summary" | "asOf" | "error" | "coverage"
>;
const EMPTY_SUMMARY = { oddsFirst: 0, actionable: 0, topScore: 0 };

export function useGapsFeed(window: GapWindow): GapsFeed {
  const markets = useMarkets();
  const gaps = useQuery({
    queryKey: ["gaps", window],
    queryFn: ({ signal }) =>
      readJson<GapPayload>(`/api/gaps?window=${window}`, signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  });
  const events = useQuery({
    queryKey: ["events"],
    queryFn: ({ signal }) =>
      readJson<{ events: FeedMappedEvent[] }>("/api/events", signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  });
  return {
    gaps: gaps.data?.gaps ?? [],
    coverage: gaps.data?.coverage,
    summary: gaps.data?.summary ?? EMPTY_SUMMARY,
    events: events.data?.events ?? [],
    tickers: markets.tickers,
    asOf: gaps.data?.asOf ?? 0,
    error:
      gaps.error?.message ??
      (gaps.data?.error
        ? "Signals could not refresh. Last available values are shown."
        : null) ??
      events.error?.message ??
      markets.error,
    loading: gaps.isPending,
    retry: () => {
      void gaps.refetch();
      void events.refetch();
      markets.retry();
    },
  };
}
