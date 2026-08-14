"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, KlineInterval, Snapshot } from "@/lib/types";

type Tool = "cursor" | "hline" | "trend";
type Style = "candle" | "line";

const STEP: Record<KlineInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

function clock(realSec: number, withDate = false): string {
  const d = new Date(realSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (!withDate) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function fmtN(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function PriceChart({
  candles,
  odds,
  interval = "5m",
}: {
  candles: Candle[];
  odds?: Snapshot[];
  interval?: KlineInterval;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const closeRef = useRef<ISeriesApi<"Line"> | null>(null);
  const oddsRef = useRef<ISeriesApi<"Line"> | null>(null);
  const fitted = useRef(false);
  const pendingTrend = useRef<{ time: UTCTimestamp; value: number } | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const trendsRef = useRef<ISeriesApi<"Line">[]>([]);
  const realByLogical = useRef(new Map<number, number>());
  const packedRef = useRef<{ logical: UTCTimestamp; real: number }[]>([]);
  const stepRef = useRef(STEP[interval]);
  stepRef.current = STEP[interval];
  const [tool, setTool] = useState<Tool>("cursor");
  const [style, setStyle] = useState<Style>("candle");
  const [oddsOn, setOddsOn] = useState(false);
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

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    fitted.current = false;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#08090c" },
        textColor: "#8b93a7",
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a2030" },
        horzLines: { color: "#1a2030" },
      },
      rightPriceScale: {
        borderColor: "#1e2636",
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      leftPriceScale: {
        visible: false,
        borderColor: "#1e2636",
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      localization: {
        timeFormatter: (t: Time) => clock(realByLogical.current.get(Number(t)) ?? Number(t), true),
      },
      timeScale: {
        borderColor: "#1e2636",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        tickMarkFormatter: (t: Time) => clock(realByLogical.current.get(Number(t)) ?? Number(t)),
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "#3ee0a855", labelBackgroundColor: "#1e2636" },
        horzLine: { color: "#3ee0a855", labelBackgroundColor: "#1e2636" },
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
      upColor: "#3ee0a8",
      downColor: "#fb7185",
      borderUpColor: "#3ee0a8",
      borderDownColor: "#fb7185",
      wickUpColor: "#3ee0a8",
      wickDownColor: "#fb7185",
    });
    const closeSeries = chart.addSeries(LineSeries, {
      color: "#3ee0a8",
      lineWidth: 2,
      visible: false,
      lastValueVisible: true,
    });
    const oddsSeries = chart.addSeries(LineSeries, {
      color: "rgba(77, 141, 255, 0.4)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: "left",
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "Odds",
      visible: false,
    });
    chartRef.current = chart;
    candleRef.current = candlesSeries;
    closeRef.current = closeSeries;
    oddsRef.current = oddsSeries;

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
          color: "#fbbf24",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: price.toFixed(2),
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
        color: "#fbbf24",
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
      linesRef.current = [];
      trendsRef.current = [];
      pendingTrend.current = null;
    };
  }, []);

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
  }, [candles, interval]);

  useEffect(() => {
    if (!oddsRef.current) return;
    const packed = packedRef.current;
    if (packed.length === 0) {
      oddsRef.current.setData([]);
      return;
    }
    const byT = new Map<number, number>();
    for (const p of odds ?? []) {
      if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) continue;
      const real = Math.floor(p.t / 1000);
      if (real < packed[0]!.real || real > packed[packed.length - 1]!.real + stepRef.current) continue;
      let lo = 0;
      let hi = packed.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (packed[mid]!.real <= real) lo = mid;
        else hi = mid - 1;
      }
      byT.set(packed[lo]!.logical, p.v * 100);
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
  }, [style]);

  useEffect(() => {
    oddsRef.current?.applyOptions({ visible: oddsOn });
    chartRef.current?.priceScale("left").applyOptions({ visible: oddsOn });
  }, [oddsOn]);

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
    <div className="flex h-full min-h-[240px] flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#1a2030] px-2 py-0.5 text-[10px]">
        {hover ? (
          <span className="num mr-2 text-[#7d8699]">
            O {fmtN(hover.o)} H {fmtN(hover.h)} L {fmtN(hover.l)} C{" "}
            <span className={hover.c >= hover.o ? "text-[#3ee0a8]" : "text-rose-300"}>{fmtN(hover.c)}</span>
            {oddsOn && hover.odds != null ? (
              <span className="ml-2 text-[#5b8def]">{hover.odds.toFixed(1)}¢</span>
            ) : null}
          </span>
        ) : (
          <span className="mr-2 text-[#7d8699]">Chart</span>
        )}
        <span className="mx-1 h-3 w-px bg-[#1a2030]" />
        <ToolBtn active={tool === "cursor"} onClick={() => setTool("cursor")} label="Cursor" />
        <ToolBtn active={tool === "hline"} onClick={() => setTool("hline")} label="H-line" />
        <ToolBtn active={tool === "trend"} onClick={() => setTool("trend")} label="Trend" />
        <ToolBtn active={false} onClick={clearDrawings} label="Clear" />
        <ToolBtn active={style === "candle"} onClick={() => setStyle("candle")} label="Candles" />
        <ToolBtn active={style === "line"} onClick={() => setStyle("line")} label="Line" />
        <ToolBtn active={oddsOn} onClick={() => setOddsOn((v) => !v)} label="Odds" />
        <ToolBtn active={log} onClick={() => setLog((v) => !v)} label="Log" />
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
        {tool !== "cursor" ? (
          <span className="ml-2 text-[#7d8699]">
            {tool === "hline" ? "Click for price line" : "Click two points"}
          </span>
        ) : null}
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
      className={`rounded px-2 py-0.5 ${active ? "bg-white/10 text-white" : "text-[#8b93a7] hover:text-white"}`}
    >
      {label}
    </button>
  );
}
