"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NewsList } from "@/components/NewsList";
import { OrderTicket } from "@/components/OrderTicket";
import { Panel, Pill } from "@/components/ui";
import { fmtOdds, fmtPct, fmtPx, leaderCopy, signedClass } from "@/lib/format";
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
  const [noteBusy, setNoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/events/${id}`);
      if (!res.ok) {
        if (!stop) setError("Event not found yet.");
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
      const json = (await res.json()) as { text?: string };
      setNote(json.text ?? null);
    } finally {
      setNoteBusy(false);
    }
  }

  useEffect(() => {
    if (!data || !selected) return;
    void loadNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.event.id, selected, gap?.score]);

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-white/5" />;

  const { event, news } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div>
          <p className="text-xs text-[#8b93a7]">Event · signal only</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{event.title}</h1>
          <p className="mt-1 text-sm text-[#8b93a7]">{event.question}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="num text-3xl font-semibold text-[#3ee0a8]">{fmtOdds(event.yesPrice)}</span>
            <span className="text-xs text-[#5c6478]">Yes · vol {fmtPx(event.volume, 0)}</span>
            {gap ? (
              <Pill tone={gap.leader === "odds" ? "lead" : gap.leader === "perp" ? "perp" : "mute"}>
                {leaderCopy(gap.leader)}
              </Pill>
            ) : null}
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-200">Related perps</h2>
          <Panel className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-[#5c6478]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Market</th>
                  <th className="px-3 py-2.5 font-medium">Mark</th>
                  <th className="px-3 py-2.5 font-medium">15m gap</th>
                  <th className="px-4 py-2.5 font-medium">Theme</th>
                </tr>
              </thead>
              <tbody>
                {event.perps.map((link) => {
                  const t = data.tickers[link.symbol];
                  const g = gaps.find((row) => row.symbol === link.symbol);
                  const on = selected === link.symbol;
                  return (
                    <tr
                      key={link.symbol}
                      className={`cursor-pointer border-t border-[#1e2636] ${on ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}`}
                      onClick={() => setSelected(link.symbol)}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/markets/${link.symbol}`} className="font-medium text-zinc-100 hover:text-white">
                          {link.symbol.replace("-USD", "")}
                        </Link>
                      </td>
                      <td className="num px-3 py-3">{t ? fmtPx(t.markPrice) : "—"}</td>
                      <td className={`num px-3 py-3 ${g ? signedClass(g.gap) : "text-[#5c6478]"}`}>
                        {g ? fmtPct(g.gap) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Pill>{link.cluster}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </section>

        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-100">Read</h2>
            <button
              type="button"
              onClick={() => void loadNote()}
              disabled={noteBusy}
              className="text-xs text-[#8b93a7] hover:text-white disabled:opacity-40"
            >
              {noteBusy ? "Writing…" : "Refresh"}
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#b4bccb]">
            {noteBusy ? "Writing from the mapped fields…" : (note ?? "A short note from the mapped odds and mark move.")}
          </p>
        </Panel>

        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-200">News</h2>
          <NewsList items={news} />
        </section>
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        {instrument ? (
          <OrderTicket instrument={instrument} ticker={ticker} />
        ) : (
          <p className="text-sm text-[#8b93a7]">Select a perp to trade.</p>
        )}
      </div>
    </div>
  );
}
