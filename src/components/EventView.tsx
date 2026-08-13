"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NewsList } from "@/components/NewsList";
import { OrderTicket } from "@/components/OrderTicket";
import { fmtOdds, fmtPct, fmtPx, signedClass } from "@/lib/format";
import type { GapRow, NewsItem, PerpsInstrument, PerpsTicker, ResolvedEvent } from "@/lib/types";

type Payload = {
  event: ResolvedEvent;
  tickers: Record<string, PerpsTicker>;
  news: NewsItem[];
  instruments: PerpsInstrument[];
  asOf: number;
};

export function EventView({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteSource, setNoteSource] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/events/${id}`);
      if (!res.ok) {
        if (!stop) setError("Event not found or not yet ingested.");
        return;
      }
      const json = (await res.json()) as Payload;
      if (stop) return;
      setData(json);
      setSelected((cur) => cur ?? json.event.perps[0]?.symbol ?? null);
      const g = await fetch("/api/gaps?window=15m");
      const gjson = (await g.json()) as { gaps: GapRow[] };
      if (!stop) setGaps((gjson.gaps ?? []).filter((row) => row.eventId === json.event.id));
    }
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [id]);

  const instrument = useMemo(
    () => data?.instruments.find((i) => i.symbol === selected),
    [data, selected],
  );
  const ticker = selected ? data?.tickers[selected] : undefined;
  const gap = gaps.find((g) => g.symbol === selected);

  async function loadNote() {
    if (!data || !selected) return;
    const link = data.event.perps.find((p) => p.symbol === selected);
    if (!link) return;
    setNoteBusy(true);
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: data.event.title,
          question: data.event.question,
          symbol: selected,
          mappingReason: link.mappingReason,
          oddsMove: gap?.oddsMove ?? 0,
          perpMove: gap?.perpMove ?? 0,
          gap: gap?.gap ?? 0,
          leader: gap?.leader ?? "flat",
          signedBeta: link.signedBeta,
        }),
      });
      const json = (await res.json()) as {
        text?: string;
        source?: string;
        model?: string;
        provider?: string;
      };
      setNote(json.text ?? null);
      setNoteSource(
        json.source === "model"
          ? `${json.provider ?? "api"} · ${json.model ?? ""}`
          : "rules (no free API key yet)",
      );
    } finally {
      setNoteBusy(false);
    }
  }

  useEffect(() => {
    if (!data || !selected) return;
    void loadNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.event.id, selected, gap?.score]);

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading event…</p>;

  const { event, news } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Event · signal only</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{event.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{event.question}</p>
        <p className="mt-2 text-sm text-zinc-300">
          Yes {fmtOdds(event.yesPrice)} · volume {fmtPx(event.volume, 0)}
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          Prediction markets are not tradable in this app. Trade the related perp if the mapping names a direction.
        </p>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">Related perps</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#12161c] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Mark</th>
                  <th className="px-3 py-2">β</th>
                  <th className="px-3 py-2">Conf</th>
                  <th className="px-3 py-2">15m gap</th>
                  <th className="px-3 py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {event.perps.map((link) => {
                  const t = data.tickers[link.symbol];
                  const g = gaps.find((row) => row.symbol === link.symbol);
                  return (
                    <tr
                      key={link.symbol}
                      className={`cursor-pointer border-t border-zinc-800 ${selected === link.symbol ? "bg-zinc-900" : "hover:bg-zinc-900/50"}`}
                      onClick={() => setSelected(link.symbol)}
                    >
                      <td className="px-3 py-2">
                        <Link href={`/markets/${link.symbol}`} className="text-zinc-100 hover:underline">
                          {link.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{t ? fmtPx(t.markPrice) : "—"}</td>
                      <td className="px-3 py-2">{link.signedBeta}</td>
                      <td className="px-3 py-2">{link.confidence.toFixed(2)}</td>
                      <td className={`px-3 py-2 ${g ? signedClass(g.gap) : "text-zinc-500"}`}>
                        {g ? fmtPct(g.gap) : "n/a"}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-xs text-zinc-500">{link.mappingReason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-800 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">Interpretation</h2>
            <button
              type="button"
              onClick={() => void loadNote()}
              disabled={noteBusy}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 disabled:opacity-40"
            >
              {noteBusy ? "Writing…" : "Refresh note"}
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {noteBusy
              ? "Local Llama is writing from the mapped fields only…"
              : (note ?? "Uses only the mapping table plus observed odds/mark moves. Will not invent a link.")}
          </p>
          {noteSource ? <p className="mt-2 text-[11px] text-zinc-600">Source: {noteSource}</p> : null}
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">News</h2>
          <NewsList items={news} />
        </section>
      </div>
      {instrument ? <OrderTicket instrument={instrument} ticker={ticker} /> : <p className="text-sm text-zinc-500">Select a mapped perp to trade.</p>}
    </div>
  );
}
