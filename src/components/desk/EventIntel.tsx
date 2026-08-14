"use client";

import { Spark } from "@/components/Spark";
import { ExpectedActual } from "@/components/desk/ExpectedActual";
import { ResidualSpark } from "@/components/desk/ResidualSpark";
import { Pill } from "@/components/ui";
import { residualPath, WINDOW_MS } from "@/lib/divergence";
import { fmtOdds, fmtOddsDelta, fmtPct, fmtPx, fmtScore, leaderCopy, signedClass } from "@/lib/format";
import {
  biasCopy,
  catchupCopy,
  decisionLine,
  residualTrend,
  scoreClass,
} from "@/lib/score";
import type { GapRow, GapTapePoint, GapWindow, NewsItem, ResidualPoint, ResolvedEvent, Snapshot } from "@/lib/types";

const WINDOWS: GapWindow[] = ["1m", "5m", "15m", "1h"];

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
  const event = events.find((e) => e.id === selectedId) ?? events[0];
  const gap = event ? gaps.find((g) => g.eventId === event.id) : undefined;
  const link = event?.perps.find((p) => p.symbol === symbol) ?? event?.perps[0];
  const path: ResidualPoint[] = event && link
    ? residualPath({
        odds: oddsHistory[event.id] ?? [],
        marks: markHistory,
        signedBeta: link.signedBeta,
        windowMs: WINDOW_MS["15m"],
      })
    : [];
  const trend = residualTrend(path);
  const eventTape = event ? (tape ?? []).filter((p) => p.eventId === event.id) : [];
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

  const expected = gap?.expected ?? (gap ? gap.oddsMove * gap.signedBeta : null);
  const actual = gap?.actual ?? gap?.perpMove ?? null;
  const score = gap?.score ?? 0;
  const bias = gap?.bias ?? "none";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="border-b border-[#1e2636] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-[#5c6478]">Event intel</p>
          {gap ? (
            <span className={`num text-xs font-semibold ${scoreClass(score)}`}>{fmtScore(score)}</span>
          ) : null}
        </div>
        {events.length > 1 ? (
          <div className="mt-2 flex max-h-24 flex-col gap-0.5 overflow-auto">
            {events.map((item) => {
              const on = item.id === event.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`truncate rounded px-2 py-1 text-left text-[11px] ${
                    on ? "bg-white/[0.08] text-white" : "text-[#8b93a7] hover:text-white"
                  }`}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 px-3 py-3">
        <div>
          <p className="text-sm font-medium leading-5 text-zinc-100">{event.title}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#8b93a7]">{event.question}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] text-[#5c6478]">Leadgap Score</div>
            <div className={`num text-3xl font-semibold leading-none ${scoreClass(score)}`}>
              {gap ? fmtScore(score) : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#5c6478]">Yes</div>
            <div className="num text-lg font-semibold text-[#3ee0a8]">{fmtOdds(event.yesPrice)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Pill tone={bias === "long" ? "long" : bias === "short" ? "short" : "mute"}>
            {biasCopy(bias, symbol)}
          </Pill>
          {gap ? (
            <Pill tone={gap.leader === "odds" ? "lead" : gap.leader === "perp" ? "perp" : "mute"}>
              {leaderCopy(gap.leader)}
            </Pill>
          ) : null}
          <Pill tone={trend === "expanding" ? "warn" : trend === "closing" ? "lead" : "mute"}>
            {trend === "expanding" ? "Gap expanding" : trend === "closing" ? "Gap closing" : "Gap stable"}
          </Pill>
        </div>
        <p className="text-[12px] leading-4 text-zinc-200">
          {gap
            ? decisionLine({
                bias,
                leader: gap.leader,
                symbol,
                catchup: gap.catchup,
                score,
              })
            : "Need a 15m sample of odds and mark before a Leadgap Score prints."}
        </p>
        {expected != null && actual != null ? <ExpectedActual expected={expected} actual={actual} /> : null}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-[#5c6478]">
            <span>Expected vs mark</span>
            <span>
              <span className="text-[#3ee0a8]">implied</span>
              {" · "}
              <span className="text-[#4d8dff]">actual</span>
            </span>
          </div>
          <ResidualSpark points={path} />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {WINDOWS.map((w) => {
            const row = windows?.[w]?.find((g) => g.eventId === event.id);
            return (
              <div key={w} className="rounded-md bg-white/[0.03] px-1.5 py-1.5 text-center">
                <div className="text-[9px] uppercase text-[#5c6478]">{w}</div>
                <div className={`num text-xs font-medium ${row ? scoreClass(row.score) : "text-[#5c6478]"}`}>
                  {row ? fmtScore(row.score) : "—"}
                </div>
              </div>
            );
          })}
        </div>
        <Spark points={oddsHistory[event.id] ?? []} className="h-10" />
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-[#8b93a7]">
          <dt>Odds Δ 15m</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.oddsMove) : ""}`}>
            {gap ? fmtOddsDelta(gap.oddsMove) : "—"}
          </dd>
          <dt>Mark Δ 15m</dt>
          <dd className={`num text-right ${gap ? signedClass(gap.perpMove) : ""}`}>
            {gap ? fmtPct(gap.perpMove) : "—"}
          </dd>
          <dt>Caught up</dt>
          <dd className="num text-right text-zinc-300">{gap ? catchupCopy(gap.catchup) : "—"}</dd>
          <dt>Beta</dt>
          <dd className="num text-right">{link ? link.signedBeta.toFixed(2) : "—"}</dd>
          <dt>Map conf</dt>
          <dd className="num text-right">{link ? `${Math.round(link.confidence * 100)}%` : "—"}</dd>
          <dt>Volume</dt>
          <dd className="num text-right">{fmtPx(event.volume, 0)}</dd>
        </dl>
        {eventTape.length > 2 ? (
          <p className="text-[11px] leading-4 text-[#5c6478]">
            Score history {fmtScore(eventTape[0]!.score)} → {fmtScore(eventTape[eventTape.length - 1]!.score)} over{" "}
            {Math.max(1, Math.round((eventTape[eventTape.length - 1]!.t - eventTape[0]!.t) / 60_000))}m sampled.
          </p>
        ) : null}
        <p className="text-[11px] leading-4 text-[#5c6478]">
          {link?.mappingReason ?? "Mapped from aliases and tags."} Trade the perp, not the event book. Not a
          recommendation.
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
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] leading-4 text-zinc-300 hover:text-white"
                >
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
