"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import { RowTrace } from "@/components/signal/GapTrace";
import { Sparkline } from "@/components/signal/ResidualChart";
import { PolymarketEventLink } from "@/components/ui";
import { eventTitleKey, residualPath, WINDOW_MS } from "@/lib/divergence";
import { fmtOdds, fmtOddsDelta, fmtPct, signedClass } from "@/lib/format";
import { signalHref } from "@/lib/links";
import { isActionable } from "@/lib/score";
import { impliedMove, mappedBeta, modelForRow } from "@/lib/sensitivity";
import { NEWS_LINK_HOSTS, safeHttpsUrl } from "@/lib/safe-url";
import { thesisLine } from "@/lib/signal";
import type {
  GapRow,
  GapWindow,
  NewsItem,
  ResolvedEvent,
  Snapshot,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** The desk's Event view: the driving event, its gap and recent headlines. */
export function EventRail({
  symbol,
  events,
  selectedId,
  onSelect,
  gaps,
  window,
  oddsHistory,
  markHistory,
  news,
}: {
  symbol: string;
  events: ResolvedEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  gaps: GapRow[];
  window: GapWindow;
  oddsHistory: Record<string, Snapshot[]>;
  markHistory: Snapshot[];
  news: NewsItem[];
}) {
  const unique = (() => {
    const seen = new Set<string>();
    const out: ResolvedEvent[] = [];
    for (const item of events) {
      const key = eventTitleKey(item.title) || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out.sort(
      (a, b) =>
        (gaps.find((g) => g.eventId === b.id)?.score ?? 0) -
        (gaps.find((g) => g.eventId === a.id)?.score ?? 0),
    );
  })();
  const event = unique.find((e) => e.id === selectedId) ?? unique[0];
  const gap = event ? gaps.find((g) => g.eventId === event.id) : undefined;
  const link = event?.perps.find((p) => p.symbol === symbol) ?? event?.perps[0];
  const model = gap && event ? modelForRow(gap, event) : null;
  const path =
    event && link
      ? residualPath({
          odds: oddsHistory[event.id] ?? [],
          marks: markHistory,
          signedBeta: gap?.signedBeta ?? mappedBeta(link),
          implied: model
            ? (pThen, pNow, tThen, tNow) =>
                impliedMove(model, pThen, pNow, tThen, tNow)
            : undefined,
          windowMs: WINDOW_MS[window],
        })
      : [];
  const headlines = news
    .filter(
      (n) =>
        (event && n.eventIds.includes(event.id)) || n.symbols.includes(symbol),
    )
    .slice(0, 3);

  if (!event) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 bg-side px-5 text-[13px] text-subtle">
        <p>No event currently maps to this perp. It still trades — there is just no Leadgap edge here.</p>
        <Link href="/markets" className="lg-focus text-odds underline underline-offset-2">
          See instruments with live signals →
        </Link>
      </div>
    );
  }

  const actionable = gap ? isActionable(gap) : false;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-side">
      <div className="flex flex-col gap-4 p-4">
        {unique.length > 1 ? (
          <label className="block text-[12px] text-subtle">
            Driving event
            <select
              value={event.id}
              onChange={(e) => onSelect(e.target.value)}
              className="lg-select mt-1.5 block h-10 w-full px-3 text-[13px]"
            >
              {unique.slice(0, 12).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="kicker">Driving event</p>
        )}
        <h2 className="serif text-[22px] leading-[1.25]">
          {event.question || event.title}
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-subtle">
          <span className="flex items-baseline gap-1.5">
            Yes <span className="num text-[15px] text-odds">{fmtOdds(event.yesPrice)}</span>
            {gap ? (
              <span className={cn("num text-[11px]", signedClass(gap.oddsMove))}>
                {fmtOddsDelta(gap.oddsMove)}
              </span>
            ) : null}
          </span>
          {gap ? (
            <span className="flex items-baseline gap-1.5">
              Gap{" "}
              <span className={cn("num text-[15px]", actionable ? "text-odds" : "text-subtle")}>
                {fmtPct(gap.gap)}
              </span>
            </span>
          ) : null}
          {gap ? <DirectionChip bias={gap.bias} score={gap.score} size="sm" /> : null}
        </div>
        {gap ? (
          <div className="rounded-[10px] border border-line bg-surface p-3">
            <RowTrace
              row={gap}
              width={320}
              height={90}
              pad={8}
              dots={false}
              className="h-[90px] w-full"
            />
            <p className="mt-2 text-[12px] leading-[1.55] text-subtle">
              {thesisLine(gap)}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-dim">
            No comparable observation on the {window} window.
          </p>
        )}
        {path.length >= 3 ? (
          <div>
            <p className="kicker">Rolling gap · {window}</p>
            <Sparkline
              values={path.map((p) => p.gap)}
              width={320}
              height={40}
              baseline={0}
              className="mt-2 h-10 w-full"
            />
          </div>
        ) : null}
        {headlines.length > 0 ? (
          <div>
            <p className="kicker">Headlines</p>
            <ul className="mt-2 space-y-2">
              {headlines.map((item) => {
                const href = safeHttpsUrl(item.link, NEWS_LINK_HOSTS);
                return (
                  <li key={item.id} className="text-[12px] leading-[1.45]">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="lg-focus text-subtle hover:text-text"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="text-subtle">{item.title}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px]">
          <Link
            href={signalHref({ eventId: event.id, symbol, window })}
            className="lg-focus inline-flex items-center gap-1 text-subtle hover:text-text"
          >
            Full signal <ArrowUpRight size={13} aria-hidden />
          </Link>
          <PolymarketEventLink
            slug={event.slug}
            className="lg-focus inline-flex items-center gap-1 text-dim hover:text-text"
          >
            Open event on Polymarket <ArrowUpRight size={13} aria-hidden />
          </PolymarketEventLink>
        </div>
      </div>
    </div>
  );
}
