"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExpectedActual } from "@/components/desk/ExpectedActual";
import { LiveDot, Panel, Pill, Segmented, TextInput } from "@/components/ui";
import { eventTitleKey } from "@/lib/divergence";
import { fmtOdds, fmtOddsDelta, fmtPct, fmtScore, leaderCopy, signedClass } from "@/lib/format";
import { biasCopy, isActionable, scoreClass } from "@/lib/score";
import type { GapRow, GapWindow } from "@/lib/types";

const WINDOWS: { id: GapWindow; label: string }[] = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
];

type Filter = "actionable" | "odds" | "all";

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

export function OpportunityFeed() {
  const [window, setWindow] = useState<GapWindow>("15m");
  const [filter, setFilter] = useState<Filter>("actionable");
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
    return gaps.filter((row) => matchesFilter(row, filter)).filter((row) => {
      if (!q) return true;
      const hay = `${row.title} ${row.question} ${row.symbol}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, gaps, query]);

  const linked = useMemo(() => {
    const out: typeof events = [];
    const seen = new Set<string>();
    for (const event of events) {
      if (!event.perps[0]?.symbol) continue;
      const key = eventTitleKey(event.title) || event.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(event);
      if (out.length >= 12) break;
    }
    return out;
  }, [events]);

  const featured = shown.slice(0, 3);
  const table = shown.slice(0, 60);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#7d8699]">Leadgap scan</p>
          <h1 className="text-base font-semibold tracking-tight text-white">Odds first. Then the perp.</h1>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[#7d8699]">
            Odds-first <span className="num text-zinc-100">{summary.oddsFirst}</span>
          </span>
          <span className="text-[#7d8699]">
            Actionable <span className="num text-zinc-100">{summary.actionable}</span>
          </span>
          <span className="text-[#7d8699]">
            Top <span className={`num ${scoreClass(summary.topScore)}`}>{fmtScore(summary.topScore)}</span>
          </span>
          <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
          <Segmented options={WINDOWS} value={window} onChange={setWindow} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={[
            { id: "actionable", label: `Actionable ${summary.actionable}` },
            { id: "odds", label: `Odds first ${summary.oddsFirst}` },
            { id: "all", label: `All ${gaps.length}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="w-44">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Event or perp" />
        </div>
      </div>

      {error ? <p className="text-sm text-amber-200">{error}</p> : null}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      ) : shown.length === 0 ? (
        <p className="text-[12px] text-[#7d8699]">
          {filter === "all"
            ? "No gap in this window yet. Linked events below still open a desk."
            : "No matching setups. Switch to Odds first or All, or open a linked event."}
        </p>
      ) : (
        <>
          {featured.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-3">
              {featured.map((row) => (
                <Link key={`${row.eventId}-${row.symbol}-card`} href={`/markets/${row.symbol}?event=${row.eventId}`}>
                  <Panel className="h-full p-2 transition hover:border-[#3ee0a8]/25">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium leading-4 text-zinc-100">{row.title}</p>
                      <span className={`num shrink-0 text-xl font-semibold ${scoreClass(row.score)}`}>
                        {fmtScore(row.score)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>
                        {biasCopy(row.bias ?? "none", row.symbol)}
                      </Pill>
                      <Pill tone={row.leader === "odds" ? "lead" : row.leader === "perp" ? "perp" : "mute"}>
                        {leaderCopy(row.leader)}
                      </Pill>
                    </div>
                    <div className="mt-2">
                      <ExpectedActual expected={row.expected ?? row.oddsMove * row.signedBeta} actual={row.actual ?? row.perpMove} />
                    </div>
                  </Panel>
                </Link>
              ))}
            </div>
          ) : null}

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="text-[10px] uppercase tracking-wide text-[#7d8699]">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-2 py-2 font-medium">Perp</th>
                  <th className="px-2 py-2 font-medium">Score</th>
                  <th className="px-2 py-2 font-medium">Bias</th>
                  <th className="px-2 py-2 font-medium">Yes</th>
                  <th className="px-2 py-2 font-medium">Odds Δ</th>
                  <th className="px-2 py-2 font-medium">Expected</th>
                  <th className="px-2 py-2 font-medium">Actual</th>
                  <th className="px-2 py-2 font-medium">Residual</th>
                  <th className="px-3 py-2 font-medium">Lead</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const expected = row.expected ?? row.oddsMove * row.signedBeta;
                  const actual = row.actual ?? row.perpMove;
                  return (
                    <tr key={`${row.eventId}-${row.symbol}`} className="border-t border-[#1a2030] hover:bg-white/[0.03]">
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/markets/${row.symbol}?event=${row.eventId}`}
                          className="font-medium text-zinc-100 hover:text-white"
                        >
                          {row.title}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <Link href={`/markets/${row.symbol}`} className="text-[#8bb4ff] hover:text-white">
                          {row.symbol.replace("-USD", "")}
                        </Link>
                      </td>
                      <td className={`num px-2 py-1.5 font-semibold ${scoreClass(row.score)}`}>
                        {fmtScore(row.score)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>
                          {biasCopy(row.bias ?? "none")}
                        </Pill>
                      </td>
                      <td className="num px-2 py-1.5">{fmtOdds(row.yesPrice)}</td>
                      <td className={`num px-2 py-1.5 ${signedClass(row.oddsMove)}`}>{fmtOddsDelta(row.oddsMove)}</td>
                      <td className={`num px-2 py-1.5 ${signedClass(expected)}`}>{fmtPct(expected)}</td>
                      <td className={`num px-2 py-1.5 ${signedClass(actual)}`}>{fmtPct(actual)}</td>
                      <td className={`num px-2 py-1.5 ${signedClass(row.gap)}`}>{fmtPct(row.gap)}</td>
                      <td className="px-3 py-1.5">
                        <Pill tone={row.leader === "odds" ? "lead" : row.leader === "perp" ? "perp" : "mute"}>
                          {leaderCopy(row.leader)}
                        </Pill>
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
        <section>
          <h2 className="mb-1.5 text-sm font-medium text-zinc-200">Linked events</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {linked.map((event) => (
                <Link key={event.id} href={`/markets/${event.perps[0]!.symbol}?event=${event.id}`}>
                  <Panel className="h-full p-2.5 transition hover:border-[#3ee0a8]/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-xs text-[#3ee0a8]">{fmtOdds(event.yesPrice)}</span>
                      <span className="truncate text-[11px] text-[#5c6478]">
                        {event.perps.map((p) => p.symbol.replace("-USD", "")).join(" · ")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{event.title}</p>
                  </Panel>
                </Link>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

