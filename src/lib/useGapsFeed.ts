"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
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
  coverage?: import("./research").ResearchSnapshot["coverage"];
  loading: boolean;
  retry: () => void;
};
export type GapPayload = Pick<
  GapsFeed,
  "gaps" | "summary" | "asOf" | "error" | "coverage"
> & { modelVersion?: string };
const EMPTY_SUMMARY = { oddsFirst: 0, actionable: 0, topScore: 0 };

/** One cache entry per window, shared by every view that reads signals. */
export function gapsQuery(window: GapWindow) {
  return queryOptions({
    queryKey: ["gaps", window],
    queryFn: ({ signal }) =>
      readJson<GapPayload>(`/api/gaps?window=${window}`, signal),
    refetchInterval: 15_000,
    staleTime: 5_000,
    retry: 1,
  });
}

export const eventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: ({ signal }) =>
    readJson<{ events: FeedMappedEvent[] }>("/api/events", signal),
  refetchInterval: 15_000,
  staleTime: 5_000,
  retry: 1,
});

export function feedError(payload: GapPayload | undefined, error: Error | null) {
  return (
    error?.message ??
    (payload?.error
      ? "Signals could not refresh. Last available values are shown."
      : null)
  );
}

export function useGapsFeed(window: GapWindow): GapsFeed {
  const markets = useMarkets();
  const gaps = useQuery(gapsQuery(window));
  const events = useQuery(eventsQuery);
  return {
    gaps: gaps.data?.gaps ?? [],
    coverage: gaps.data?.coverage,
    summary: gaps.data?.summary ?? EMPTY_SUMMARY,
    events: events.data?.events ?? [],
    tickers: markets.tickers,
    asOf: gaps.data?.asOf ?? 0,
    error:
      feedError(gaps.data, gaps.error) ??
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
