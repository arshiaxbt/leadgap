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
import type {
  Candle,
  GapTapePoint,
  KlineInterval,
  Snapshot,
} from "@/lib/types";
import { priceDigits } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";
import { cn } from "@/lib/utils";

type Tool = "cursor" | "hline" | "trend";
type Style = "candle" | "line";
type Lower = "residual" | "odds" | "off";

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
  if (Math.abs(n) >= 1000)
    return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function signedPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function seriesPriceFormat(digits: number) {
  const precision = Math.max(2, Math.min(8, digits));
  return {
    type: "price" as const,
    precision,
    minMove: Number((10 ** -precision).toFixed(precision)),
  };
}

const PCT_FORMAT = {
  type: "custom" as const,
  minMove: 0.01,
  formatter: (price: number) => signedPct(price),
};

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
      shape: "circle",
      color: LIME,
      text: String(Math.round(mark.score)),
      size: 1,
    }));
}

/** Last value at or before `t` in an ascending [t, v] list. */
function lastAt(
  points: { real: number; v: number }[],
  t: number,
): number | null {
  let lo = 0,
    hi = points.length - 1,
    found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.real <= t) {
      found = points[mid]!.v;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

const INTERVALS: KlineInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
const COMPACT_INTERVALS: KlineInterval[] = ["5m", "1h", "4h"];

const LIME = "#CBF152";
const BONE = "#CFC3AE";
const LONG = "#4FD4A0";
const SHORT = "#F0745F";
const GRID = "#1C1C18";
const AXIS = "#22221D";
const RAISE = "#33332B";
const INK = "#121210";
const MUTE = "#8F8D83";
const ZERO = "#3A3A32";

export function PriceChart({
  candles,
  odds,
  interval = "5m",
  onInterval,
  oddsLabel = "Yes %",
  gapMarks,
  decimals = 2,
  signedBeta,
  windowMs,
  windowLabel,
}: {
  candles: Candle[];
  odds?: Snapshot[];
  interval?: KlineInterval;
  onInterval?: (v: KlineInterval) => void;
  oddsLabel?: string;
  gapMarks?: GapTapePoint[];
  decimals?: number;
  /** Mapping sensitivity of the driving event; enables the residual pane. */
  signedBeta?: number;
  /** Comparison window the residual rolls over. */
  windowMs?: number;
  windowLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const closeRef = useRef<ISeriesApi<"Line"> | null>(null);
  const oddsRef = useRef<ISeriesApi<"Area"> | null>(null);
  const bandHiRef = useRef<ISeriesApi<"Area"> | null>(null);
  const bandLoRef = useRef<ISeriesApi<"Area"> | null>(null);
  const impliedRef = useRef<ISeriesApi<"Line"> | null>(null);
  const observedRef = useRef<ISeriesApi<"Line"> | null>(null);
  const gapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const fitted = useRef(false);
  const pendingTrend = useRef<{ time: UTCTimestamp; value: number } | null>(
    null,
  );
  const linesRef = useRef<IPriceLine[]>([]);
  const trendsRef = useRef<ISeriesApi<"Line">[]>([]);
  const realByLogical = useRef(new Map<number, number>());
  const packedRef = useRef<{ logical: UTCTimestamp; real: number }[]>([]);
  const [tool, setTool] = useState<Tool>("cursor");
  const [style, setStyle] = useState<Style>("line");
  const canResidual = signedBeta != null && windowMs != null;
  const [lower, setLower] = useState<Lower>(canResidual ? "residual" : "odds");
  const [log, setLog] = useState(false);
  const [paneTop, setPaneTop] = useState<number | null>(null);
  const [residualPoints, setResidualPoints] = useState(0);
  const [hover, setHover] = useState<{
    o: number;
    h: number;
    l: number;
    c: number;
    odds?: number;
    gap?: number;
  } | null>(null);
  const [last, setLast] = useState<{
    o: number;
    h: number;
    l: number;
    c: number;
  } | null>(null);
  const toolRef = useRef<Tool>("cursor");
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const ohlcRef = useRef<
    Map<number, { o: number; h: number; l: number; c: number }>
  >(new Map());
  const oddsMapRef = useRef<Map<number, number>>(new Map());
  const gapMapRef = useRef<Map<number, number>>(new Map());
  const userTouched = useRef(false);
  const ignoreRange = useRef(false);
  const digits = priceDigits(decimals, candles.at(-1)?.close ?? 0);
  const digitsRef = useRef(digits);
  useEffect(() => {
    digitsRef.current = digits;
  }, [digits]);
  const effectiveLower: Lower =
    lower === "residual" && !canResidual ? "odds" : lower;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    fitted.current = false;
    // Canvas text cannot resolve CSS variables; read the loaded family name.
    const mono = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-plex-mono")
      .trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: INK },
        textColor: MUTE,
        fontFamily: `${mono || "'IBM Plex Mono'"}, ui-monospace, monospace`,
        fontSize: 10,
        panes: { separatorColor: AXIS, separatorHoverColor: RAISE },
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderColor: AXIS,
        scaleMargins: { top: 0.12, bottom: 0.1 },
        minimumWidth: 72,
      },
      leftPriceScale: {
        visible: false,
        borderColor: AXIS,
      },
      localization: {
        timeFormatter: (t: Time) =>
          clock(realByLogical.current.get(Number(t)) ?? Number(t), true),
        priceFormatter: (p: number) => fmtN(p, digitsRef.current),
      },
      timeScale: {
        borderColor: AXIS,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 3,
        tickMarkFormatter: (t: Time) =>
          clock(realByLogical.current.get(Number(t)) ?? Number(t)),
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: `${LIME}55`, labelBackgroundColor: RAISE },
        horzLine: { color: `${LIME}55`, labelBackgroundColor: RAISE },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
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
      color: BONE,
      lineWidth: 2,
      visible: true,
      lastValueVisible: true,
      priceLineColor: BONE,
      priceFormat: seriesPriceFormat(digitsRef.current),
    });
    const lowerPane = chart.addPane(true);
    const paneIndex = lowerPane.paneIndex();
    const oddsSeries = chart.addSeries(
      AreaSeries,
      {
        lineColor: LIME,
        topColor: "rgba(203, 241, 82, 0.18)",
        bottomColor: "rgba(203, 241, 82, 0.02)",
        lineWidth: 2,
        priceScaleId: "right",
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        title: "Yes %",
        visible: false,
        priceFormat: {
          type: "custom",
          minMove: 0.1,
          formatter: (price: number) => `${price.toFixed(1)}%`,
        },
      },
      paneIndex,
    );
    // The band: fill below the upper line, then repaint below the lower line.
    const quiet = {
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lineVisible: false,
      priceFormat: PCT_FORMAT,
      visible: false,
    };
    const bandHi = chart.addSeries(
      AreaSeries,
      {
        ...quiet,
        topColor: "rgba(203, 241, 82, 0.15)",
        bottomColor: "rgba(203, 241, 82, 0.15)",
        lineColor: "transparent",
      },
      paneIndex,
    );
    const bandLo = chart.addSeries(
      AreaSeries,
      {
        ...quiet,
        topColor: INK,
        bottomColor: INK,
        lineColor: "transparent",
      },
      paneIndex,
    );
    const observed = chart.addSeries(
      LineSeries,
      {
        color: BONE,
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
        priceFormat: PCT_FORMAT,
        visible: false,
      },
      paneIndex,
    );
    const implied = chart.addSeries(
      LineSeries,
      {
        color: LIME,
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
        priceFormat: PCT_FORMAT,
        visible: false,
      },
      paneIndex,
    );
    const gap = chart.addSeries(
      LineSeries,
      {
        color: LIME,
        lineVisible: false,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: "Gap",
        priceFormat: PCT_FORMAT,
        visible: false,
      },
      paneIndex,
    );
    implied.createPriceLine({
      price: 0,
      color: ZERO,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
    oddsSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.14, bottom: 0.1 },
    });
    chart.panes()[0]?.setStretchFactor(1);
    lowerPane.setStretchFactor(0.28);
    chartRef.current = chart;
    candleRef.current = candlesSeries;
    closeRef.current = closeSeries;
    oddsRef.current = oddsSeries;
    bandHiRef.current = bandHi;
    bandLoRef.current = bandLo;
    impliedRef.current = implied;
    observedRef.current = observed;
    gapRef.current = gap;
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
          color: LIME,
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
        color: LIME,
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
      setHover({
        ...bar,
        odds: oddsMapRef.current.get(Number(param.time)),
        gap: gapMapRef.current.get(Number(param.time)),
      });
    };
    chart.subscribeCrosshairMove(onMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (ignoreRange.current) return;
      userTouched.current = true;
    });
    const measure = () => {
      const h = chart.panes()[0]?.getHeight();
      setPaneTop(h ? h + 1 : null);
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    requestAnimationFrame(measure);

    return () => {
      observer?.disconnect();
      chart.unsubscribeClick(onClick);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      closeRef.current = null;
      oddsRef.current = null;
      bandHiRef.current = null;
      bandLoRef.current = null;
      impliedRef.current = null;
      observedRef.current = null;
      gapRef.current = null;
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
    const bars = new Map<
      number,
      { o: number; h: number; l: number; c: number }
    >();
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
    const tail = ohlc.at(-1);
    setLast(
      tail ? { o: tail.open, h: tail.high, l: tail.low, c: tail.close } : null,
    );
    candleRef.current.setData(ohlc);
    closeRef.current.setData(
      ohlc.map((c) => ({ time: c.time, value: c.close })),
    );
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

  // Lower pane data: Yes % and the rolling residual share the bar grid.
  useEffect(() => {
    const packed = packedRef.current;
    const series = [
      oddsRef.current,
      bandHiRef.current,
      bandLoRef.current,
      impliedRef.current,
      observedRef.current,
      gapRef.current,
    ];
    if (series.some((s) => !s)) return;
    if (packed.length === 0) {
      for (const s of series) s!.setData([]);
      return;
    }
    const samples = (odds ?? [])
      .map((p) => ({
        real: p.t > 1e12 ? Math.floor(p.t / 1000) : Math.floor(p.t),
        v: p.v,
      }))
      .filter((p) => Number.isFinite(p.real) && Number.isFinite(p.v))
      .sort((a, b) => a.real - b.real);
    const step = STEP[interval];
    const closes = [...ohlcRef.current.entries()]
      .map(([logical, bar]) => ({
        real: (realByLogical.current.get(logical) ?? logical) + step,
        v: bar.c,
      }))
      .sort((a, b) => a.real - b.real);
    const yes: { time: UTCTimestamp; value: number }[] = [];
    const hi: { time: UTCTimestamp; value: number }[] = [];
    const lo: { time: UTCTimestamp; value: number }[] = [];
    const imp: { time: UTCTimestamp; value: number }[] = [];
    const obs: { time: UTCTimestamp; value: number }[] = [];
    const gap: { time: UTCTimestamp; value: number }[] = [];
    const oddsMap = new Map<number, number>();
    const gapMap = new Map<number, number>();
    const w = windowMs != null ? windowMs / 1000 : null;
    for (const bar of packed) {
      const end = bar.real + step;
      const yesNow = lastAt(samples, end);
      if (yesNow != null) {
        oddsMap.set(bar.logical, yesNow * 100);
        yes.push({ time: bar.logical, value: yesNow * 100 });
      }
      if (w == null || signedBeta == null || yesNow == null) continue;
      const yesThen = lastAt(samples, end - w);
      const markNow = ohlcRef.current.get(bar.logical)?.c;
      const markThen = lastAt(closes, end - w);
      if (yesThen == null || markNow == null || !markThen) continue;
      const i = (yesNow - yesThen) * signedBeta * 100;
      const o = (markNow / markThen - 1) * 100;
      imp.push({ time: bar.logical, value: i });
      obs.push({ time: bar.logical, value: o });
      hi.push({ time: bar.logical, value: Math.max(i, o) });
      lo.push({ time: bar.logical, value: Math.min(i, o) });
      gap.push({ time: bar.logical, value: i - o });
      gapMap.set(bar.logical, i - o);
    }
    oddsMapRef.current = oddsMap;
    gapMapRef.current = gapMap;
    setResidualPoints(gap.length);
    oddsRef.current!.setData(yes);
    bandHiRef.current!.setData(hi);
    bandLoRef.current!.setData(lo);
    impliedRef.current!.setData(imp);
    observedRef.current!.setData(obs);
    gapRef.current!.setData(gap);
  }, [odds, candles, interval, signedBeta, windowMs]);

  useEffect(() => {
    candleRef.current?.applyOptions({ visible: style === "candle" });
    closeRef.current?.applyOptions({ visible: style === "line" });
    const series = style === "candle" ? candleRef.current : closeRef.current;
    if (series) markersRef.current = createSeriesMarkers(series, []);
  }, [style]);

  useEffect(() => {
    markersRef.current?.setMarkers(
      buildGapMarkers(packedRef.current, gapMarks),
    );
  }, [gapMarks, candles, interval, style]);

  useEffect(() => {
    const residual = effectiveLower === "residual";
    oddsRef.current?.applyOptions({
      visible: effectiveLower === "odds",
      title: oddsLabel.slice(0, 28) || "Yes %",
    });
    for (const s of [
      bandHiRef.current,
      bandLoRef.current,
      impliedRef.current,
      observedRef.current,
      gapRef.current,
    ])
      s?.applyOptions({ visible: residual });
    const panes = chartRef.current?.panes();
    panes?.[0]?.setStretchFactor(1);
    panes?.[1]?.setStretchFactor(effectiveLower === "off" ? 0.001 : 0.28);
    requestAnimationFrame(() => {
      const h = chartRef.current?.panes()[0]?.getHeight();
      setPaneTop(h ? h + 1 : null);
    });
  }, [effectiveLower, oddsLabel]);

  useEffect(() => {
    chartRef.current?.priceScale("right", 0).applyOptions({
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
      handleScale: {
        axisPressedMouseMove: !drawing,
        mouseWheel: true,
        pinch: true,
      },
      crosshair: { mode: CrosshairMode.Magnet },
    });
    if (host.current)
      host.current.style.cursor = drawing ? "crosshair" : "default";
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

  const readout = hover ?? last;
  const compact = frameWidth > 0 && frameWidth < 640;
  const intervals = compact
    ? INTERVALS.filter(
        (id) => COMPACT_INTERVALS.includes(id) || id === interval,
      )
    : INTERVALS;

  return (
    <div
      ref={frameRef}
      className="relative flex h-full min-h-0 flex-col bg-canvas"
    >
      {compact ? (
        <div className="flex shrink-0 items-center gap-[3px] px-4 pb-2">
          {onInterval
            ? intervals.map((id) => (
                <ToolBtn
                  key={id}
                  mono
                  active={interval === id}
                  onClick={() => onInterval(id)}
                  label={id}
                />
              ))
            : null}
          <div className="ml-auto flex gap-[3px]">
            {canResidual ? (
              <ToolBtn
                active={effectiveLower === "residual"}
                lime
                onClick={() =>
                  setLower((v) => (v === "residual" ? "off" : "residual"))
                }
                label="Residual"
              />
            ) : null}
            <ToolBtn
              active={effectiveLower === "odds"}
              onClick={() => setLower((v) => (v === "odds" ? "off" : "odds"))}
              label="Yes %"
            />
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-2.5 px-3 py-2">
          {onInterval ? (
            <ToolGroup label="Interval">
              {intervals.map((id) => (
                <ToolBtn
                  key={id}
                  mono
                  active={interval === id}
                  onClick={() => onInterval(id)}
                  label={id}
                />
              ))}
            </ToolGroup>
          ) : null}
          <ToolGroup label="Price style">
            <ToolBtn
              active={style === "candle"}
              onClick={() => setStyle("candle")}
              label="Candles"
            />
            <ToolBtn
              active={style === "line"}
              onClick={() => setStyle("line")}
              label="Line"
            />
          </ToolGroup>
          <ToolGroup label="Lower pane and scale">
            {canResidual ? (
              <ToolBtn
                active={effectiveLower === "residual"}
                lime
                onClick={() =>
                  setLower((v) => (v === "residual" ? "off" : "residual"))
                }
                label="Residual"
              />
            ) : null}
            <ToolBtn
              active={effectiveLower === "odds"}
              onClick={() => setLower((v) => (v === "odds" ? "off" : "odds"))}
              label="Yes %"
            />
            <ToolBtn
              active={log}
              onClick={() => setLog((v) => !v)}
              label="Log"
            />
          </ToolGroup>
          <ToolGroup label="Drawing">
            <ToolBtn
              active={tool === "cursor"}
              onClick={() => setTool("cursor")}
              label="Cursor"
            />
            <ToolBtn
              active={tool === "hline"}
              onClick={() => setTool("hline")}
              label="H-line"
            />
            <ToolBtn
              active={tool === "trend"}
              onClick={() => setTool("trend")}
              label="Trend"
            />
            <ToolBtn onClick={clearDrawings} label="Clear" />
            <ToolBtn
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
          </ToolGroup>
          <div className="ml-auto flex min-w-0 flex-col items-end gap-1">
            {readout ? (
              <span className="num rounded-[4px] bg-[rgba(14,14,12,0.9)] px-[7px] py-[3px] text-[11px] text-dim">
                O {fmtN(readout.o, digits)} H {fmtN(readout.h, digits)} L{" "}
                {fmtN(readout.l, digits)} C{" "}
                <span
                  className={
                    readout.c >= readout.o ? "text-long" : "text-short"
                  }
                >
                  {fmtN(readout.c, digits)}
                </span>
                {hover && effectiveLower === "odds" && hover.odds != null ? (
                  <span className="ml-2 text-odds">
                    Yes {hover.odds.toFixed(1)}%
                  </span>
                ) : null}
                {hover && effectiveLower === "residual" && hover.gap != null ? (
                  <span className="ml-2 text-odds">
                    Gap {signedPct(hover.gap)}
                  </span>
                ) : null}
              </span>
            ) : null}
            {tool !== "cursor" ? (
              <span className="rounded-[4px] bg-[rgba(14,14,12,0.9)] px-[7px] py-[3px] text-[11px] text-dim">
                {tool === "hline" ? "Click for price line" : "Click two points"}
              </span>
            ) : null}
          </div>
        </div>
      )}
      {paneTop != null && effectiveLower !== "off" ? (
        <p
          className="kicker pointer-events-none absolute left-2 z-10 max-w-[70%] truncate"
          style={{ top: paneTop + (compact ? 38 : 8) }}
        >
          {effectiveLower === "residual"
            ? `Residual · implied − observed${windowLabel ? ` · ${windowLabel} window` : ""}`
            : `Yes probability · ${oddsLabel}`}
        </p>
      ) : null}
      {paneTop != null &&
      effectiveLower === "residual" &&
      residualPoints === 0 ? (
        <p
          className="pointer-events-none absolute left-2 z-10 text-[12px] text-dim"
          style={{ top: paneTop + (compact ? 60 : 30) }}
        >
          Collecting {windowLabel ? `a full ${windowLabel} of` : "enough"} event
          odds to draw the residual.
        </p>
      ) : null}
      <div key="host" ref={host} className="min-h-0 flex-1" />
    </div>
  );
}

function ToolGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="pointer-events-auto flex gap-px rounded-[6px] bg-[rgba(14,14,12,0.9)] p-0.5"
    >
      {children}
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  mono = false,
  lime = false,
}: {
  /** Omit for one-shot actions; set for toggles. */
  active?: boolean;
  onClick: () => void;
  label: string;
  mono?: boolean;
  lime?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "lg-focus rounded-[4px] px-[7px] py-[3px] text-[11px] transition-colors",
        mono && "num",
        active
          ? cn("bg-active", lime ? "text-odds" : "text-text")
          : "text-subtle hover:text-text",
      )}
    >
      {label}
    </button>
  );
}
