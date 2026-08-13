"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtOdds, fmtPct, signedClass } from "@/lib/format";
import type { GapRow, GapWindow } from "@/lib/types";

const WINDOWS: GapWindow[] = ["1m", "5m", "15m", "1h"];

export function OpportunityFeed() {
  const [window, setWindow] = useState<GapWindow>("15m");
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string; question: string; yesPrice: number; volume: number; perps: { symbol: string }[] }[]>([]);
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
        if (!stop) setError(err instanceof Error ? err.message : "failed");
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Event / perp gaps</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Odds move vs mark move on mapped Polymarket events. The server samples books in the
            background — you do not need to leave this tab open. News is context. Trade the perp, not
            the event book. A highlight is not a recommendation.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={`rounded px-2.5 py-1 text-xs ${window === w ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="mb-3 text-xs text-amber-400">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Loading live books… first ingest can take ~30s.</p> : null}
      {!loading && gaps.length === 0 ? (
        <div className="mb-6 rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">
          No scored gap in this window yet. Leadgap keeps sampling on the server every 20 seconds, even
          if you close the tab. Mapped live events are listed below.
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[#12161c] text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Perp</th>
              <th className="px-3 py-2">Odds</th>
              <th className="px-3 py-2">Odds Δ</th>
              <th className="px-3 py-2">Mark Δ</th>
              <th className="px-3 py-2">Gap</th>
              <th className="px-3 py-2">Leader</th>
              <th className="px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {gaps.slice(0, 80).map((row) => (
              <tr key={`${row.eventId}-${row.symbol}`} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                <td className="px-3 py-2">
                  <Link href={`/events/${row.eventId}`} className="text-zinc-100 hover:underline">
                    {row.title}
                  </Link>
                  <div className="max-w-md truncate text-xs text-zinc-500">{row.question}</div>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/markets/${row.symbol}`} className="text-zinc-200 hover:underline">
                    {row.symbol}
                  </Link>
                </td>
                <td className="px-3 py-2">{fmtOdds(row.yesPrice)}</td>
                <td className={`px-3 py-2 ${signedClass(row.oddsMove)}`}>{fmtPct(row.oddsMove)}</td>
                <td className={`px-3 py-2 ${signedClass(row.perpMove)}`}>{fmtPct(row.perpMove)}</td>
                <td className={`px-3 py-2 ${signedClass(row.gap)}`}>{fmtPct(row.gap)}</td>
                <td className="px-3 py-2 text-zinc-400">{row.leader}</td>
                <td className="px-3 py-2 text-zinc-300">{row.score.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {asOf ? (
        <p className="mt-3 text-xs text-zinc-600">As of {new Date(asOf).toLocaleTimeString()}</p>
      ) : null}
      {events.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-100">Mapped live events</h2>
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {events.slice(0, 40).map((event) => (
              <li key={event.id} className="px-3 py-3">
                <Link href={`/events/${event.id}`} className="text-zinc-100 hover:underline">
                  {event.title}
                </Link>
                <div className="text-xs text-zinc-500">
                  Yes {fmtOdds(event.yesPrice)} · {event.perps.map((p) => p.symbol).join(", ")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
