"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExpectedActual } from "@/components/desk/ExpectedActual";
import { Empty, LiveDot, Panel, Pill, Segmented, TextInput } from "@/components/ui";
import { fmtOdds, fmtOddsDelta, fmtPct, fmtScore, leaderCopy, signedClass } from "@/lib/format";
import { biasCopy, scoreClass } from "@/lib/score";
import type { GapRow, GapWindow } from "@/lib/types";

const WINDOWS: { id: GapWindow; label: string }[] = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
];

type Filter = "actionable" | "odds" | "all";

export function OpportunityFeed() {
  const [window, setWindow] = useState<GapWindow>("15m");
  const [filter, setFilter] = useState<Filter>("all");
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
            oddsFirst: rows.filter((g) => g.leader === "odds").length,
            actionable: rows.filter((g) => g.bias && g.bias !== "none").length,
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
    return gaps.filter((row) => {
      if (filter === "odds" && row.leader !== "odds") return false;
      if (filter === "actionable" && (row.bias ?? "none") === "none") return false;
      if (!q) return true;
      const hay = `${row.title} ${row.question} ${row.symbol}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, gaps, query]);

  const featured = shown.slice(0, 3);
  const table = shown.slice(0, 60);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Odds first. Then the perp.</h1>
          <p className="mt-2 text-sm leading-6 text-[#8b93a7]">
            Leadgap Score ranks residual between implied Yes move and the live mark. Trade the perp —
            events are signal only.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
          <Segmented options={WINDOWS} value={window} onChange={setWindow} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Odds first" value={String(summary.oddsFirst)} hint="Setups where the event book led" />
        <StatCard
          label="Actionable"
          value={String(summary.actionable)}
          hint="Score high enough for a Long/Short bias"
        />
        <StatCard
          label="Top score"
          value={fmtScore(summary.topScore)}
          hint="Best Leadgap Score in this window"
          className={scoreClass(summary.topScore)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { id: "actionable", label: "Actionable" },
            { id: "odds", label: "Odds first" },
            { id: "all", label: "All" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="w-52">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search event or perp" />
        </div>
      </div>

      {error ? <p className="text-sm text-amber-200">{error}</p> : null}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      ) : shown.length === 0 ? (
        <Empty
          title={filter === "all" ? "No gap in this window yet" : "No matching setups"}
          body="Books are sampling. Switch to All, or open a linked event below when a lead appears."
        />
      ) : (
        <>
          {featured.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {featured.map((row) => (
                <Link key={`${row.eventId}-${row.symbol}-card`} href={`/markets/${row.symbol}?event=${row.eventId}`}>
                  <Panel className="h-full p-4 transition hover:border-[#3ee0a8]/30">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-5 text-zinc-100">{row.title}</p>
                      <span className={`num shrink-0 text-2xl font-semibold ${scoreClass(row.score)}`}>
                        {fmtScore(row.score)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>
                        {biasCopy(row.bias ?? "none", row.symbol)}
                      </Pill>
                      <Pill tone={row.leader === "odds" ? "lead" : row.leader === "perp" ? "perp" : "mute"}>
                        {leaderCopy(row.leader)}
                      </Pill>
                    </div>
                    <div className="mt-3">
                      <ExpectedActual expected={row.expected ?? row.oddsMove * row.signedBeta} actual={row.actual ?? row.perpMove} />
                    </div>
                  </Panel>
                </Link>
              ))}
            </div>
          ) : null}

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-[#5c6478]">
                <tr>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-3 py-3 font-medium">Perp</th>
                  <th className="px-3 py-3 font-medium">Score</th>
                  <th className="px-3 py-3 font-medium">Bias</th>
                  <th className="px-3 py-3 font-medium">Yes</th>
                  <th className="px-3 py-3 font-medium">Odds Δ</th>
                  <th className="px-3 py-3 font-medium">Expected</th>
                  <th className="px-3 py-3 font-medium">Actual</th>
                  <th className="px-3 py-3 font-medium">Residual</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const expected = row.expected ?? row.oddsMove * row.signedBeta;
                  const actual = row.actual ?? row.perpMove;
                  return (
                    <tr key={`${row.eventId}-${row.symbol}`} className="border-t border-[#1e2636] hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/markets/${row.symbol}?event=${row.eventId}`}
                          className="font-medium text-zinc-100 hover:text-white"
                        >
                          {row.title}
                        </Link>
                        <div className="mt-0.5 max-w-sm truncate text-xs text-[#5c6478]">{row.question}</div>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/markets/${row.symbol}`} className="text-[#8bb4ff] hover:text-white">
                          {row.symbol.replace("-USD", "")}
                        </Link>
                      </td>
                      <td className={`num px-3 py-3 text-base font-semibold ${scoreClass(row.score)}`}>
                        {fmtScore(row.score)}
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>
                          {biasCopy(row.bias ?? "none")}
                        </Pill>
                      </td>
                      <td className="num px-3 py-3">{fmtOdds(row.yesPrice)}</td>
                      <td className={`num px-3 py-3 ${signedClass(row.oddsMove)}`}>{fmtOddsDelta(row.oddsMove)}</td>
                      <td className={`num px-3 py-3 ${signedClass(expected)}`}>{fmtPct(expected)}</td>
                      <td className={`num px-3 py-3 ${signedClass(actual)}`}>{fmtPct(actual)}</td>
                      <td className={`num px-3 py-3 ${signedClass(row.gap)}`}>{fmtPct(row.gap)}</td>
                      <td className="px-4 py-3">
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

      {events.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-200">Linked events</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events
              .filter((event) => event.perps[0]?.symbol)
              .slice(0, 12)
              .map((event) => (
                <Link key={event.id} href={`/markets/${event.perps[0]!.symbol}?event=${event.id}`}>
                  <Panel className="h-full p-4 transition hover:border-[#3ee0a8]/30">
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

function StatCard({
  label,
  value,
  hint,
  className = "text-white",
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-[#5c6478]">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${className}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#5c6478]">{hint}</p>
    </Panel>
  );
}
