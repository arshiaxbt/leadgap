"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NewsList } from "@/components/NewsList";
import { OrderTicket } from "@/components/OrderTicket";
import { Spark } from "@/components/Spark";
import { Panel, Pill } from "@/components/ui";
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

export function AssetView({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/assets/${symbol}`);
      if (!res.ok) {
        if (!stop) setError("Market not found.");
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

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-white/5" />;

  const { instrument, ticker, events, news, mapping } = data;
  const maint = mmr(instrument.maxLeverage);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div>
          <p className="text-xs text-[#8b93a7]">
            <Link href="/markets" className="hover:text-white">
              Markets
            </Link>
            <span className="mx-1.5">/</span>
            <span className="capitalize">{instrument.category}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {instrument.symbol.replace("-USD", "")}
            </h1>
            {mapping ? <Pill>{mapping.cluster}</Pill> : null}
            <span className="text-xs text-[#5c6478]">{sessionLabel(instrument.category)}</span>
          </div>
        </div>

        <Panel className="p-5">
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#5c6478]">Mark</div>
              <div className="num mt-1 text-2xl text-white">
                {ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#5c6478]">Index</div>
              <div className="num mt-1 text-lg text-zinc-300">
                {ticker ? fmtPx(ticker.indexPrice, instrument.priceDecimals) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#5c6478]">1h</div>
              <div className={`num mt-1 text-lg ${ticker?.change1h != null ? signedClass(ticker.change1h) : ""}`}>
                {ticker?.change1h != null ? fmtPct(ticker.change1h) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#5c6478]">Funding</div>
              <div className="num mt-1 text-lg">{ticker ? fmtFunding(ticker.fundingRate) : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#5c6478]">Open interest</div>
              <div className="num mt-1 text-lg">{ticker ? fmtPx(ticker.openInterest, 3) : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#5c6478]">Max lev</div>
              <div className="num mt-1 text-lg">
                {instrument.maxLeverage}x · MMR {(maint * 100).toFixed(2)}%
              </div>
            </div>
          </div>
          <Spark points={data.markHistory} className="mt-4" />
        </Panel>

        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-200">Linked events</h2>
          {events.length === 0 ? (
            <p className="text-sm text-[#8b93a7]">No live events linked to this market yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`}>
                  <Panel className="px-4 py-3 transition hover:border-[#3ee0a8]/30">
                    <p className="text-sm font-medium text-zinc-100">{event.title}</p>
                    <p className="mt-0.5 text-xs text-[#8b93a7]">
                      Yes {fmtOdds(event.yesPrice)} · {event.question}
                    </p>
                  </Panel>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-200">News</h2>
          <NewsList items={news} />
        </section>
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        <OrderTicket instrument={instrument} ticker={ticker} />
      </div>
    </div>
  );
}
