"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SignalCard } from "@/components/SignalCard";
import { LiveDot, Panel, Pill, Segmented, TextInput } from "@/components/ui";
import { eventTitleKey, GAP_WINDOWS } from "@/lib/divergence";
import { fmtCompact, fmtOddsRange, fmtPct, fmtScore, signedClass } from "@/lib/format";
import { isActionable, scoreClass } from "@/lib/score";
import { oddsPrior, perpName, signalAction } from "@/lib/signal";
import type { GapRow, GapWindow } from "@/lib/types";

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

export function OpportunityFeed() {
  const [window, setWindow] = useState<GapWindow>("15m");
  const [filter, setFilter] = useState<Filter>("actionable");
  const [sort, setSort] = useState<Sort>("score");
  const [query, setQuery] = useState("");
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [summary, setSummary] = useState({ oddsFirst: 0, actionable: 0, topScore: 0 });
  const [events, setEvents] = useState<
    { id: string; title: string; question: string; yesPrice: number; volume: number; perps: { symbol: string }[] }[]
  >([]);
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
        const data = (await gapRes.json()) as {
          gaps: GapRow[];
          asOf: number;
          error: string | null;
          summary?: { oddsFirst: number; actionable: number; topScore: number };
        };
        const ev = (await eventRes.json()) as { events?: typeof events };
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

  const featured = shown.slice(0, 3);
  const table = shown.slice(0, 60);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#7d8699]">Opportunity scanner</p>
          <h1 className="text-base font-semibold tracking-tight text-white">What can I trade right now?</h1>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[#7d8699]">
            Actionable <span className="num text-zinc-100">{summary.actionable}</span>
          </span>
          <span className="text-[#7d8699]">
            Odds-first <span className="num text-zinc-100">{summary.oddsFirst}</span>
          </span>
          <span className="text-[#7d8699]">
            Top <span className={`num ${scoreClass(summary.topScore)}`}>{fmtScore(summary.topScore)}</span>
          </span>
          <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          compact
          options={GAP_WINDOWS.map((id) => ({ id, label: id }))}
          value={window}
          onChange={setWindow}
        />
        <Segmented
          options={[
            { id: "actionable", label: `Actionable ${summary.actionable}` },
            { id: "odds", label: `Odds first ${summary.oddsFirst}` },
            { id: "all", label: `All ${gaps.length}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Segmented
          compact
          options={[
            { id: "score", label: "Highest score" },
            { id: "gap", label: "Biggest gap" },
            { id: "fresh", label: "Newest move" },
          ]}
          value={sort}
          onChange={setSort}
        />
        <div className="w-44">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Event or perp" />
        </div>
      </div>

      {error ? <p className="text-sm text-amber-200">{error}</p> : null}

      {loading ? (
        <div className="h-16 animate-pulse rounded-md bg-white/5" />
      ) : shown.length === 0 ? (
        <p className="text-[12px] text-[#7d8699]">
          {filter === "all"
            ? "No gap in this window yet. Mapped events below still open a desk."
            : "No matching setups. Switch to Odds first or All."}
        </p>
      ) : (
        <>
          {featured.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-3">
              {featured.map((row) => (
                <SignalCard key={`${row.eventId}-${row.symbol}-card`} row={row} />
              ))}
            </div>
          ) : null}

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-[13px]">
              <thead className="text-[10px] uppercase tracking-wide text-[#7d8699]">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-2 py-2 font-medium">Perp</th>
                  <th className="px-2 py-2 font-medium">Score</th>
                  <th className="px-2 py-2 font-medium">Yes</th>
                  <th className="px-2 py-2 font-medium">Expected</th>
                  <th className="px-2 py-2 font-medium">Actual</th>
                  <th className="px-2 py-2 font-medium">Gap</th>
                  <th className="px-2 py-2 font-medium">Vol</th>
                  <th className="px-2 py-2 font-medium">Signal</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const expected = row.expected ?? row.oddsMove * row.signedBeta;
                  const actual = row.actual ?? row.perpMove;
                  const href = `/markets/${row.symbol}?event=${row.eventId}`;
                  const action = signalAction(row.bias, row.symbol);
                  return (
                    <tr key={`${row.eventId}-${row.symbol}`} className="border-t border-[#1a2030] hover:bg-white/[0.03]">
                      <td className="px-3 py-1.5">
                        <Link href={href} className="font-medium text-zinc-100 hover:text-white">
                          {row.title}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <Link href={`/markets/${row.symbol}`} className="text-[#8bb4ff] hover:text-white">
                          {perpName(row.symbol)}
                        </Link>
                      </td>
                      <td className={`num px-2 py-1.5 font-semibold ${scoreClass(row.score)}`}>
                        {fmtScore(row.score)}
                      </td>
                      <td className="num px-2 py-1.5 text-[#3ee0a8]">
                        {fmtOddsRange(oddsPrior(row.yesPrice, row.oddsMove), row.yesPrice)}
                      </td>
                      <td className={`num px-2 py-1.5 ${signedClass(expected)}`}>{fmtPct(expected)}</td>
                      <td className={`num px-2 py-1.5 ${signedClass(actual)}`}>{fmtPct(actual)}</td>
                      <td className={`num px-2 py-1.5 font-medium ${signedClass(row.gap)}`}>{fmtPct(row.gap)}</td>
                      <td className="num px-2 py-1.5 text-[#8b93a7]">{row.volume > 0 ? fmtCompact(row.volume) : "—"}</td>
                      <td className="px-2 py-1.5">
                        <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>
                          {action}
                        </Pill>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Link
                          href={href}
                          className="inline-flex rounded-md bg-[#3ee0a8] px-2 py-0.5 text-[11px] font-semibold text-[#07080c]"
                        >
                          Trade
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {linked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-[10px] uppercase tracking-wide text-[#7d8699]">Mapped</span>
          {linked.map((event) => (
            <Link
              key={event.id}
              href={`/markets/${event.perps[0]!.symbol}?event=${event.id}`}
              className="rounded border border-[#1a2030] bg-[#0e1118] px-2 py-1 text-[11px] text-zinc-300 hover:border-[#3ee0a8]/30 hover:text-white"
            >
              {event.title}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
