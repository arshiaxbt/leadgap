"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { Blotter } from "@/components/desk/Blotter";
import { EventIntel } from "@/components/desk/EventIntel";
import { OrderBookPanel } from "@/components/desk/OrderBookPanel";
import { PriceChart } from "@/components/desk/PriceChart";
import { TickerStrip } from "@/components/desk/TickerStrip";
import { OrderTicket } from "@/components/OrderTicket";
import { chartStory, thesisLine } from "@/lib/signal";
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

const XL = "(min-width: 1280px)";

function subscribeXl(onStoreChange: () => void) {
  const mq = window.matchMedia(XL);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function xlMatches() {
  return window.matchMedia(XL).matches;
}

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
  const wide = useSyncExternalStore(subscribeXl, xlMatches, () => false);
  const cols = useDefaultLayout({
    id: "leadgap-desk-h",
    panelIds: ["intel", "chart", "book", "ticket"],
    onlySaveAfterUserInteractions: true,
  });
  const rows = useDefaultLayout({
    id: "leadgap-desk-v",
    panelIds: ["main", "blotter"],
    onlySaveAfterUserInteractions: true,
  });

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
  const selectedGap = eventId ? gaps.find((g) => g.eventId === eventId) : gaps[0];
  const story = selectedGap ? chartStory(selectedGap.leader) : undefined;

  const tickerStrip = (
    <TickerStrip
      instrument={instrument}
      ticker={ticker}
      instruments={instruments}
      interval={klineInterval}
      onInterval={setKlineInterval}
    />
  );
  const intelPanel = (
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
  );
  const chartPanel = (
    <PriceChart
      key={`${instrument.instrumentId}-${klineInterval}`}
      candles={candles}
      odds={selectedOdds}
      interval={klineInterval}
      oddsLabel={events.find((e) => e.id === eventId)?.title ?? "Yes ¢"}
      gapMarks={(tape ?? []).filter((p) => p.symbol === instrument.symbol && (!eventId || p.eventId === eventId))}
      story={story}
    />
  );
  const bookPanel = (
    <OrderBookPanel book={book} decimals={instrument.priceDecimals} onPrice={(p) => setClickPrice(String(p))} />
  );
  const ticketPanel = (
    <OrderTicket
      instrument={instrument}
      ticker={ticker}
      price={clickPrice}
      thesis={selectedGap ? thesisLine(selectedGap) : undefined}
      bias={selectedGap?.bias}
    />
  );
  const blotterPanel = <Blotter instrumentId={instrument.instrumentId} />;

  if (wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tickerStrip}
        <Group
          id="leadgap-desk-v"
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={rows.defaultLayout}
          onLayoutChanged={rows.onLayoutChanged}
        >
          <Panel id="main" minSize={240} className="min-h-0 overflow-hidden">
            <Group
              id="leadgap-desk-h"
              orientation="horizontal"
              className="h-full"
              defaultLayout={cols.defaultLayout}
              onLayoutChanged={cols.onLayoutChanged}
            >
              <Panel
                id="intel"
                defaultSize={220}
                minSize={168}
                maxSize={420}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0 overflow-hidden"
              >
                {intelPanel}
              </Panel>
              <Separator className="desk-handle" />
              <Panel id="chart" minSize={280} className="min-h-0 overflow-hidden">
                {chartPanel}
              </Panel>
              <Separator className="desk-handle" />
              <Panel
                id="book"
                defaultSize={184}
                minSize={140}
                maxSize={360}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0 overflow-hidden"
              >
                {bookPanel}
              </Panel>
              <Separator className="desk-handle" />
              <Panel
                id="ticket"
                defaultSize={252}
                minSize={200}
                maxSize={420}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0 overflow-hidden"
              >
                {ticketPanel}
              </Panel>
            </Group>
          </Panel>
          <Separator className="desk-handle" />
          <Panel
            id="blotter"
            defaultSize={92}
            minSize={64}
            maxSize={280}
            groupResizeBehavior="preserve-pixel-size"
            className="min-h-0 overflow-hidden"
          >
            {blotterPanel}
          </Panel>
        </Group>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto">
      {tickerStrip}
      <div className="min-h-[280px] border-b border-[#1a2030]">{chartPanel}</div>
      <div className="min-h-[200px] border-b border-[#1a2030]">{intelPanel}</div>
      <div className="min-h-[240px] border-b border-[#1a2030]">{bookPanel}</div>
      <div className="min-h-[240px] border-b border-[#1a2030]">{ticketPanel}</div>
      <div className="min-h-[92px]">{blotterPanel}</div>
    </div>
  );
}
