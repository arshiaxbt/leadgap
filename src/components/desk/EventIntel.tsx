"use client";

import { Spark } from "@/components/Spark";
import { Pill } from "@/components/ui";
import { fmtOdds, fmtPct, fmtPx, leaderCopy, signedClass } from "@/lib/format";
import type { GapRow, NewsItem, ResolvedEvent, Snapshot } from "@/lib/types";

export function EventIntel({
  symbol,
  events,
  selectedId,
  onSelect,
  gaps,
  oddsHistory,
  news,
}: {
  symbol: string;
  events: ResolvedEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  gaps: GapRow[];
  oddsHistory: Record<string, Snapshot[]>;
  news: NewsItem[];
}) {
  const event = events.find((e) => e.id === selectedId) ?? events[0];
  const gap = event ? gaps.find((g) => g.eventId === event.id) : undefined;
  const expected = gap ? gap.oddsMove * gap.signedBeta : null;
  const headlines = news
    .filter((n) => (event && n.eventIds.includes(event.id)) || n.symbols.includes(symbol))
    .slice(0, 3);

  if (!event) {
    return (
      <div className="flex h-full flex-col justify-center px-4 text-sm text-[#8b93a7]">
        No linked Polymarket event yet. The perp still trades — intel appears when odds map.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="border-b border-[#1e2636] px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-[#5c6478]">Event intel</p>
        {events.length > 1 ? (
          <select
            value={event.id}
            onChange={(e) => onSelect(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#1e2636] bg-[#07080c] px-2 py-1 text-xs text-zinc-200"
          >
            {events.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="space-y-3 px-3 py-3">
        <div>
          <p className="text-sm font-medium leading-5 text-zinc-100">{event.title}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#8b93a7]">{event.question}</p>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] text-[#5c6478]">Yes</div>
            <div className="num text-2xl font-semibold text-[#3ee0a8]">{fmtOdds(event.yesPrice)}</div>
          </div>
          {gap ? (
            <Pill tone={gap.leader === "odds" ? "lead" : gap.leader === "perp" ? "perp" : "mute"}>
              {leaderCopy(gap.leader)}
            </Pill>
          ) : null}
        </div>
        <Spark points={oddsHistory[event.id] ?? []} className="h-12" />
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-[#8b93a7]">
          <dt>Odds Δ 15m</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.oddsMove) : ""}`}>
            {gap ? fmtPct(gap.oddsMove) : "—"}
          </dd>
          <dt>Mark Δ 15m</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.perpMove) : ""}`}>
            {gap ? fmtPct(gap.perpMove) : "—"}
          </dd>
          <dt>Expected</dt>
          <dd className={`num text-right ${expected != null ? signedClass(expected) : ""}`}>
            {expected != null ? fmtPct(expected) : "—"}
          </dd>
          <dt>Actual perp</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.perpMove) : ""}`}>
            {gap ? fmtPct(gap.perpMove) : "—"}
          </dd>
          <dt>Gap</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.gap) : ""}`}>
            {gap ? fmtPct(gap.gap) : "—"}
          </dd>
          <dt>Volume</dt>
          <dd className="num text-right">{fmtPx(event.volume, 0)}</dd>
        </dl>
        <p className="text-[11px] leading-4 text-[#5c6478]">
          Expected is odds move times mapped beta. Trade the perp, not the event book.
        </p>
      </div>
      <div className="mt-auto border-t border-[#1e2636] px-3 py-2">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-[#5c6478]">Catalyst</p>
        {headlines.length === 0 ? (
          <p className="text-[11px] text-[#5c6478]">No headlines yet.</p>
        ) : (
          <ul className="space-y-2">
            {headlines.map((item) => (
              <li key={item.id}>
                <a href={item.link} target="_blank" rel="noreferrer" className="text-[12px] leading-4 text-zinc-300 hover:text-white">
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
