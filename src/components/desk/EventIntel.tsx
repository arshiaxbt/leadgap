"use client";

import { SignalCard } from "@/components/SignalCard";
import { ResidualSpark } from "@/components/desk/ResidualSpark";
import { eventTitleKey, GAP_WINDOWS, residualPath, WINDOW_MS } from "@/lib/divergence";
import { fmtPct, fmtScore, signedClass } from "@/lib/format";
import { residualTrend, scoreClass } from "@/lib/score";
import { catalystImpact } from "@/lib/signal";
import type { GapRow, GapTapePoint, GapWindow, NewsItem, ResidualPoint, ResolvedEvent, Snapshot } from "@/lib/types";

function horizonCopy(windows: Record<GapWindow, GapRow[]> | undefined, eventId: string): string | null {
  if (!windows) return null;
  const score = (w: GapWindow) => windows[w]?.find((g) => g.eventId === eventId)?.score ?? 0;
  const s1m = score("1m");
  const s15 = score("15m");
  const s1h = score("1h");
  const s1d = score("1d");
  if (s1m > s15 + 8) return "Building on the 1m print — the residual is still opening.";
  if (s1d > s15 + 8 && s1m < s15) return "Larger on the 1d than 15m — this move is older than the current window.";
  if (s1h > 0 && s1m > 0 && Math.abs(s1h - s1m) < 8) return "Same setup across 1m–1h. Not a one-print spike.";
  return null;
}

export function EventIntel({
  symbol,
  events,
  selectedId,
  onSelect,
  gaps,
  windows,
  oddsHistory,
  markHistory,
  tape,
  news,
}: {
  symbol: string;
  events: ResolvedEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  gaps: GapRow[];
  windows?: Record<GapWindow, GapRow[]>;
  oddsHistory: Record<string, Snapshot[]>;
  markHistory: Snapshot[];
  tape?: GapTapePoint[];
  news: NewsItem[];
}) {
  const uniqueEvents = (() => {
    const seen = new Set<string>();
    const out: ResolvedEvent[] = [];
    for (const item of events) {
      const key = eventTitleKey(item.title) || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  })();
  const event = uniqueEvents.find((e) => e.id === selectedId) ?? uniqueEvents[0];
  const gap = event ? gaps.find((g) => g.eventId === event.id) : undefined;
  const link = event?.perps.find((p) => p.symbol === symbol) ?? event?.perps[0];
  const path: ResidualPoint[] =
    event && link
      ? residualPath({
          odds: oddsHistory[event.id] ?? [],
          marks: markHistory,
          signedBeta: link.signedBeta,
          windowMs: WINDOW_MS["15m"],
        })
      : [];
  const trend = residualTrend(path);
  const headlines = news
    .filter((n) => (event && n.eventIds.includes(event.id)) || n.symbols.includes(symbol))
    .slice(0, 2);
  const prints = (tape ?? [])
    .filter((p) => p.eventId === event?.id && p.symbol === symbol && p.score >= 12)
    .slice(-5)
    .reverse();
  const impact = catalystImpact(gap);
  const horizon = event ? horizonCopy(windows, event.id) : null;

  if (!event) {
    return (
      <div className="flex h-full flex-col justify-center px-3 text-[12px] text-[#7d8699]">
        No mapped event. The perp still trades.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto text-[11px]">
      <div className="border-b border-[#1a2030] px-2 py-1">
        <p className="text-[10px] uppercase tracking-wide text-[#7d8699]">Event intel</p>
        {uniqueEvents.length > 1 ? (
          <div className="mt-1 max-h-14 overflow-auto">
            {uniqueEvents.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`block w-full truncate rounded px-1 py-0.5 text-left ${
                  item.id === event.id ? "bg-white/[0.06] text-white" : "text-[#7d8699] hover:text-white"
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5 px-2 py-1.5">
        {gap ? <SignalCard row={gap} compact trade={false} /> : (
          <p className="text-[13px] font-medium leading-4 text-zinc-100">{event.title}</p>
        )}

        <div className="grid grid-cols-4 gap-px overflow-hidden rounded border border-[#1a2030] bg-[#1a2030]">
          {GAP_WINDOWS.map((w) => {
            const row = windows?.[w]?.find((g) => g.eventId === event.id);
            return (
              <div key={w} className="bg-[#0e1118] py-1 text-center">
                <div className="text-[9px] uppercase text-[#7d8699]">{w}</div>
                <div className={`num text-[11px] font-medium ${row ? scoreClass(row.score) : "text-[#7d8699]"}`}>
                  {row ? fmtScore(row.score) : "—"}
                </div>
              </div>
            );
          })}
        </div>
        {horizon ? <p className="leading-4 text-[#8b93a7]">{horizon}</p> : null}

        <div>
          <div className="mb-0.5 flex justify-between text-[9px] uppercase tracking-wide text-[#7d8699]">
            <span>Expected vs actual</span>
            <span className={trend === "expanding" ? "text-amber-200" : "text-[#7d8699]"}>
              {trend === "expanding" ? "Gap expanding" : trend === "closing" ? "Gap closing" : "Stable"}
            </span>
          </div>
          <ResidualSpark points={path} />
        </div>
      </div>

      <div className="border-t border-[#1a2030] px-2 py-1.5">
        <p className="mb-1 text-[9px] uppercase tracking-wide text-[#7d8699]">Catalyst</p>
        {impact ? <p className="mb-1.5 leading-4 text-zinc-200">{impact}</p> : null}
        {headlines.length === 0 ? (
          <p className="text-[#7d8699]">No mapped headline. Impact above is from Yes probability, not a news summary.</p>
        ) : (
          <ul className="space-y-1.5">
            {headlines.map((item) => (
              <li key={item.id}>
                <a href={item.link} target="_blank" rel="noreferrer" className="leading-4 text-zinc-300 hover:text-white">
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {prints.length > 0 ? (
        <div className="border-t border-[#1a2030] px-2 py-1.5">
          <p className="mb-1 text-[9px] uppercase tracking-wide text-[#7d8699]">Recent prints</p>
          <ul className="space-y-0.5">
            {prints.map((p, i) => (
              <li key={`${p.t}-${i}`} className="flex justify-between gap-2 text-[#8b93a7]">
                <span className="num">{new Date(p.t).toLocaleTimeString()}</span>
                <span className={`num ${scoreClass(p.score)}`}>{fmtScore(p.score)}</span>
                <span className={`num ${signedClass(p.gap)}`}>{fmtPct(p.gap)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
