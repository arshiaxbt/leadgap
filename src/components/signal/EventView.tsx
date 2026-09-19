"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import { FeedStamp } from "@/components/signal/FeedStamp";
import { RowTrace } from "@/components/signal/GapTrace";
import { Sparkline } from "@/components/signal/ResidualChart";
import { PolymarketEventLink } from "@/components/ui";
import { GAP_WINDOWS, WINDOW_MS, valueAtOrBefore } from "@/lib/divergence";
import {
  fmtCompact,
  fmtOdds,
  fmtOddsDelta,
  fmtPct,
  signedClass,
} from "@/lib/format";
import { readJson } from "@/lib/http";
import { deskHref, signalHref } from "@/lib/links";
import { isActionable } from "@/lib/score";
import { NEWS_LINK_HOSTS, safeHttpsUrl } from "@/lib/safe-url";
import { mappingLabel, perpName } from "@/lib/signal";
import type {
  GapRow,
  GapWindow,
  LinkedPerp,
  NewsItem,
  PerpsTicker,
  ResolvedEvent,
  Snapshot,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type EventPayload = {
  event: ResolvedEvent;
  tickers: Record<string, PerpsTicker>;
  windows?: Record<GapWindow, GapRow[]>;
  oddsHistory?: Snapshot[];
  news: NewsItem[];
  asOf: number;
};

function shortReason(link: LinkedPerp): string {
  const beta = `Signed beta ${link.signedBeta >= 0 ? "+" : ""}${link.signedBeta.toFixed(2)}`;
  return link.mappingKind === "named"
    ? `${beta} · the event names ${perpName(link.symbol)} directly.`
    : `${beta} · ${mappingLabel(link).toLowerCase()} link, weaker than a direct name.`;
}

export function EventView({ eventId }: { eventId: string }) {
  const [window, setWindow] = useState<GapWindow>("1h");
  const query = useQuery({
    queryKey: ["event", eventId],
    queryFn: ({ signal }) =>
      readJson<EventPayload>(`/api/events/${encodeURIComponent(eventId)}`, signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  });
  const data = query.data;

  if (query.isPending)
    return (
      <div aria-busy="true" aria-label="Loading event" className="px-6 pt-6">
        <div className="h-3 w-48 rounded-[3px] bg-raise" />
        <div className="mt-5 h-9 w-2/3 rounded-[4px] bg-raise" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 rounded-[10px] bg-surface" />
          ))}
        </div>
      </div>
    );

  if (!data?.event) {
    return (
      <div className="m-auto max-w-md px-6 py-16 text-center">
        <p className="kicker">Event</p>
        <h1 className="serif mt-3 text-[30px]">Event not found</h1>
        <p className="mt-3 text-[13px] leading-[1.65] text-subtle">
          It may have resolved, or it hasn’t been collected yet.
        </p>
        <Link
          href="/"
          className="lg-focus mt-6 inline-flex h-9 items-center rounded-[7px] border border-line-strong px-4 text-[13px] text-subtle hover:text-text"
        >
          Back to Signals
        </Link>
      </div>
    );
  }

  const event = data.event;
  const rows = data.windows?.[window] ?? [];
  const odds = data.oddsHistory ?? [];
  const then = odds.length ? valueAtOrBefore(odds, data.asOf - WINDOW_MS[window]) : null;
  const delta = rows[0]?.oddsMove ?? (then != null ? event.yesPrice - then : null);
  const perps = [...new Map(event.perps.map((p) => [p.symbol, p])).values()]
    .map((link) => ({
      link,
      row: rows.find((r) => r.symbol === link.symbol),
    }))
    .sort((a, b) => Math.abs(b.row?.gap ?? -1) - Math.abs(a.row?.gap ?? -1));
  const cluster = event.perps[0] ? mappingLabel(event.perps[0]) : "Mapped event";

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-4 pt-6 pb-10 md:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <nav aria-label="Breadcrumb" className="num flex min-w-0 items-center gap-2.5 text-[11px] text-dim">
            <Link href="/" className="lg-focus text-subtle hover:text-text">
              SIGNALS
            </Link>
            <span aria-hidden>/</span>
            <span aria-current="page" className="truncate text-mark uppercase">
              Event
            </span>
          </nav>
          <FeedStamp
            className="ml-auto"
            asOf={data.asOf}
            loading={false}
            error={query.error?.message ?? null}
          />
        </div>
        <div className="mt-3.5 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-[56ch]">
            <h1 className="serif text-[28px] leading-[1.2] md:text-[34px]">
              {event.question || event.title}
            </h1>
            <p className="mt-2.5 text-[12px] text-subtle">
              {cluster} · mapped to {perps.length} perpetual
              {perps.length === 1 ? "" : "s"} · ${fmtCompact(event.volume)} event
              volume
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-[40px] leading-none text-odds">
              {fmtOdds(event.yesPrice)}
            </p>
            <p className={cn("num mt-1 text-[12px]", delta != null ? signedClass(delta) : "text-dim")}>
              {delta != null ? `${fmtOddsDelta(delta)} · ${window}` : `— · ${window}`}
            </p>
          </div>
        </div>
        {odds.length >= 2 ? (
          <Sparkline
            values={odds.map((p) => p.v)}
            width={1000}
            height={60}
            className="mt-4 h-[60px] w-full"
            label={`Yes probability over the last ${odds.length > 1 ? "day" : "period"}`}
          />
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="kicker">Mapped perpetuals · ranked by gap</h2>
          <div className="seg" role="group" aria-label="Comparison window">
            {GAP_WINDOWS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === window}
                onClick={() => setWindow(id)}
                className="num px-2.5 text-[11px]"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-3.5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {perps.map(({ link, row }) => {
            const actionable = row ? isActionable(row) : false;
            return (
              <li
                key={link.symbol}
                className="flex flex-col rounded-[10px] border border-line bg-surface p-[18px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={signalHref({ eventId: event.id, symbol: link.symbol, window })}
                    className="lg-focus text-[15px] font-semibold hover:text-odds"
                  >
                    {perpName(link.symbol)}
                  </Link>
                  {row ? (
                    <DirectionChip bias={row.bias} score={row.score} />
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] leading-[1.5] text-subtle">
                  {shortReason(link)}
                </p>
                {row ? (
                  <RowTrace
                    row={row}
                    width={260}
                    height={60}
                    pad={6}
                    dots={false}
                    zero={false}
                    className="mt-3 h-[60px] w-full"
                  />
                ) : (
                  <p className="mt-3 flex h-[60px] items-center text-[12px] text-dim">
                    No comparable observation on the {window} window.
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-3 text-[13px]">
                  <span className={cn("num", actionable ? "text-odds" : "text-subtle")}>
                    {row ? `Gap ${fmtPct(row.gap)}` : "Gap —"}
                  </span>
                  <Link
                    href={deskHref({ eventId: event.id, symbol: link.symbol, window })}
                    className="lg-focus text-subtle hover:text-text"
                  >
                    Open desk →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>

        {data.news.length ? (
          <section className="mt-8">
            <h2 className="kicker">Headlines</h2>
            <ul className="mt-3 space-y-2">
              {data.news.slice(0, 5).map((item) => {
                const href = safeHttpsUrl(item.link, NEWS_LINK_HOSTS);
                return (
                  <li key={item.id} className="text-[13px]">
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="lg-focus text-subtle hover:text-text">
                        {item.title}
                      </a>
                    ) : (
                      <span className="text-subtle">{item.title}</span>
                    )}
                    <span className="ml-2 text-[11px] text-dim">{item.source}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface px-[18px] py-3.5 text-[12px] text-subtle">
          A ranked signal does not establish causality or predict returns.
          Mappings and sensitivities are heuristic.
          <PolymarketEventLink
            slug={event.slug}
            className="lg-focus inline-flex items-center gap-1 text-odds underline underline-offset-2"
          >
            View event on Polymarket <ArrowUpRight size={13} aria-hidden />
          </PolymarketEventLink>
        </div>
      </div>
    </div>
  );
}
