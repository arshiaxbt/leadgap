"use client";

import { useEffect, useState } from "react";
import { isActionable } from "@/lib/score";
import type { GapRow, GapWindow, PerpsTicker } from "@/lib/types";

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
  loading: boolean;
};

export function useGapsFeed(window: GapWindow): GapsFeed {
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [summary, setSummary] = useState({ oddsFirst: 0, actionable: 0, topScore: 0 });
  const [events, setEvents] = useState<FeedMappedEvent[]>([]);
  const [tickers, setTickers] = useState<Record<string, PerpsTicker>>({});
  const [asOf, setAsOf] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [gapRes, eventRes, mktRes] = await Promise.all([
          fetch(`/api/gaps?window=${window}`),
          fetch("/api/events"),
          fetch("/api/markets").catch(() => null),
        ]);
        if (!gapRes.ok) throw new Error(`Gaps unavailable (${gapRes.status}).`);
        const data = (await gapRes.json()) as {
          gaps: GapRow[];
          asOf: number;
          error: string | null;
          summary?: { oddsFirst: number; actionable: number; topScore: number };
        };
        const ev = (await eventRes.json()) as { events?: FeedMappedEvent[] };
        const mkt =
          mktRes && mktRes.ok
            ? ((await mktRes.json()) as { tickers?: Record<string, PerpsTicker> })
            : { tickers: {} };
        if (stop) return;
        const rows = data.gaps ?? [];
        setGaps(rows);
        setSummary(
          data.summary ?? {
            oddsFirst: rows.filter((g) => g.leader === "odds" && !isActionable(g)).length,
            actionable: rows.filter(isActionable).length,
            topScore: rows[0]?.score ?? 0,
          },
        );
        setEvents(ev.events ?? []);
        setTickers(mkt.tickers ?? {});
        setAsOf(data.asOf);
        setError(data.error);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load markets.");
      } finally {
        if (!stop) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [window]);

  return { gaps, summary, events, tickers, asOf, error, loading };
}
