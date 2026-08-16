"use client";

import { SignalCard } from "@/components/SignalCard";
import { ResidualSpark } from "@/components/desk/ResidualSpark";
import { MenuSelect } from "@/components/MenuSelect";
import { PolymarketEventLink } from "@/components/ui";
import { eventTitleKey, GAP_WINDOWS, residualPath, WINDOW_MS } from "@/lib/divergence";
import { fmtPct, fmtScore } from "@/lib/format";
import { residualTrend, scoreClass } from "@/lib/score";
import { NEWS_LINK_HOSTS, safeHttpsUrl } from "@/lib/safe-url";
import { catalystImpact } from "@/lib/signal";
import type { GapRow, GapTapePoint, GapWindow, NewsItem, ResidualPoint, ResolvedEvent, Snapshot } from "@/lib/types";

function horizonCopy(windows: Record<GapWindow, GapRow[]> | undefined, eventId: string): string | null {
  if (!windows) return null;
  const score = (w: GapWindow) => windows[w]?.find((g) => g.eventId === eventId)?.score ?? 0;
  const s1m = score("1m");
  const s15 = score("15m");
  const s1h = score("1h");
  const s1d = score("1d");
  if (s1m > s15 + 8) return "Building on the 1m print — residual still opening.";
  if (s1d > s15 + 8 && s1m < s15) return "Larger on 1d than 15m — older move.";
  if (s1h > 0 && s1m > 0 && Math.abs(s1h - s1m) < 8) return "Same setup across 1m–1h.";
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
      <div className="flex h-full flex-col justify-center px-3 text-[12px] text-[var(--muted)]">
        No mapped event. The perp still trades.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface)] text-[11px]">
      <div className="lg-toolbar justify-between gap-2">
        <span className="lg-label">Brief</span>
        <div className="flex min-w-0 items-center gap-2">
          {uniqueEvents.length > 1 ? (
            <MenuSelect
              ariaLabel="Event"
              align="right"
              className="max-w-[180px] py-0.5 text-[11px]"
              menuClassName="w-72"
              value={event.id}
              onChange={onSelect}
              options={uniqueEvents.slice(0, 8).map((item) => ({ id: item.id, label: item.title }))}
            />
          ) : null}
          <PolymarketEventLink slug={event.slug} className="shrink-0 text-[11px] text-[var(--muted)] hover:text-[var(--signal)]" />
        </div>
      </div>

      <div className="border-b border-[var(--line)] px-3 py-3">
        {gap ? <SignalCard row={gap} compact trade={false} /> : (
          <div className="flex items-start justify-between gap-3">
            <p className="event-title text-[15px] text-[var(--text)]">{event.title}</p>
            <PolymarketEventLink slug={event.slug} className="shrink-0 text-[11px] text-[var(--muted)] hover:text-[var(--signal)]" />
          </div>
        )}
      </div>

      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="lg-label mb-1">Horizon</div>
        <div className="grid grid-cols-4 gap-px border border-[var(--line)] bg-[var(--line)]">
          {GAP_WINDOWS.map((w) => {
            const row = windows?.[w]?.find((g) => g.eventId === event.id);
            return (
              <div key={w} className="bg-[var(--surface)] py-1 text-center">
                <div className="lg-label">{w}</div>
                <div className={`num whitespace-nowrap text-[11px] ${row ? scoreClass(row.score) : "text-[var(--dim)]"}`}>
                  {row ? fmtScore(row.score) : "—"}
                </div>
              </div>
            );
          })}
        </div>
        {horizon ? <p className="mt-1.5 text-[10px] leading-4 text-[var(--muted)]">{horizon}</p> : null}
      </div>

      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="lg-label">Residual</span>
          <span className={`text-[10px] ${trend === "expanding" ? "text-[var(--warn)]" : "text-[var(--dim)]"}`}>
            {trend === "expanding" ? "Expanding" : trend === "closing" ? "Closing" : "Stable"}
          </span>
        </div>
        <ResidualSpark points={path} />
      </div>

      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="lg-label mb-1">Catalyst</div>
        {impact ? <p className="mb-1.5 leading-4 text-[var(--text)]">{impact}</p> : null}
        {headlines.length === 0 ? (
          <p className="text-[10px] text-[var(--dim)]">No mapped headline. Impact from Yes probability.</p>
        ) : (
          <ul className="space-y-1">
            {headlines.map((item) => {
              const href = safeHttpsUrl(item.link, NEWS_LINK_HOSTS);
              return (
              <li key={item.id}>
                {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="leading-4 text-[var(--muted)] hover:text-[var(--text)]">
                  {item.title}
                </a>
                ) : (
                  <span className="leading-4 text-[var(--muted)]">{item.title}</span>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {prints.length > 0 ? (
        <div className="px-3 py-2">
          <div className="lg-label mb-1">Prints</div>
          <table className="w-full text-[10px]">
            <tbody>
              {prints.map((p, i) => (
                <tr key={`${p.t}-${i}`} className="border-t border-[var(--line)]">
                  <td className="num py-0.5 text-[var(--dim)]">{new Date(p.t).toLocaleTimeString()}</td>
                  <td className={`num py-0.5 text-right ${scoreClass(p.score)}`}>{fmtScore(p.score)}</td>
                  <td className={`num py-0.5 text-right ${p.leader === "odds" ? "text-[var(--signal)]" : "text-[var(--dim)]"}`}>
                    {fmtPct(p.gap)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
