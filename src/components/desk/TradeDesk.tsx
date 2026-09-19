"use client";
import { usePerpsStream } from "@/lib/usePerpsStream";
import Link from "next/link";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";
import { Blotter } from "@/components/desk/Blotter";
import { EventRail } from "@/components/desk/EventRail";
import { GapBar, GapStrip } from "@/components/desk/GapBar";
import { useNow } from "@/components/signal/FeedStamp";
import { OrderBookPanel } from "@/components/desk/OrderBookPanel";
import { TickerStrip } from "@/components/desk/TickerStrip";
import type { TicketPreview } from "@/components/OrderTicket";
import { APP_NAME } from "@/lib/brand";
import { GAP_WINDOWS, WINDOW_MS, eventTitleKey } from "@/lib/divergence";
import { readJson } from "@/lib/http";
import { fmtPct, fmtPx, signedClass } from "@/lib/format";
import { impliedMove, modelForRow } from "@/lib/sensitivity";
import { thesisLine } from "@/lib/signal";
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

// The panel library defaults to the browser's localStorage during render.
// Supply storage explicitly so SSR and privacy-restricted browsers both work.
const layoutStorage = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Layout persistence is optional. */
    }
  },
};

function readWindow(value: string | null): GapWindow {
  return GAP_WINDOWS.includes(value as GapWindow) ? (value as GapWindow) : "4h";
}

export function TradeDesk({ symbol }: { symbol: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const eventParam = search.get("event");
  const [deskWindow, setDeskWindow] = useState<GapWindow>(() =>
    readWindow(search.get("window")),
  );
  const windowRef = useRef(deskWindow);
  useEffect(() => {
    windowRef.current = deskWindow;
  }, [deskWindow]);
  const [ticketSide, setTicketSide] = useState<"BUY" | "SELL" | undefined>();
  const now = useNow(5000);
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
  const wide = useSyncExternalStore(subscribeXl, xlMatches, () => false);
  const cols = useDefaultLayout({
    storage: layoutStorage,
    id: "leadgap-desk-h5",
    panelIds: ["cluster", "side"],
    onlySaveAfterUserInteractions: true,
  });
  const rows = useDefaultLayout({
    storage: layoutStorage,
    id: "leadgap-desk-v3",
    panelIds: ["chartbook", "blotter"],
    onlySaveAfterUserInteractions: true,
  });
  const chartBook = useDefaultLayout({
    storage: layoutStorage,
    id: "leadgap-desk-cb2",
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
        const best = [
          ...(json.windows?.[windowRef.current] ?? json.gaps ?? []),
        ].sort((a, b) => b.score - a.score)[0];
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
  const stream = usePerpsStream(instrumentId);
  const streamLive = stream?.status === "live";

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
    const id = setInterval(loadBook, streamLive ? 30_000 : 2500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [instrumentId, streamLive]);

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

  function changeWindow(next: GapWindow) {
    setDeskWindow(next);
    const url = new URL(globalThis.location.href);
    url.searchParams.set("window", next);
    globalThis.history.replaceState(null, "", url);
  }

  if (error && !data)
    return (
      <div className="m-auto max-w-md p-8 text-center">
        <p className="kicker">{symbol.replace("-USD", "")} desk</p>
        <h1 className="serif mt-3 text-[30px]">Market unavailable</h1>
        <p className="mt-3 text-[13px] leading-[1.65] text-subtle">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="lg-focus h-9 rounded-[7px] bg-odds px-4 text-[13px] font-semibold text-on-odds"
          >
            Retry
          </button>
          <Link
            href="/markets"
            className="lg-focus inline-flex h-9 items-center rounded-[7px] border border-line-strong px-4 text-[13px] text-subtle hover:text-text"
          >
            Browse markets
          </Link>
        </div>
      </div>
    );
  if (!data)
    return (
      <div aria-busy="true" aria-label="Loading market" className="flex min-h-0 flex-1 flex-col">
        <div className="h-[60px] border-b border-line bg-chrome" />
        <div className="h-[46px] border-b border-line bg-surface" />
        <div className="m-4 flex-1 rounded-[10px] bg-raise" />
      </div>
    );

  const {
    instrument,
    ticker: snapshotTicker,
    events,
    news,
    gaps,
    oddsHistory,
    instruments,
    markHistory,
    windows,
    tape,
  } = data;
  const ticker =
    stream?.ticker && stream.ticker.timestamp > (snapshotTicker?.timestamp ?? 0)
      ? {
          ...snapshotTicker,
          ...stream.ticker,
          symbol: instrument.symbol,
          change1h: snapshotTicker?.change1h ?? null,
        }
      : snapshotTicker;
  const liveBook =
    stream?.book && stream.book.timestamp > (book?.timestamp ?? 0)
      ? stream.book
      : book;
  const tickerStale = !ticker || (now > 0 && now - ticker.timestamp > 90_000);
  const status = stream
    ? stream.status === "live"
      ? { label: "STREAMING", warn: false }
      : stream.status === "delayed"
        ? { label: "STREAM DELAYED · POLLING", warn: true }
        : stream.status === "reconnecting"
          ? { label: "RECONNECTING · POLLING", warn: true }
          : { label: "CONNECTING · POLLING", warn: false }
    : { label: tickerStale ? "DELAYED" : "POLLING", warn: tickerStale };
  const deskEvents = (() => {
    const seen = new Set<string>();
    const rows = windows?.[deskWindow] ?? gaps;
    return events
      .filter((item) => {
        const key = eventTitleKey(item.title) || item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          (rows.find((g) => g.eventId === b.id)?.score ?? 0) -
          (rows.find((g) => g.eventId === a.id)?.score ?? 0),
      );
  })();
  const event = deskEvents.find((e) => e.id === eventId) ?? deskEvents[0];
  const windowRows = windows?.[deskWindow] ?? (deskWindow === "15m" ? gaps : []);
  const selectedGap = event
    ? windowRows.find((g) => g.eventId === event.id)
    : undefined;
  const link = event?.perps.find((p) => p.symbol === instrument.symbol);
  const chartModel = !event
    ? null
    : selectedGap
      ? modelForRow(selectedGap, event)
      : link
        ? ({ kind: "linear", beta: link.signedBeta, source: "mapping" } as const)
        : null;
  const impliedForChart = chartModel
    ? (pThen: number, pNow: number, tThen: number, tNow: number) =>
        impliedMove(chartModel, pThen, pNow, tThen, tNow)
    : undefined;

  const intelPanel = (
    <EventRail
      symbol={instrument.symbol}
      events={events}
      selectedId={event?.id ?? null}
      onSelect={setEventId}
      gaps={windowRows}
      window={deskWindow}
      oddsHistory={oddsHistory}
      markHistory={markHistory}
      news={news}
    />
  );
  const chartPanel = (
    <PriceChart
      candles={candles}
      odds={selectedOdds}
      interval={klineInterval}
      onInterval={setKlineInterval}
      oddsLabel={event?.title ?? "Yes %"}
      gapMarks={(tape ?? []).filter(
        (p) =>
          p.symbol === instrument.symbol && (!event || p.eventId === event.id),
      )}
      decimals={instrument.priceDecimals}
      implied={impliedForChart}
      impliedKey={`${event?.id ?? ""}:${selectedGap?.betaSource ?? "mapping"}:${selectedGap?.signedBeta ?? link?.signedBeta ?? ""}:${event?.endsAt ?? ""}`}
      windowMs={WINDOW_MS[deskWindow]}
      windowLabel={deskWindow}
    />
  );
  const bookPanel = (
    <OrderBookPanel
      book={liveBook}
      decimals={instrument.priceDecimals}
      onPrice={(p) => {
        setClickPrice(p.toFixed(instrument.priceDecimals));
        setTab("trade");
      }}
    />
  );
  const ticketPanel = (
    <OrderTicket
      key={`${instrument.symbol}:${event?.id ?? ""}:${clickPrice ?? ""}:${ticketSide ?? ""}`}
      instrument={instrument}
      ticker={ticker}
      price={clickPrice}
      side={ticketSide}
      thesis={selectedGap ? thesisLine(selectedGap) : undefined}
      bias={selectedGap?.bias}
      gap={selectedGap?.gap}
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
  const errorBanner = error ? (
    <p className="workspace-error mt-3" role="alert">
      {error}
    </p>
  ) : null;

  if (wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TickerStrip
          instrument={instrument}
          ticker={ticker}
          instruments={instruments}
          events={events}
          preview={preview}
          status={status}
        />
        <GapBar
          symbol={instrument.symbol}
          events={deskEvents}
          event={event}
          onSelect={setEventId}
          gap={selectedGap}
          window={deskWindow}
          onWindow={changeWindow}
        />
        {errorBanner}
        <Group
          id="leadgap-desk-h5"
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={cols.defaultLayout}
          onLayoutChanged={cols.onLayoutChanged}
        >
          <Panel id="cluster" minSize={420} className="min-h-0 overflow-hidden">
            <Group
              id="leadgap-desk-v3"
              orientation="vertical"
              className="h-full"
              defaultLayout={rows.defaultLayout}
              onLayoutChanged={rows.onLayoutChanged}
            >
              <Panel
                id="chartbook"
                minSize={220}
                className="min-h-0 overflow-hidden"
              >
                <Group
                  id="leadgap-desk-cb2"
                  orientation="horizontal"
                  className="h-full"
                  defaultLayout={chartBook.defaultLayout}
                  onLayoutChanged={chartBook.onLayoutChanged}
                >
                  <Panel
                    id="chart"
                    minSize={260}
                    className="min-h-0 overflow-hidden"
                  >
                    {chartPanel}
                  </Panel>
                  <Separator className="desk-handle" />
                  <Panel
                    id="book"
                    defaultSize={216}
                    minSize={180}
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
                defaultSize={120}
                minSize={88}
                maxSize={320}
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
            defaultSize={352}
            minSize={332}
            maxSize={520}
            groupResizeBehavior="preserve-pixel-size"
            className="min-h-0 overflow-hidden"
          >
            {ticketPanel}
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
  const change = ticker?.change1h ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-chrome px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="Back"
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push("/markets")
          }
          className="lg-focus -ml-1 rounded-[6px] p-1 text-subtle hover:text-text"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <h1
          className="flex items-baseline gap-2"
          aria-label={`${instrument.symbol.replace("-USD", "")} trading desk`}
        >
          <span className="text-[16px] font-semibold">
            {instrument.symbol.replace("-USD", "")}
          </span>
          <span className="num text-[10px] text-dim">PERP</span>
        </h1>
        <span className="num ml-auto text-[18px] font-medium">
          {ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}
        </span>
        <span className={cn("num text-[12px]", change != null ? signedClass(change) : "text-dim")}>
          {change != null ? fmtPct(change) : "—"}
        </span>
      </div>
      <div className="hidden md:contents">
        <TickerStrip
          instrument={instrument}
          ticker={ticker}
          instruments={instruments}
          events={events}
          preview={preview}
          status={status}
        />
        <GapBar
          symbol={instrument.symbol}
          events={deskEvents}
          event={event}
          onSelect={setEventId}
          gap={selectedGap}
          window={deskWindow}
          onWindow={changeWindow}
        />
      </div>
      <div className="md:hidden">
        <GapStrip
          symbol={instrument.symbol}
          event={event}
          gap={selectedGap}
          window={deskWindow}
        />
      </div>
      {errorBanner}
      <div
        className="flex shrink-0 gap-[3px] overflow-x-auto px-4 py-2.5"
        role="group"
        aria-label="Desk view"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "lg-focus shrink-0 rounded-[6px] px-3 py-1.5 text-[12px] transition-colors",
              tab === item.id
                ? "bg-active font-medium text-text"
                : "text-subtle hover:text-text",
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
      {tab !== "trade" ? (
        <div className="flex shrink-0 gap-2.5 border-t border-line bg-side px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setTicketSide("BUY");
              setTab("trade");
            }}
            className="lg-focus h-12 flex-1 rounded-[8px] bg-long text-[15px] font-semibold text-on-long"
          >
            Long
          </button>
          <button
            type="button"
            onClick={() => {
              setTicketSide("SELL");
              setTab("trade");
            }}
            className="lg-focus h-12 flex-1 rounded-[8px] border border-line-strong text-[15px] font-medium text-subtle hover:text-text"
          >
            Short
          </button>
        </div>
      ) : null}
    </div>
  );
}
