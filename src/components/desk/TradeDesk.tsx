"use client";
import Link from "next/link";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";
import { Blotter } from "@/components/desk/Blotter";
import { EventRail } from "@/components/desk/EventRail";
import { OrderBookPanel } from "@/components/desk/OrderBookPanel";
import { TickerStrip } from "@/components/desk/TickerStrip";
import type { TicketPreview } from "@/components/OrderTicket";
import { APP_NAME } from "@/lib/brand";
import { readJson } from "@/lib/http";
import { fmtPx } from "@/lib/format";
import { chartStory, thesisLine } from "@/lib/signal";
import { trackEvent } from "@/lib/track";
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
import { cn } from "@/lib/utils";

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

type DeskTab = "chart" | "book" | "trade" | "event" | "positions";

const XL = "(min-width: 1280px)";
const INTERVALS: KlineInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

const PriceChart = dynamic(
  () => import("@/components/desk/PriceChart").then((m) => m.PriceChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[240px] animate-pulse bg-[var(--hover)]" />
    ),
  },
);

const OrderTicket = dynamic(
  () => import("@/components/OrderTicket").then((m) => m.OrderTicket),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[200px] animate-pulse bg-[var(--hover)]" />
    ),
  },
);

function subscribeXl(onStoreChange: () => void) {
  const mq = window.matchMedia(XL);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function xlMatches() {
  return window.matchMedia(XL).matches;
}

function readInterval(symbol: string): KlineInterval {
  try {
    const v = sessionStorage.getItem(`lg-interval:${symbol}`);
    if (INTERVALS.includes(v as KlineInterval)) return v as KlineInterval;
  } catch {
    // ignore
  }
  return "5m";
}

export function TradeDesk({ symbol }: { symbol: string }) {
  const search = useSearchParams();
  const eventParam = search.get("event");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(eventParam);
  const [klineInterval, setKlineInterval] = useState<KlineInterval>(() =>
    readInterval(symbol),
  );
  const [candles, setCandles] = useState<Candle[]>([]);
  const [book, setBook] = useState<PerpsBook | null>(null);
  const [clickPrice, setClickPrice] = useState<string | undefined>();
  const [chartOdds, setChartOdds] = useState<
    { token: string; points: Snapshot[] } | undefined
  >();
  const [preview, setPreview] = useState<TicketPreview | null>(null);
  const [tab, setTab] = useState<DeskTab>("chart");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const wide = useSyncExternalStore(subscribeXl, xlMatches, () => false);
  const cols = useDefaultLayout({
    id: "leadgap-desk-h3",
    panelIds: ["cluster", "side"],
    onlySaveAfterUserInteractions: true,
  });
  const rows = useDefaultLayout({
    id: "leadgap-desk-v2",
    panelIds: ["chartbook", "blotter"],
    onlySaveAfterUserInteractions: true,
  });
  const chartBook = useDefaultLayout({
    id: "leadgap-desk-cb",
    panelIds: ["chart", "book"],
    onlySaveAfterUserInteractions: true,
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(`lg-interval:${symbol}`, klineInterval);
    } catch {
      // ignore
    }
  }, [klineInterval, symbol]);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const json = await readJson<Payload>(
          `/api/assets/${encodeURIComponent(symbol)}`,
        );
        if (stop) return;
        setData(json);
        setError(null);
        const best = [...(json.gaps ?? [])].sort(
          (a, b) => b.score - a.score,
        )[0];
        setEventId(
          (cur) =>
            cur ?? eventParam ?? best?.eventId ?? json.events[0]?.id ?? null,
        );
      } catch {
        if (!stop) setError("Couldn’t refresh this market. Please retry.");
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [eventParam, symbol]);

  useEffect(() => {
    trackEvent("open_market", { symbol });
  }, [symbol]);

  const instrumentId = data?.instrument.instrumentId;

  useEffect(() => {
    if (!instrumentId) return;
    let stop = false;
    async function loadCandles() {
      try {
        const res = await fetch(
          `/api/klines?instrumentId=${instrumentId}&interval=${klineInterval}`,
        );
        if (!res.ok) return;
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
        const res = await fetch(
          `/api/book?instrumentId=${instrumentId}&depth=100`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as PerpsBook;
        if (!stop) setBook(json);
      } catch {
        // keep last book
      }
    }
    loadBook();
    const id = setInterval(loadBook, 2500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [instrumentId]);

  const selectedOdds = useMemo(() => {
    const live = eventId && data ? data.oddsHistory[eventId] : undefined;
    const token = data?.events.find((e) => e.id === eventId)?.yesTokenId;
    if (
      chartOdds?.token === token &&
      chartOdds &&
      chartOdds.points.length >= (live?.length ?? 0)
    )
      return chartOdds.points;
    return live;
  }, [chartOdds, data, eventId]);

  const yesTokenId =
    data?.events.find((e) => e.id === eventId)?.yesTokenId ?? null;

  useEffect(() => {
    if (!yesTokenId) return;
    let stop = false;
    fetch(`/api/odds?tokenId=${encodeURIComponent(yesTokenId)}`)
      .then((r) => r.json())
      .then((json: { odds?: Snapshot[] }) => {
        if (!stop)
          setChartOdds({ token: yesTokenId!, points: json.odds ?? [] });
      })
      .catch(() => {
        if (!stop) setChartOdds(undefined);
      });
    return () => {
      stop = true;
    };
  }, [yesTokenId]);

  useEffect(() => {
    const mark = data?.ticker?.markPrice;
    const base = symbol.replace("-USD", "");
    const fallback = `${base} · ${APP_NAME}`;
    if (mark == null || !Number.isFinite(mark)) return undefined;
    const shown =
      Math.abs(mark) >= 100
        ? mark.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : fmtPx(mark, data?.instrument.priceDecimals ?? 2);
    const next = `${shown} | ${base} · ${APP_NAME}`;
    const apply = () => {
      if (document.title !== next) document.title = next;
    };
    apply();
    const titleEl = document.querySelector("title");
    if (!titleEl) {
      return () => {
        document.title = fallback;
      };
    }
    const observer = new MutationObserver(apply);
    observer.observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      document.title = fallback;
    };
  }, [data?.instrument.priceDecimals, data?.ticker?.markPrice, symbol]);

  if (error && !data)
    return (
      <div className="m-auto max-w-md p-8">
        <h1 className="text-2xl">Market unavailable</h1>
        <p className="mt-3 text-[var(--muted)]">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="lg-focus mt-6 rounded-md border border-[var(--line-strong)] px-4 py-2"
        >
          Retry
        </button>
        <Link href="/markets" className="ml-4 text-sm underline">
          Browse markets
        </Link>
      </div>
    );
  if (!data)
    return <div className="m-4 h-full animate-pulse bg-[var(--hover)]" />;

  const {
    instrument,
    ticker,
    events,
    news,
    gaps,
    oddsHistory,
    instruments,
    markHistory,
    windows,
    tape,
  } = data;
  const selectedGap = eventId
    ? gaps.find((g) => g.eventId === eventId)
    : gaps[0];
  const story = selectedGap ? chartStory(selectedGap.leader) : undefined;

  function toggleRail() {
    setRailCollapsed((v) => !v);
  }

  const tickerStrip = (
    <TickerStrip
      instrument={instrument}
      ticker={ticker}
      instruments={instruments}
      events={events}
      preview={preview}
    />
  );
  const intelPanel = (
    <EventRail
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
      collapsed={wide && railCollapsed}
      onToggle={wide ? toggleRail : undefined}
    />
  );
  const chartPanel = (
    <PriceChart
      candles={candles}
      odds={selectedOdds}
      interval={klineInterval}
      onInterval={setKlineInterval}
      oddsLabel={events.find((e) => e.id === eventId)?.title ?? "Yes %"}
      gapMarks={(tape ?? []).filter(
        (p) =>
          p.symbol === instrument.symbol && (!eventId || p.eventId === eventId),
      )}
      story={story}
      decimals={instrument.priceDecimals}
    />
  );
  const bookPanel = (
    <OrderBookPanel
      book={book}
      decimals={instrument.priceDecimals}
      onPrice={(p) => {
        setClickPrice(p.toFixed(instrument.priceDecimals));
        setTab("trade");
      }}
    />
  );
  const ticketPanel = (
    <OrderTicket
      key={`${instrument.symbol}:${eventId ?? ""}:${clickPrice ?? ""}`}
      instrument={instrument}
      ticker={ticker}
      price={clickPrice}
      thesis={selectedGap ? thesisLine(selectedGap) : undefined}
      bias={selectedGap?.bias}
      onPreview={setPreview}
    />
  );
  const blotterPanel = (
    <Blotter
      instrumentId={instrument.instrumentId}
      preview={preview}
      ticker={ticker}
      priceDecimals={instrument.priceDecimals}
      symbol={instrument.symbol}
    />
  );

  if (wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <p className="workspace-error" role="alert">
            {error}
          </p>
        ) : null}
        {tickerStrip}
        <Group
          id="leadgap-desk-h3"
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={cols.defaultLayout}
          onLayoutChanged={cols.onLayoutChanged}
        >
          <Panel id="cluster" minSize={280} className="min-h-0 overflow-hidden">
            <Group
              id="leadgap-desk-v2"
              orientation="vertical"
              className="h-full"
              defaultLayout={rows.defaultLayout}
              onLayoutChanged={rows.onLayoutChanged}
            >
              <Panel
                id="chartbook"
                minSize={200}
                className="min-h-0 overflow-hidden"
              >
                <Group
                  id="leadgap-desk-cb"
                  orientation="horizontal"
                  className="h-full"
                  defaultLayout={chartBook.defaultLayout}
                  onLayoutChanged={chartBook.onLayoutChanged}
                >
                  <Panel
                    id="chart"
                    minSize={220}
                    className="min-h-0 overflow-hidden"
                  >
                    {chartPanel}
                  </Panel>
                  <Separator className="desk-handle" />
                  <Panel
                    id="book"
                    defaultSize={200}
                    minSize={140}
                    maxSize={360}
                    groupResizeBehavior="preserve-pixel-size"
                    className="min-h-0 overflow-hidden"
                  >
                    {bookPanel}
                  </Panel>
                </Group>
              </Panel>
              <Separator className="desk-handle" />
              <Panel
                id="blotter"
                defaultSize={140}
                minSize={72}
                maxSize={280}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0 overflow-hidden"
              >
                {blotterPanel}
              </Panel>
            </Group>
          </Panel>
          <Separator className="desk-handle" />
          <Panel
            id="side"
            defaultSize={600}
            minSize={560}
            maxSize={760}
            groupResizeBehavior="preserve-pixel-size"
            className="min-h-0 overflow-hidden"
          >
            <div className="flex h-full min-h-0 min-w-0">
              <div
                className={cn(
                  "min-h-0 shrink-0 overflow-hidden border-r border-[var(--line)]",
                  railCollapsed ? "w-10" : "w-[264px]",
                )}
              >
                {intelPanel}
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {ticketPanel}
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    );
  }

  const tabs: { id: DeskTab; label: string }[] = [
    { id: "chart", label: "Chart" },
    { id: "book", label: "Book" },
    { id: "trade", label: "Trade" },
    { id: "event", label: "Event" },
    { id: "positions", label: "Positions" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {error ? (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      ) : null}
      {tickerStrip}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--line)] px-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "lg-focus shrink-0 border-b-2 px-3 py-3 text-[13px]",
              tab === item.id
                ? "border-[var(--text)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "chart" ? chartPanel : null}
        {tab === "book" ? bookPanel : null}
        {tab === "trade" ? ticketPanel : null}
        {tab === "event" ? intelPanel : null}
        {tab === "positions" ? blotterPanel : null}
      </div>
    </div>
  );
}
