"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NewsList } from "@/components/NewsList";
import { OrderTicket } from "@/components/OrderTicket";
import { fmtFunding, fmtOdds, fmtPct, fmtPx, mmr, sessionLabel, signedClass } from "@/lib/format";
import type { MapRow, NewsItem, PerpsInstrument, PerpsTicker, ResolvedEvent, Snapshot } from "@/lib/types";

type Payload = {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  events: ResolvedEvent[];
  news: NewsItem[];
  mapping: MapRow | null;
  markHistory: Snapshot[];
  asOf: number;
};

function Spark({ points }: { points: Snapshot[] }) {
  if (points.length < 2) return <div className="h-16 text-xs text-zinc-600">Collecting mark history…</div>;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 200;
      const y = 48 - ((p.v - min) / span) * 44;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 200 52" className="h-16 w-full text-emerald-400">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function AssetView({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/assets/${symbol}`);
      if (!res.ok) {
        if (!stop) setError("Instrument not found");
        return;
      }
      const json = (await res.json()) as Payload;
      if (!stop) setData(json);
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading {symbol}…</p>;

  const { instrument, ticker, events, news, mapping } = data;
  const maint = mmr(instrument.maxLeverage);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          <Link href="/markets" className="hover:text-zinc-300">
            Markets
          </Link>{" "}
          / {instrument.category}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{instrument.symbol}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {instrument.baseAsset} · max {instrument.maxLeverage}x · MMR {(maint * 100).toFixed(2)}% · session{" "}
          {sessionLabel(instrument.category)}
          {mapping ? ` · cluster ${mapping.cluster}` : " · unmapped events until aliases match"}
        </p>
        <div className="mt-4 rounded-lg border border-zinc-800 bg-[#12161c] p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-xs text-zinc-500">Mark</div>
              <div className="text-lg text-zinc-100">{ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Index</div>
              <div>{ticker ? fmtPx(ticker.indexPrice, instrument.priceDecimals) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">1h</div>
              <div className={ticker?.change1h != null ? signedClass(ticker.change1h) : ""}>
                {ticker?.change1h != null ? fmtPct(ticker.change1h) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Funding</div>
              <div>{ticker ? fmtFunding(ticker.fundingRate) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Open interest</div>
              <div>{ticker ? fmtPx(ticker.openInterest, 3) : "—"}</div>
            </div>
          </div>
          <div className="mt-3">
            <Spark points={data.markHistory} />
          </div>
        </div>
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">Related events</h2>
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">No mapped live events yet for this symbol.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {events.map((event) => {
                const link = event.perps.find((p) => p.symbol === symbol);
                return (
                  <li key={event.id} className="px-3 py-3">
                    <Link href={`/events/${event.id}`} className="text-zinc-100 hover:underline">
                      {event.title}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {event.question} · Yes {fmtOdds(event.yesPrice)} · {link?.mappingReason}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">News</h2>
          <NewsList items={news} />
        </section>
      </div>
      <OrderTicket instrument={instrument} ticker={ticker} />
    </div>
  );
}
