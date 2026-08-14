"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtOdds, fmtPct, leaderCopy, signedClass } from "@/lib/format";
import type { GapRow, GapWindow } from "@/lib/types";
import { Empty, LiveDot, Panel, Pill, Segmented } from "@/components/ui";

const WINDOWS: { id: GapWindow; label: string }[] = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
];

export function OpportunityFeed() {
  const [window, setWindow] = useState<GapWindow>("15m");
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [events, setEvents] = useState<
    { id: string; title: string; question: string; yesPrice: number; volume: number; perps: { symbol: string }[] }[]
  >([]);
  const [asOf, setAsOf] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [gapRes, eventRes] = await Promise.all([
          fetch(`/api/gaps?window=${window}`),
          fetch("/api/events"),
        ]);
        const data = (await gapRes.json()) as { gaps: GapRow[]; asOf: number; error: string | null };
        const ev = (await eventRes.json()) as { events?: typeof events };
        if (stop) return;
        setGaps(data.gaps ?? []);
        setEvents(ev.events ?? []);
        setAsOf(data.asOf);
        setError(data.error);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load markets.");
      } finally {
        if (!stop) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [window]);

  const maxScore = useMemo(() => Math.max(...gaps.map((g) => g.score), 0.0001), [gaps]);
  const shown = gaps.slice(0, 60);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Odds first. Then the perp.</h1>
          <p className="mt-2 text-sm leading-6 text-[#8b93a7]">
            Leadgap watches Polymarket event books against every live perp. When implied odds reprice
            and the mark has not caught up, it surfaces here. Trade the perp — events are signal only.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
          <Segmented options={WINDOWS} value={window} onChange={setWindow} />
        </div>
      </div>

      {error ? <p className="text-sm text-amber-200">{error}</p> : null}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      ) : shown.length === 0 ? (
        <Empty
          title="No gap in this window yet"
          body="Books are sampling. Linked events are below — open one when a lead appears."
        />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-[#5c6478]">
              <tr>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">Perp</th>
                <th className="px-3 py-3 font-medium">Odds</th>
                <th className="px-3 py-3 font-medium">Odds Δ</th>
                <th className="px-3 py-3 font-medium">Mark Δ</th>
                <th className="px-3 py-3 font-medium">Gap</th>
                <th className="px-3 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Strength</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={`${row.eventId}-${row.symbol}`} className="border-t border-[#1e2636] hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/markets/${row.symbol}?event=${row.eventId}`} className="font-medium text-zinc-100 hover:text-white">
                      {row.title}
                    </Link>
                    <div className="mt-0.5 max-w-sm truncate text-xs text-[#5c6478]">{row.question}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/markets/${row.symbol}`} className="text-[#8bb4ff] hover:text-white">
                      {row.symbol.replace("-USD", "")}
                    </Link>
                  </td>
                  <td className="num px-3 py-3">{fmtOdds(row.yesPrice)}</td>
                  <td className={`num px-3 py-3 ${signedClass(row.oddsMove)}`}>{fmtPct(row.oddsMove)}</td>
                  <td className={`num px-3 py-3 ${signedClass(row.perpMove)}`}>{fmtPct(row.perpMove)}</td>
                  <td className={`num px-3 py-3 ${signedClass(row.gap)}`}>{fmtPct(row.gap)}</td>
                  <td className="px-3 py-3">
                    <Pill tone={row.leader === "odds" ? "lead" : row.leader === "perp" ? "perp" : "mute"}>
                      {leaderCopy(row.leader)}
                    </Pill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-[#3ee0a8]"
                        style={{ width: `${Math.max(8, (row.score / maxScore) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {events.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-200">Linked events</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events
              .filter((event) => event.perps[0]?.symbol)
              .slice(0, 12)
              .map((event) => (
              <Link key={event.id} href={`/markets/${event.perps[0]!.symbol}?event=${event.id}`}>
                <Panel className="h-full p-4 transition hover:border-[#3ee0a8]/30">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-xs text-[#3ee0a8]">{fmtOdds(event.yesPrice)}</span>
                    <span className="truncate text-[11px] text-[#5c6478]">
                      {event.perps.map((p) => p.symbol.replace("-USD", "")).join(" · ")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-100">{event.title}</p>
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
