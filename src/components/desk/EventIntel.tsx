"use client";

import { Spark } from "@/components/Spark";
import { ResidualSpark } from "@/components/desk/ResidualSpark";
import { Pill } from "@/components/ui";
import { eventTitleKey, GAP_WINDOWS, residualPath, WINDOW_MS } from "@/lib/divergence";
import { fmtOdds, fmtOddsDelta, fmtPct, fmtScore, leaderCopy, signedClass } from "@/lib/format";
import {
  biasCopy,
  catchupCopy,
  decisionLine,
  residualTrend,
  scoreClass,
} from "@/lib/score";
import type { GapRow, GapTapePoint, GapWindow, NewsItem, ResidualPoint, ResolvedEvent, Snapshot } from "@/lib/types";

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

  if (!event) {
    return (
      <div className="flex h-full flex-col justify-center px-3 text-[12px] text-[#7d8699]">
        No mapped event. The perp still trades.
      </div>
    );
  }

  const score = gap?.score ?? 0;
  const bias = gap?.bias ?? "none";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto text-[11px]">
      <div className="border-b border-[#1a2030] px-2 py-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[10px] uppercase tracking-wide text-[#7d8699]">Event</p>
          <span className={`num text-sm font-semibold ${scoreClass(score)}`}>
            {gap ? fmtScore(score) : "—"}
          </span>
        </div>
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
        <div>
          <p className="text-[13px] font-medium leading-4 text-zinc-100">{event.title}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="num text-lg font-semibold text-[#3ee0a8]">{fmtOdds(event.yesPrice)}</span>
            <div className="flex flex-wrap justify-end gap-1">
              <Pill tone={bias === "long" ? "long" : bias === "short" ? "short" : "mute"}>
                {biasCopy(bias, symbol)}
              </Pill>
              {gap ? (
                <Pill tone={gap.leader === "odds" ? "lead" : gap.leader === "perp" ? "perp" : "mute"}>
                  {leaderCopy(gap.leader)}
                </Pill>
              ) : null}
            </div>
          </div>
        </div>

        <p className="leading-4 text-zinc-200">
          {gap
            ? decisionLine({
                bias,
                leader: gap.leader,
                symbol,
                catchup: gap.catchup,
                score,
              })
            : "Waiting on a 15m odds/mark sample."}
        </p>

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

        <div>
          <div className="mb-0.5 flex justify-between text-[9px] uppercase tracking-wide text-[#7d8699]">
            <span>Implied vs mark</span>
            <span className={trend === "expanding" ? "text-amber-200" : "text-[#7d8699]"}>
              {trend === "expanding" ? "Expanding" : trend === "closing" ? "Closing" : "Stable"}
            </span>
          </div>
          <ResidualSpark points={path} />
        </div>

        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#7d8699]">
          <dt>Odds 15m</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.oddsMove) : ""}`}>
            {gap ? fmtOddsDelta(gap.oddsMove) : "—"}
          </dd>
          <dt>Mark 15m</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.perpMove) : ""}`}>
            {gap ? fmtPct(gap.perpMove) : "—"}
          </dd>
          <dt>Catch-up</dt>
          <dd className="num text-right text-zinc-300">{gap ? catchupCopy(gap.catchup) : "—"}</dd>
          <dt>Beta</dt>
          <dd className="num text-right">{link ? link.signedBeta.toFixed(2) : "—"}</dd>
        </dl>
        <Spark points={oddsHistory[event.id] ?? []} className="h-8" />
      </div>

      <div className="border-t border-[#1a2030] px-2 py-1.5">
        <p className="mb-1 text-[9px] uppercase tracking-wide text-[#7d8699]">Catalyst</p>
        {headlines.length === 0 ? (
          <p className="text-[#7d8699]">No headlines.</p>
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
    </div>
  );
}
