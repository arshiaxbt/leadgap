"use client";

import { GapMeter } from "@/components/GapMeter";
import { MenuSelect } from "@/components/MenuSelect";
import { OddsFigure } from "@/components/OddsFigure";
import { ResidualSpark } from "@/components/desk/ResidualSpark";
import { PolymarketEventLink } from "@/components/ui";
import { eventTitleKey, residualPath, WINDOW_MS } from "@/lib/divergence";
import { fmtOdds, fmtPct, fmtScore } from "@/lib/format";
import { scoreClass } from "@/lib/score";
import { safeHttpsUrl } from "@/lib/safe-url";
import { thesisLine } from "@/lib/signal";
import type { GapRow, GapTapePoint, GapWindow, NewsItem, ResidualPoint, ResolvedEvent, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EventRail({
  symbol,
  events,
  selectedId,
  onSelect,
  gaps,
  windows: _windows,
  oddsHistory,
  markHistory,
  tape: _tape,
  news,
  collapsed = false,
  onToggle,
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
  collapsed?: boolean;
  onToggle?: () => void;
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
    return out.sort((a, b) => {
      const sa = gaps.find((g) => g.eventId === a.id)?.score ?? 0;
      const sb = gaps.find((g) => g.eventId === b.id)?.score ?? 0;
      return sb - sa;
    });
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
  const headlines = news
    .filter((n) => (event && n.eventIds.includes(event.id)) || n.symbols.includes(symbol))
    .slice(0, 2);
  const expected = gap ? (gap.expected ?? gap.oddsMove * gap.signedBeta) : 0;
  const actual = gap ? (gap.actual ?? gap.perpMove) : 0;

  if (!event) {
    return (
      <div className="relative flex h-full flex-col justify-center px-3 text-[12px] text-[var(--muted)]">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-1 top-1 px-1.5 py-0.5 text-[11px] text-[var(--dim)] hover:text-[var(--text)]"
            aria-label="Collapse event rail"
          >
            ‹
          </button>
        ) : null}
        No mapped event. The perp still trades.
      </div>
    );
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex h-full w-full flex-col items-center gap-2 overflow-hidden px-1 py-2 hover:bg-[var(--hover)]"
        aria-label="Expand event rail"
      >
        <span className="num text-[12px] text-[var(--odds)]">{fmtOdds(event.yesPrice)}</span>
        <span
          className="max-h-full truncate text-[11px] text-[var(--muted)]"
          style={{ writingMode: "vertical-rl" }}
        >
          {event.title}
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface)]">
      <div className="flex items-center gap-1 border-b border-[var(--line)] px-2 py-1.5">
        {uniqueEvents.length > 1 ? (
          <MenuSelect
            ariaLabel="Event"
            className="min-w-0 flex-1 py-0.5 text-[11px]"
            menuClassName="w-72"
            value={event.id}
            onChange={onSelect}
            options={uniqueEvents.slice(0, 8).map((item) => ({ id: item.id, label: item.title }))}
          />
        ) : (
          <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">{event.title}</p>
        )}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 px-1.5 py-0.5 text-[11px] text-[var(--dim)] hover:text-[var(--text)]"
            aria-label="Collapse event rail"
          >
            ‹
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-3">
        <p className="text-[13px] leading-5 text-[var(--text)]">{event.question || event.title}</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[var(--dim)]">Yes</span>
            <OddsFigure yes={event.yesPrice} delta={gap?.oddsMove} size="sm" />
          </span>
          {gap ? (
            <>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-[var(--dim)]">Gap</span>
                <span className={cn("num", gap.leader === "odds" ? "text-[var(--odds)]" : "text-[var(--dim)]")}>
                  {fmtPct(gap.gap)}
                </span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-[var(--dim)]">Score</span>
                <span className={cn("num", scoreClass(gap.score))}>{fmtScore(gap.score)}</span>
              </span>
            </>
          ) : null}
        </div>
        {gap ? <GapMeter expected={expected} actual={actual} /> : null}
        {gap ? <p className="text-[12px] leading-5 text-[var(--text)]">{thesisLine(gap)}</p> : null}
        <ResidualSpark points={path} className="h-8" />
        {headlines.length > 0 ? (
          <ul className="space-y-1">
            {headlines.map((item) => {
              const href = safeHttpsUrl(item.link);
              return (
                <li key={item.id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] leading-4 text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span className="text-[12px] leading-4 text-[var(--muted)]">{item.title}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        <PolymarketEventLink
          slug={event.slug}
          className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
        >
          Open event on Polymarket
        </PolymarketEventLink>
      </div>
    </div>
  );
}
