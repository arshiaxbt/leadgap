"use client";

import { useEffect, useState } from "react";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

export type MarketsPayload = {
  instruments: PerpsInstrument[];
  tickers: Record<string, PerpsTicker>;
  eventCounts: Record<string, number>;
  error: string | null;
  asOf: number;
};

const EMPTY_COUNTS: Record<string, number> = {};

export function useMarkets(): MarketsPayload & { loading: boolean } {
  const [data, setData] = useState<MarketsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch("/api/markets");
      const json = (await res.json()) as {
        instruments?: PerpsInstrument[];
        tickers?: Record<string, PerpsTicker>;
        eventCounts?: Record<string, number>;
        error: string | null;
        asOf: number;
      };
      if (stop) return;
      setData({
        instruments: json.instruments ?? [],
        tickers: json.tickers ?? {},
        eventCounts: json.eventCounts ?? EMPTY_COUNTS,
        error: json.error,
        asOf: json.asOf,
      });
      setLoading(false);
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  return {
    instruments: data?.instruments ?? [],
    tickers: data?.tickers ?? {},
    eventCounts: data?.eventCounts ?? EMPTY_COUNTS,
    error: data?.error ?? null,
    asOf: data?.asOf ?? 0,
    loading,
  };
}
