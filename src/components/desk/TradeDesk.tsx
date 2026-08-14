"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Blotter } from "@/components/desk/Blotter";
import { EventIntel } from "@/components/desk/EventIntel";
import { OrderBookPanel } from "@/components/desk/OrderBookPanel";
import { PriceChart } from "@/components/desk/PriceChart";
import { TickerStrip } from "@/components/desk/TickerStrip";
import { OrderTicket } from "@/components/OrderTicket";
import type {
  Candle,
  GapRow,
  GapTapePoint,
  GapWindow,
  KlineInterval,
  MapRow,
  NewsItem,
  PerpsBook,
  PerpsInstrument,
  PerpsTicker,
  ResolvedEvent,
  Snapshot,
} from "@/lib/types";

type Payload = {
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
};

export function TradeDesk({ symbol }: { symbol: string }) {
  const search = useSearchParams();
  const eventParam = search.get("event");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(eventParam);
  const [klineInterval, setKlineInterval] = useState<KlineInterval>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [book, setBook] = useState<PerpsBook | null>(null);
  const [clickPrice, setClickPrice] = useState<string | undefined>();
  const [chartOdds, setChartOdds] = useState<Snapshot[] | undefined>();

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch(`/api/assets/${encodeURIComponent(symbol)}`);
        if (!res.ok) {
          if (!stop) setError(res.status === 404 ? "Market not found." : "Couldn't load this market.");
          return;
        }
        const json = (await res.json()) as Payload;
        if (stop) return;
        setData(json);
        const best = [...(json.gaps ?? [])].sort((a, b) => b.score - a.score)[0];
        setEventId((cur) => cur ?? eventParam ?? best?.eventId ?? json.events[0]?.id ?? null);
      } catch {
        if (!stop) setError("Market not found.");
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [eventParam, symbol]);

  const instrumentId = data?.instrument.instrumentId;

  useEffect(() => {
    if (!instrumentId) return;
    let stop = false;
    async function loadCandles() {
      try {
        const res = await fetch(`/api/klines?instrumentId=${instrumentId}&interval=${klineInterval}`);
        const json = (await res.json()) as { candles?: Candle[] };
        if (!stop) setCandles(json.candles ?? []);
      } catch {
        // keep last candles
      }
    }
    loadCandles();
    const id = setInterval(loadCandles, 15_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [instrumentId, klineInterval]);

  useEffect(() => {
    if (!instrumentId) return;
    let stop = false;
    async function loadBook() {
      try {
        const res = await fetch(`/api/book?instrumentId=${instrumentId}&depth=100`);
        if (!res.ok) return;
        const json = (await res.json()) as PerpsBook;
        if (!stop) setBook(json);
      } catch {
        // keep last book
      }
    }
    loadBook();
    const id = setInterval(loadBook, 1200);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [instrumentId]);

  const selectedOdds = useMemo(() => {
    const live = eventId && data ? data.oddsHistory[eventId] : undefined;
    if (chartOdds && chartOdds.length >= (live?.length ?? 0)) return chartOdds;
    return live;
  }, [chartOdds, data, eventId]);

  const yesTokenId = data?.events.find((e) => e.id === eventId)?.yesTokenId ?? null;

  useEffect(() => {
    if (!yesTokenId) {
      setChartOdds(undefined);
      return;
    }
    let stop = false;
    fetch(`/api/odds?tokenId=${encodeURIComponent(yesTokenId)}`)
      .then((r) => r.json())
      .then((json: { odds?: Snapshot[] }) => {
        if (!stop) setChartOdds(json.odds ?? []);
      })
      .catch(() => {
        if (!stop) setChartOdds(undefined);
      });
    return () => {
      stop = true;
    };
  }, [yesTokenId]);

  if (error) return <p className="p-6 text-sm text-rose-300">{error}</p>;
  if (!data) return <div className="m-4 h-full animate-pulse rounded-xl bg-white/5" />;

  const { instrument, ticker, events, news, gaps, oddsHistory, instruments, markHistory, windows, tape } = data;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)_200px_236px] xl:grid-rows-[32px_minmax(0,1fr)_128px]">
      <div className="order-1 xl:col-span-4 xl:row-start-1">
        <TickerStrip
          instrument={instrument}
          ticker={ticker}
          instruments={instruments}
          interval={klineInterval}
          onInterval={setKlineInterval}
        />
      </div>
      <div className="order-2 min-h-[280px] border-b border-[#1a2030] xl:col-start-2 xl:row-start-2 xl:min-h-0 xl:border-b-0">
        <PriceChart
          key={`${instrument.instrumentId}-${klineInterval}`}
          candles={candles}
          odds={selectedOdds}
          interval={klineInterval}
          oddsLabel={events.find((e) => e.id === eventId)?.title ?? "Yes ¢"}
        />
      </div>
      <div className="order-3 min-h-[200px] border-b border-[#1a2030] xl:col-start-1 xl:row-start-2 xl:row-span-2 xl:min-h-0 xl:border-b-0 xl:border-r">
        <EventIntel
          symbol={instrument.symbol}
          events={events}
          selectedId={eventId}
          onSelect={setEventId}
          gaps={gaps}
          windows={windows}
          oddsHistory={oddsHistory}
          markHistory={markHistory}
          tape={tape}
          news={news}
        />
      </div>
      <div className="order-4 min-h-[280px] border-b border-[#1a2030] xl:col-start-3 xl:row-start-2 xl:min-h-0 xl:border-b-0 xl:border-l">
        <OrderBookPanel
          book={book}
          decimals={instrument.priceDecimals}
          onPrice={(p) => setClickPrice(String(p))}
        />
      </div>
      <div className="order-5 min-h-[240px] xl:col-start-4 xl:row-start-2 xl:row-span-2 xl:min-h-0 xl:border-l xl:border-[#1a2030]">
        <OrderTicket instrument={instrument} ticker={ticker} price={clickPrice} />
      </div>
      <div className="order-6 min-h-[140px] xl:col-start-2 xl:col-span-2 xl:row-start-3 xl:min-h-0">
        <Blotter instrumentId={instrument.instrumentId} />
      </div>
    </div>
  );
}
