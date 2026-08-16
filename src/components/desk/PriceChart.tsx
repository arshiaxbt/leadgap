"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, GapTapePoint, KlineInterval, Snapshot } from "@/lib/types";
import { priceDigits } from "@/lib/format";

type Tool = "cursor" | "hline" | "trend";
type Style = "candle" | "line";

const STEP: Record<KlineInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14_400,
  "1d": 86_400,
};

function clock(realSec: number, withDate = false): string {
  const d = new Date(realSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (!withDate) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function fmtN(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function seriesPriceFormat(digits: number) {
  const precision = Math.max(2, Math.min(8, digits));
  return {
    type: "price" as const,
    precision,
    minMove: Number((10 ** -precision).toFixed(precision)),
  };
}

function gapMarkerShape(bias: GapTapePoint["bias"]): SeriesMarker<UTCTimestamp>["shape"] {
  switch (bias) {
    case "long":
      return "arrowUp";
    case "short":
      return "arrowDown";
    case "none":
      return "circle";
    default: {
      const _never: never = bias;
      return _never;
    }
  }
}

function buildGapMarkers(
  packed: { logical: UTCTimestamp; real: number }[],
  marks: GapTapePoint[] | undefined,
): SeriesMarker<UTCTimestamp>[] {
  if (!packed.length || !marks?.length) return [];
  const byLogical = new Map<number, GapTapePoint>();
  for (const mark of marks) {
    if (mark.score < 20 || mark.leader !== "odds") continue;
    const real = mark.t > 1e12 ? Math.floor(mark.t / 1000) : Math.floor(mark.t);
    let best = packed[0]!;
    let bestD = Math.abs(best.real - real);
    for (const bar of packed) {
      const d = Math.abs(bar.real - real);
      if (d < bestD) {
        best = bar;
        bestD = d;
      }
    }
    const prev = byLogical.get(best.logical);
    if (!prev || mark.score > prev.score) byLogical.set(best.logical, mark);
  }
  return [...byLogical.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-16)
    .map(([logical, mark]) => ({
      time: logical as UTCTimestamp,
      position: mark.bias === "short" ? "aboveBar" : "belowBar",
      shape: gapMarkerShape(mark.bias),
      color: mark.bias === "short" ? "#F0564E" : "#3ECF8E",
      text: String(Math.round(mark.score)),
      size: 1,
    }));
}

const INTERVALS: KlineInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

const ICE = "#8FC9F2";
const STONE = "#8A909B";
const LONG = "#3ECF8E";
const SHORT = "#F0564E";
const LINE = "#191E27";
const ELEV = "#10141B";
const INK = "#07090C";
const MUTE = "#79818F";

export function PriceChart({
  candles,
  odds,
  interval = "5m",
  onInterval,
  oddsLabel = "Yes %",
  gapMarks,
  story,
  decimals = 2,
}: {
  candles: Candle[];
  odds?: Snapshot[];
  interval?: KlineInterval;
  onInterval?: (v: KlineInterval) => void;
  oddsLabel?: string;
  gapMarks?: GapTapePoint[];
  story?: string;
  decimals?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const closeRef = useRef<ISeriesApi<"Line"> | null>(null);
  const oddsRef = useRef<ISeriesApi<"Area"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const fitted = useRef(false);
  const pendingTrend = useRef<{ time: UTCTimestamp; value: number } | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const trendsRef = useRef<ISeriesApi<"Line">[]>([]);
  const realByLogical = useRef(new Map<number, number>());
  const packedRef = useRef<{ logical: UTCTimestamp; real: number }[]>([]);
  const stepRef = useRef(STEP[interval]);
  stepRef.current = STEP[interval];
  const [tool, setTool] = useState<Tool>("cursor");
  const [style, setStyle] = useState<Style>("line");
  const [oddsOn, setOddsOn] = useState(true);
  const [log, setLog] = useState(false);
  const [hover, setHover] = useState<{
    o: number;
    h: number;
    l: number;
    c: number;
    odds?: number;
  } | null>(null);
  const toolRef = useRef<Tool>("cursor");
  toolRef.current = tool;
  const ohlcRef = useRef<Map<number, { o: number; h: number; l: number; c: number }>>(new Map());
  const oddsMapRef = useRef<Map<number, number>>(new Map());
  const userTouched = useRef(false);
  const ignoreRange = useRef(false);
  const digits = priceDigits(decimals, candles.at(-1)?.close ?? 0);
  const digitsRef = useRef(digits);
  digitsRef.current = digits;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    fitted.current = false;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: INK },
        textColor: MUTE,
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: LINE },
        horzLines: { color: LINE },
      },
      rightPriceScale: {
        borderColor: LINE,
        scaleMargins: { top: 0.08, bottom: 0.1 },
        minimumWidth: 72,
      },
      leftPriceScale: {
        visible: false,
        borderColor: LINE,
      },
      localization: {
        timeFormatter: (t: Time) => clock(realByLogical.current.get(Number(t)) ?? Number(t), true),
        priceFormatter: (p: number) => fmtN(p, digitsRef.current),
      },
      timeScale: {
        borderColor: LINE,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 3,
        tickMarkFormatter: (t: Time) => clock(realByLogical.current.get(Number(t)) ?? Number(t)),
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: `${ICE}55`, labelBackgroundColor: ELEV },
        horzLine: { color: `${ICE}55`, labelBackgroundColor: ELEV },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: LONG,
      downColor: SHORT,
      borderUpColor: LONG,
      borderDownColor: SHORT,
      wickUpColor: LONG,
      wickDownColor: SHORT,
      visible: false,
      priceFormat: seriesPriceFormat(digitsRef.current),
    });
    const closeSeries = chart.addSeries(LineSeries, {
      color: STONE,
      lineWidth: 2,
      visible: true,
      lastValueVisible: true,
      priceFormat: seriesPriceFormat(digitsRef.current),
    });
    const oddsPane = chart.addPane(true);
    const oddsSeries = chart.addSeries(
      AreaSeries,
      {
        lineColor: ICE,
        topColor: "rgba(143, 201, 242, 0.22)",
        bottomColor: "rgba(143, 201, 242, 0.02)",
        lineWidth: 2,
        priceScaleId: "right",
        lastValueVisible: true,
        priceLineVisible: true,
        crosshairMarkerVisible: true,
        title: "Yes %",
        visible: true,
        priceFormat: {
          type: "custom",
          minMove: 0.1,
          formatter: (price: number) => `${price.toFixed(1)}%`,
        },
      },
      oddsPane.paneIndex(),
    );
    oddsSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.12, bottom: 0.12 },
    });
    chart.panes()[0]?.setStretchFactor(1);
    oddsPane.setStretchFactor(0.22);
    oddsPane.setHeight(96);
    chartRef.current = chart;
    candleRef.current = candlesSeries;
    closeRef.current = closeSeries;
    oddsRef.current = oddsSeries;
    markersRef.current = createSeriesMarkers(closeSeries, []);

    const onClick = (param: MouseEventParams) => {
      const active = toolRef.current;
      if (active === "cursor" || !param.point) return;
      const series = candleRef.current;
      if (!series) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      if (active === "hline") {
        const line = series.createPriceLine({
          price,
          color: ICE,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: fmtN(price, digitsRef.current),
        });
        linesRef.current.push(line);
        return;
      }
      if (param.time == null) return;
      const time = param.time as UTCTimestamp;
      const point = { time, value: price };
      if (!pendingTrend.current) {
        pendingTrend.current = point;
        return;
      }
      const a = pendingTrend.current;
      pendingTrend.current = null;
      const [p1, p2] = a.time <= point.time ? [a, point] : [point, a];
      const trend = chart.addSeries(LineSeries, {
        color: ICE,
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      trend.setData([p1, p2]);
      trendsRef.current.push(trend);
    };
    chart.subscribeClick(onClick);
    const onMove = (param: MouseEventParams) => {
      if (param.time == null) {
        setHover(null);
        return;
      }
      const bar = ohlcRef.current.get(Number(param.time));
      if (!bar) {
        setHover(null);
        return;
      }
      setHover({ ...bar, odds: oddsMapRef.current.get(Number(param.time)) });
    };
    chart.subscribeCrosshairMove(onMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (ignoreRange.current) return;
      userTouched.current = true;
    });

    return () => {
      chart.unsubscribeClick(onClick);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      closeRef.current = null;
      oddsRef.current = null;
      markersRef.current = null;
      linesRef.current = [];
      trendsRef.current = [];
      pendingTrend.current = null;
    };
  }, [digits]);

  useEffect(() => {
    if (!candleRef.current || !closeRef.current || candles.length === 0) return;
    const byT = new Map<number, Candle>();
    for (const c of candles) byT.set(c.time, c);
    const rows = [...byT.values()].sort((a, b) => a.time - b.time);
    const step = STEP[interval];
    const t0 = rows[0]!.time;
    const map = new Map<number, number>();
    const packed: { logical: UTCTimestamp; real: number }[] = [];
    const bars = new Map<number, { o: number; h: number; l: number; c: number }>();
    const ohlc = rows.map((c, i) => {
      const logical = (t0 + i * step) as UTCTimestamp;
      map.set(logical, c.time);
      packed.push({ logical, real: c.time });
      const open = c.open;
      const close = c.close;
      const high = Math.max(c.open, c.high, c.low, c.close);
      const low = Math.min(c.open, c.high, c.low, c.close);
      bars.set(logical, { o: open, h: high, l: low, c: close });
      return { time: logical, open, high, low, close };
    });
    realByLogical.current = map;
    packedRef.current = packed;
    ohlcRef.current = bars;
    candleRef.current.setData(ohlc);
    closeRef.current.setData(ohlc.map((c) => ({ time: c.time, value: c.close })));
    const digits = priceDigits(decimals, rows.at(-1)?.close ?? 0);
    digitsRef.current = digits;
    const format = seriesPriceFormat(digits);
    candleRef.current.applyOptions({ priceFormat: format });
    closeRef.current.applyOptions({ priceFormat: format });
    if (!fitted.current) {
      ignoreRange.current = true;
      chartRef.current?.timeScale().fitContent();
      fitted.current = true;
      requestAnimationFrame(() => {
        ignoreRange.current = false;
      });
    } else if (!userTouched.current) {
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [candles, interval, decimals]);

  useEffect(() => {
    if (!oddsRef.current) return;
    const packed = packedRef.current;
    if (packed.length === 0) {
      oddsRef.current.setData([]);
      return;
    }
    const samples = (odds ?? [])
      .map((p) => ({
        real: p.t > 1e12 ? Math.floor(p.t / 1000) : Math.floor(p.t),
        v: p.v,
      }))
      .filter((p) => Number.isFinite(p.real) && Number.isFinite(p.v))
      .sort((a, b) => a.real - b.real);
    const byT = new Map<number, number>();
    let j = 0;
    let last: number | null = null;
    for (const bar of packed) {
      while (j < samples.length && samples[j]!.real <= bar.real) {
        last = samples[j]!.v * 100;
        j += 1;
      }
      if (last != null) byT.set(bar.logical, last);
    }
    oddsMapRef.current = byT;
    oddsRef.current.setData(
      [...byT.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time: time as UTCTimestamp, value })),
    );
  }, [odds, candles, interval]);

  useEffect(() => {
    candleRef.current?.applyOptions({ visible: style === "candle" });
    closeRef.current?.applyOptions({ visible: style === "line" });
    const series = style === "candle" ? candleRef.current : closeRef.current;
    if (series) markersRef.current = createSeriesMarkers(series, []);
  }, [style]);

  useEffect(() => {
    markersRef.current?.setMarkers(buildGapMarkers(packedRef.current, gapMarks));
  }, [gapMarks, candles, interval, style]);

  useEffect(() => {
    oddsRef.current?.applyOptions({ visible: oddsOn, title: oddsLabel.slice(0, 28) || "Yes %" });
    const panes = chartRef.current?.panes();
    panes?.[0]?.setStretchFactor(1);
    panes?.[1]?.setStretchFactor(oddsOn ? 0.22 : 0.001);
  }, [oddsOn, oddsLabel]);

  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({
      mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [log]);

  useEffect(() => {
    const drawing = tool !== "cursor";
    chartRef.current?.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !drawing,
        horzTouchDrag: !drawing,
        vertTouchDrag: !drawing,
      },
      handleScale: { axisPressedMouseMove: !drawing, mouseWheel: true, pinch: true },
      crosshair: { mode: CrosshairMode.Magnet },
    });
    if (host.current) host.current.style.cursor = drawing ? "crosshair" : "default";
  }, [tool]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        pendingTrend.current = null;
        setTool("cursor");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function clearDrawings() {
    const series = candleRef.current;
    for (const line of linesRef.current) series?.removePriceLine(line);
    linesRef.current = [];
    for (const trend of trendsRef.current) {
      try {
        chartRef.current?.removeSeries(trend);
      } catch {
        // already gone
      }
    }
    trendsRef.current = [];
    pendingTrend.current = null;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-x-2 gap-y-1 px-2 py-1.5">
        <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 rounded-[6px] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-1 py-0.5">
          {onInterval
            ? INTERVALS.map((id) => (
                <ToolBtn key={id} active={interval === id} onClick={() => onInterval(id)} label={id} />
              ))
            : null}
          <span className="mx-0.5 h-3 w-px bg-[var(--line)]" />
          <ToolBtn active={style === "candle"} onClick={() => setStyle("candle")} label="Candles" />
          <ToolBtn active={style === "line"} onClick={() => setStyle("line")} label="Line" />
          <ToolBtn active={oddsOn} onClick={() => setOddsOn((v) => !v)} label="Yes %" />
          <ToolBtn active={log} onClick={() => setLog((v) => !v)} label="Log" />
          <span className="mx-0.5 h-3 w-px bg-[var(--line)]" />
          <ToolBtn active={tool === "cursor"} onClick={() => setTool("cursor")} label="Cursor" />
          <ToolBtn active={tool === "hline"} onClick={() => setTool("hline")} label="H-line" />
          <ToolBtn active={tool === "trend"} onClick={() => setTool("trend")} label="Trend" />
          <ToolBtn active={false} onClick={clearDrawings} label="Clear" />
          <ToolBtn
            active={false}
            onClick={() => {
              userTouched.current = false;
              ignoreRange.current = true;
              chartRef.current?.timeScale().fitContent();
              requestAnimationFrame(() => {
                ignoreRange.current = false;
              });
            }}
            label="Fit"
          />
        </div>
        <div className="pointer-events-none ml-auto flex min-w-0 flex-col items-end gap-0.5">
          {hover ? (
            <span className="num rounded-[6px] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-1.5 py-0.5 text-[11px] text-[var(--dim)]">
              O {fmtN(hover.o, digitsRef.current)} H {fmtN(hover.h, digitsRef.current)} L{" "}
              {fmtN(hover.l, digitsRef.current)} C{" "}
              <span className={hover.c >= hover.o ? "text-[var(--long)]" : "text-[var(--short)]"}>
                {fmtN(hover.c, digitsRef.current)}
              </span>
              {oddsOn && hover.odds != null ? (
                <span className="ml-2 text-[var(--odds)]">Yes {hover.odds.toFixed(1)}%</span>
              ) : null}
            </span>
          ) : null}
          {story ? (
            <span className="max-w-[min(100%,28rem)] truncate rounded-[6px] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
              {story}
            </span>
          ) : null}
          {tool !== "cursor" ? (
            <span className="rounded-[6px] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-1.5 py-0.5 text-[11px] text-[var(--dim)]">
              {tool === "hline" ? "Click for price line" : "Click two points"}
            </span>
          ) : null}
        </div>
      </div>
      <div ref={host} className="min-h-0 flex-1" />
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[4px] px-1.5 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--odds)_40%,transparent)] ${
        active ? "text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}
