"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SignalCard } from "@/components/SignalCard";
import { MenuSelect } from "@/components/MenuSelect";
import { LiveDot, Pill, Segmented, TextInput } from "@/components/ui";
import { eventTitleKey, GAP_WINDOWS } from "@/lib/divergence";
import { fmtFunding, fmtOdds, fmtOddsDelta, fmtPct, signedClass } from "@/lib/format";
import { biasCopy, isActionable } from "@/lib/score";
import { perpName } from "@/lib/signal";
import type { GapRow, GapWindow, PerpsTicker } from "@/lib/types";

type Filter = "actionable" | "odds" | "all";
type Sort = "score" | "gap" | "fresh";

function matchesFilter(row: GapRow, filter: Filter): boolean {
  switch (filter) {
    case "actionable":
      return isActionable(row);
    case "odds":
      return row.leader === "odds" && !isActionable(row);
    case "all":
      return true;
    default: {
      const _never: never = filter;
      return _never;
    }
  }
}

function sortRows(rows: GapRow[], sort: Sort): GapRow[] {
  const copy = [...rows];
  switch (sort) {
    case "score":
      return copy.sort((a, b) => b.score - a.score || Math.abs(b.gap) - Math.abs(a.gap));
    case "gap":
      return copy.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || b.score - a.score);
    case "fresh":
      return copy.sort((a, b) => Math.abs(b.oddsMove) - Math.abs(a.oddsMove) || b.score - a.score);
    default: {
      const _never: never = sort;
      return _never;
    }
  }
}

function rowKey(row: GapRow): string {
  return `${row.eventId}-${row.symbol}`;
}

function gapTone(row: GapRow): string {
  return row.leader === "odds" ? "text-[var(--signal)]" : "text-[var(--dim)]";
}

export function OpportunityFeed() {
  const [window, setWindow] = useState<GapWindow>("4h");
  const [filter, setFilter] = useState<Filter>("actionable");
  const [sort, setSort] = useState<Sort>("score");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [summary, setSummary] = useState({ oddsFirst: 0, actionable: 0, topScore: 0 });
  const [events, setEvents] = useState<
    { id: string; title: string; question: string; yesPrice: number; volume: number; perps: { symbol: string }[] }[]
  >([]);
  const [tickers, setTickers] = useState<Record<string, PerpsTicker>>({});
  const [asOf, setAsOf] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [gapRes, eventRes, mktRes] = await Promise.all([
          fetch(`/api/gaps?window=${window}`),
          fetch("/api/events"),
          fetch("/api/markets").catch(() => null),
        ]);
        if (!gapRes.ok) throw new Error(`Gaps unavailable (${gapRes.status}).`);
        const data = (await gapRes.json()) as {
          gaps: GapRow[];
          asOf: number;
          error: string | null;
          summary?: { oddsFirst: number; actionable: number; topScore: number };
        };
        const ev = (await eventRes.json()) as { events?: typeof events };
        const mkt =
          mktRes && mktRes.ok
            ? ((await mktRes.json()) as { tickers?: Record<string, PerpsTicker> })
            : { tickers: {} };
        if (stop) return;
        const rows = data.gaps ?? [];
        setGaps(rows);
        setSummary(
          data.summary ?? {
            oddsFirst: rows.filter((g) => g.leader === "odds" && !isActionable(g)).length,
            actionable: rows.filter(isActionable).length,
            topScore: rows[0]?.score ?? 0,
          },
        );
        setEvents(ev.events ?? []);
        setTickers(mkt.tickers ?? {});
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = gaps.filter((row) => matchesFilter(row, filter)).filter((row) => {
      if (!q) return true;
      const hay = `${row.title} ${row.question} ${row.symbol}`.toLowerCase();
      return hay.includes(q);
    });
    return sortRows(filtered, sort);
  }, [filter, gaps, query, sort]);

  const table = shown.slice(0, 80);
  const active = table.find((row) => rowKey(row) === selected) ?? table[0];

  useEffect(() => {
    const first = shown[0];
    if (!first) return;
    const firstKey = rowKey(first);
    setSelected((cur) => (cur && shown.some((row) => rowKey(row) === cur) ? cur : firstKey));
  }, [shown]);

  const linked = useMemo(() => {
    if (shown.length >= 3) return [];
    const out: typeof events = [];
    const seen = new Set<string>();
    for (const event of events) {
      if (!event.perps[0]?.symbol) continue;
      const key = eventTitleKey(event.title) || event.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(event);
      if (out.length >= 6) break;
    }
    return out;
  }, [events, shown.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="lg-toolbar flex-wrap gap-x-2 gap-y-1">
        <span className="event-title text-[15px] italic text-[var(--text)]">The wire</span>
        <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
        <Segmented
          options={GAP_WINDOWS.map((id) => ({ id, label: id }))}
          value={window}
          onChange={setWindow}
        />
        <Segmented
          options={[
            {
              id: "actionable",
              label: `Act ${summary.actionable}`,
              hint: "Odds moved first and the perp has not fully followed. These are Leadgap’s tradeable setups.",
            },
            {
              id: "odds",
              label: `Lead ${summary.oddsFirst}`,
              hint: "Odds are leading, but the gap or confidence is not yet strong enough to act.",
            },
            {
              id: "all",
              label: `All ${gaps.length}`,
              hint: "Every mapped print in this window, including perp-led and in-line.",
            },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <MenuSelect
          ariaLabel="Sort"
          className="py-0.5 text-[12px]"
          value={sort}
          onChange={setSort}
          options={[
            { id: "score", label: "Score" },
            { id: "gap", label: "Gap" },
            { id: "fresh", label: "Fresh" },
          ]}
        />
        <div className="hidden w-36 sm:block">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Event or perp" />
        </div>
      </div>

      {error ? <p className="px-3 py-1 text-[12px] text-[var(--warn)]">{error}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="min-h-0 flex-1 overflow-auto border-b border-[var(--line)] lg:border-b-0 lg:border-r">
          {loading ? (
            <div className="space-y-px bg-[var(--line)]">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse bg-[var(--surface)]" />
              ))}
            </div>
          ) : table.length === 0 ? (
            <p className="px-4 py-10 text-[13px] text-[var(--muted)]">
              {filter === "all"
                ? "No divergence in this window. Mapped events below still open a desk."
                : "No matching setups. Switch to Lead or All."}
            </p>
          ) : (
            <>
              <ul className="lg:hidden">
                {table.map((row) => {
                  const key = rowKey(row);
                  const on = active ? rowKey(active) === key : false;
                  return (
                    <li
                      key={key}
                      onClick={() => setSelected(key)}
                      className={`cursor-pointer border-b border-[var(--line)] px-3 py-2.5 ${on ? "lg-row-on" : "lg-row"}`}
                    >
                      <p className="event-title truncate text-[15px] text-[var(--text)]">{row.title}</p>
                      <div className="mt-1 flex items-baseline justify-between gap-3 text-[12px]">
                        <span className="num text-[var(--signal)]">{fmtOdds(row.yesPrice)}</span>
                        <span className={`num ${gapTone(row)}`}>{fmtPct(row.gap)}</span>
                        <span className="text-right">
                          <span className="text-[var(--perp)]">{perpName(row.symbol)}</span>
                          {tickers[row.symbol] ? (
                            <span className={`ml-1.5 num text-[10px] ${signedClass(tickers[row.symbol]!.fundingRate)}`}>
                              {fmtFunding(tickers[row.symbol]!.fundingRate)}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={
                            row.bias === "long"
                              ? "text-[var(--long)]"
                              : row.bias === "short"
                                ? "text-[var(--short)]"
                                : "text-[var(--dim)]"
                          }
                        >
                          {biasCopy(row.bias)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <table className="lg-table hidden w-full text-left text-[12px] lg:table">
                <thead className="sticky top-0 bg-[var(--bg)]">
                  <tr>
                    <th className="px-3 py-2">Event</th>
                    <th className="w-[7.5rem] px-2 py-2 text-right">Yes</th>
                    <th className="w-[4.75rem] px-2 py-2 text-right">Gap</th>
                    <th className="w-[4.5rem] px-2 py-2">Perp</th>
                    <th className="w-[4.25rem] px-2 py-2">Side</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row) => {
                    const key = rowKey(row);
                    const on = active ? rowKey(active) === key : false;
                    return (
                      <tr
                        key={key}
                        onClick={() => setSelected(key)}
                        className={`lg-row cursor-pointer ${on ? "lg-row-on" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <p className="event-title truncate text-[15px] leading-5 text-[var(--text)]">{row.title}</p>
                        </td>
                        <td className="num whitespace-nowrap px-2 py-2 text-right text-[var(--signal)]">
                          {fmtOdds(row.yesPrice)}
                          <span className="ml-1.5 text-[10px] text-[var(--muted)]">{fmtOddsDelta(row.oddsMove)}</span>
                        </td>
                        <td className={`num whitespace-nowrap px-2 py-2 text-right font-medium ${gapTone(row)}`}>
                          {fmtPct(row.gap)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <div className="text-[var(--perp)]">{perpName(row.symbol)}</div>
                          {tickers[row.symbol] ? (
                            <div className={`num text-[10px] ${signedClass(tickers[row.symbol]!.fundingRate)}`}>
                              {fmtFunding(tickers[row.symbol]!.fundingRate)}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>
                            {biasCopy(row.bias)}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          {linked.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 border-t border-[var(--line)] px-3 py-2">
              <span className="lg-label mr-1">Mapped</span>
              {linked.map((event) => (
                <Link
                  key={event.id}
                  href={`/markets/${event.perps[0]!.symbol}?event=${event.id}`}
                  className="border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {event.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="max-h-[46vh] min-h-0 shrink-0 overflow-auto border-t border-[var(--line)] bg-[var(--surface)] lg:max-h-none lg:border-t-0">
          {active ? (
            <div className="flex h-full min-h-[240px] flex-col">
              <div className="lg-toolbar">
                <span className="lg-label">Brief</span>
              </div>
              <div className="flex-1 px-4 py-4">
                <SignalCard row={active} />
              </div>
            </div>
          ) : (
            <p className="px-4 py-10 text-[13px] text-[var(--muted)]">Select a dispatch on the wire.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
