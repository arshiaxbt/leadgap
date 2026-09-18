"use client";
import { useEffect, useState } from "react";
import { acceptStreamMessage, streamLevels } from "./stream-data";
import type { PerpsBook, PerpsTicker } from "./types";
export function usePerpsStream(instrumentId: number | undefined) {
  const [state, setState] = useState<{
    id: number;
    book?: PerpsBook;
    ticker?: Omit<PerpsTicker, "symbol" | "change1h">;
    status: "connecting" | "live" | "reconnecting" | "delayed";
  }>();
  useEffect(() => {
    if (!instrumentId || process.env.NEXT_PUBLIC_ENABLE_STREAMING !== "true")
      return;
    let stopped = false,
      lastBook = 0,
      lastTicker = 0,
      lastPaint = 0,
      handle: { close(): Promise<void> } | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0,
      connectedAt = Date.now();
    const health = setInterval(() => {
      if (
        Date.now() -
          Math.min(lastBook || connectedAt, lastTicker || connectedAt) >
        15_000
      ) {
        setState((s) => (s ? { ...s, status: "delayed" } : s));
        void handle?.close().catch(() => {});
      }
    }, 3000);
    async function connect() {
      connectedAt = Date.now();
      lastBook = 0;
      lastTicker = 0;
      lastPaint = 0;
      setState((s) => ({
        ...s,
        id: instrumentId!,
        status: attempt ? "reconnecting" : "connecting",
      }));
      let bookSequence = -1,
        tickerSequence = -1;
      try {
        const { createPublicClient } = await import("@polymarket/client");
        if (stopped) return;
        const subscription = await createPublicClient().subscribe([
          { topic: "perps.book", instrumentId: instrumentId! },
          { topic: "perps.tickers", instrumentId: instrumentId! },
        ] as const);
        handle = subscription;
        if (stopped) {
          await subscription.close();
          return;
        }
        for await (const event of subscription) {
          if (stopped) break;
          if (
            Date.now() - event.timestamp > 15_000 ||
            event.timestamp > Date.now() + 5000
          )
            continue;
          if (event.topic === "perps.book") {
            if (!acceptStreamMessage(event, instrumentId!, bookSequence))
              continue;
            bookSequence = event.sequence;
            lastBook = Date.now();
            if (lastBook - lastPaint < 250) continue;
            lastPaint = lastBook;
            const book: PerpsBook = {
              instrumentId: instrumentId!,
              timestamp: event.timestamp,
              bids: streamLevels(event.payload.bids, "bids"),
              asks: streamLevels(event.payload.asks, "asks"),
            };
            setState((s) => ({
              ...s,
              id: instrumentId!,
              book,
              status: Date.now() - lastTicker < 15_000 ? "live" : "connecting",
            }));
          } else if (event.topic === "perps.tickers") {
            if (!acceptStreamMessage(event, instrumentId!, tickerSequence))
              continue;
            const p = event.payload;
            const ticker = {
              instrumentId: instrumentId!,
              timestamp: event.timestamp,
              indexPrice: Number(p.indexPrice),
              markPrice: Number(p.markPrice),
              lastPrice: Number(p.lastPrice),
              midPrice: Number(p.midPrice),
              openInterest: Number(p.openInterest),
              fundingRate: Number(p.fundingRate),
              nextFunding: p.nextFunding,
            };
            if (
              !Object.values(ticker).every(Number.isFinite) ||
              ticker.markPrice <= 0
            )
              continue;
            tickerSequence = event.sequence;
            lastTicker = Date.now();
            setState((s) => ({
              ...s,
              id: instrumentId!,
              ticker,
              status: Date.now() - lastBook < 15_000 ? "live" : "connecting",
            }));
          }
          attempt = 0;
        }
      } catch {
        /* Polling continues until a fresh subscription is available. */
      } finally {
        await handle?.close().catch(() => {});
        handle = undefined;
      }
      if (!stopped) {
        attempt++;
        setState((s) => (s ? { ...s, status: "reconnecting" } : s));
        retry = setTimeout(
          () => void connect(),
          Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)),
        );
      }
    }
    void connect();
    return () => {
      stopped = true;
      clearInterval(health);
      clearTimeout(retry);
      void handle?.close().catch(() => {});
    };
  }, [instrumentId]);
  return state?.id === instrumentId ? state : undefined;
}
