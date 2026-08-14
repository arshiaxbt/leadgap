"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Snapshot } from "@/lib/types";

export function PriceChart({
  candles,
  odds,
}: {
  candles: Candle[];
  odds?: Snapshot[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const oddsRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0c1018" },
        textColor: "#8b93a7",
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e2636" },
        horzLines: { color: "#1e2636" },
      },
      rightPriceScale: { borderColor: "#1e2636" },
      timeScale: { borderColor: "#1e2636", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#3ee0a855" }, horzLine: { color: "#3ee0a855" } },
    });
    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3ee0a8",
      downColor: "#fb7185",
      borderUpColor: "#3ee0a8",
      borderDownColor: "#fb7185",
      wickUpColor: "#3ee0a8",
      wickDownColor: "#fb7185",
    });
    const oddsSeries = chart.addSeries(
      LineSeries,
      {
        color: "#4d8dff",
        lineWidth: 2,
        priceScaleId: "odds",
        lastValueVisible: true,
        title: "Yes ¢",
      },
      1,
    );
    chart.priceScale("odds", 1).applyOptions({
      borderColor: "#1e2636",
      scaleMargins: { top: 0.15, bottom: 0.1 },
    });
    const panes = chart.panes();
    panes[0]?.setStretchFactor(3);
    panes[1]?.setStretchFactor(1);
    chartRef.current = chart;
    candleRef.current = candlesSeries;
    oddsRef.current = oddsSeries;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      oddsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleRef.current || candles.length === 0) return;
    const byT = new Map<number, Candle>();
    for (const c of candles) byT.set(c.time, c);
    candleRef.current.setData(
      [...byT.values()]
        .sort((a, b) => a.time - b.time)
        .map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    if (!oddsRef.current) return;
    const byT = new Map<number, number>();
    for (const p of odds ?? []) {
      if (Number.isFinite(p.t) && Number.isFinite(p.v)) {
        byT.set(Math.floor(p.t / 1000), p.v * 100);
      }
    }
    oddsRef.current.setData(
      [...byT.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time: time as UTCTimestamp, value })),
    );
  }, [odds]);

  return <div ref={host} className="h-full min-h-[240px] w-full" />;
}
