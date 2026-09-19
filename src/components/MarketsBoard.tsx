"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import { FeedStamp } from "@/components/signal/FeedStamp";
import { WorkspaceHeading } from "@/components/WorkspaceHeading";
import { fmtFunding, fmtPct, fmtPx, signedClass } from "@/lib/format";
import { signalHref } from "@/lib/links";
import { mapBySymbol } from "@/lib/mapping";
import { perpName } from "@/lib/signal";
import type { GapRow, PerpsInstrument, PerpsTicker } from "@/lib/types";
import { gapsQuery } from "@/lib/useGapsFeed";
import { useHydrated } from "@/lib/useHydrated";
import { useMarkets } from "@/lib/useMarkets";
import { cn } from "@/lib/utils";

type SortCol = "name" | "mark" | "change" | "funding" | "oi" | "lev" | "signal";
type SortDir = "asc" | "desc";
type CatFilter = "all" | "index" | "commodity" | "crypto" | "equity";

const CATS: { id: CatFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "index", label: "Index" },
  { id: "commodity", label: "Commodities" },
  { id: "crypto", label: "Crypto" },
  { id: "equity", label: "Equities" },
];
const SIGNAL_WINDOW = "4h";

type SignalStat = { top: GapRow; live: number };

function sortValue(
  inst: PerpsInstrument,
  col: SortCol,
  tickers: Record<string, PerpsTicker>,
  signals: Map<string, SignalStat>,
  eventCounts: Record<string, number>,
): number | string {
  const t = tickers[inst.symbol];
  switch (col) {
    case "name":
      return inst.symbol;
    case "mark":
      return t?.markPrice ?? 0;
    case "change":
      return t?.change1h ?? 0;
    case "funding":
      return t?.fundingRate ?? 0;
    case "oi":
      return t?.openInterest ?? 0;
    case "lev":
      return inst.maxLeverage;
    case "signal": {
      const stat = signals.get(inst.symbol);
      // Live signals first, then the best score, then how many events map here.
      return (
        (stat?.live ?? 0) * 10_000 +
        (stat?.top.score ?? 0) * 10 +
        Math.min(9, eventCounts[inst.symbol] ?? 0)
      );
    }
    default: {
      const _never: never = col;
      return _never;
    }
  }
}

function SortHead({
  id,
  label,
  align = "right",
  sort,
  dir,
  onSort,
  className,
}: {
  id: SortCol;
  label: string;
  align?: "left" | "right";
  sort: SortCol;
  dir: SortDir;
  onSort: (id: SortCol) => void;
  className?: string;
}) {
  const on = sort === id;
  return (
    <th
      scope="col"
      aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "sticky top-0 z-10 border-b border-line bg-canvas px-4 pb-2.5 font-normal",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(id)}
        className={cn(
          "lg-focus kicker hover:text-text",
          on && "text-subtle",
        )}
      >
        {label}
        {on ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

export function MarketsBoard() {
  const router = useRouter();
  const { instruments, tickers, eventCounts, error, asOf, loading, retry } =
    useMarkets();
  const hydrated = useHydrated();
  const feed = useQuery(gapsQuery(SIGNAL_WINDOW));
  const [filter, setFilter] = useState<CatFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortCol>("signal");
  const [dir, setDir] = useState<SortDir>("desc");

  const mapped = useMemo(() => mapBySymbol(), []);
  const signals = useMemo(() => {
    const out = new Map<string, SignalStat>();
    for (const row of hydrated ? (feed.data?.gaps ?? []) : []) {
      const prev = out.get(row.symbol);
      out.set(row.symbol, {
        top: !prev || row.score > prev.top.score ? row : prev.top,
        live: (prev?.live ?? 0) + (row.bias !== "none" ? 1 : 0),
      });
    }
    return out;
  }, [feed.data, hydrated]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return instruments
      .filter((i) => {
        if (filter !== "all" && i.category !== filter) return false;
        if (!needle) return true;
        const hay =
          `${i.symbol} ${i.baseAsset} ${i.category} ${perpName(i.symbol)}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        const va = sortValue(a, sort, tickers, signals, eventCounts);
        const vb = sortValue(b, sort, tickers, signals, eventCounts);
        const cmp =
          typeof va === "string" && typeof vb === "string"
            ? va.localeCompare(vb)
            : Number(va) - Number(vb);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [dir, eventCounts, filter, instruments, q, signals, sort, tickers]);

  function onSort(col: SortCol) {
    if (sort === col) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(col);
    setDir(col === "name" ? "asc" : "desc");
  }

  const openMarket = useCallback(
    (symbol: string) => {
      router.push(`/markets/${encodeURIComponent(symbol)}`);
    },
    [router],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceHeading
        title="Markets"
        description="Every perpetual, ranked by how many live signals are riding on it."
      >
        <FeedStamp asOf={asOf} loading={loading} error={error} />
      </WorkspaceHeading>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-4 md:px-6">
        <span className="text-[12px] text-subtle">
          <span className="num text-text">{loading ? "—" : instruments.length}</span>{" "}
          instruments
        </span>
        <span className="hidden h-5 w-px bg-line-strong sm:block" aria-hidden />
        <div className="relative w-full sm:w-[220px]">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-dim"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search markets"
            aria-label="Search markets"
            className="lg-input h-8 bg-surface pr-2.5 pl-[30px]"
          />
        </div>
        <div className="seg max-w-full overflow-x-auto" role="group" aria-label="Category">
          {CATS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className="px-[11px]"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="workspace-error" role="alert">
          <span className="status-dot shrink-0" data-state="stale" aria-hidden />
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="lg-focus h-8 shrink-0 rounded-[7px] border border-[rgba(224,179,65,0.45)] px-3.5 text-[13px] font-medium text-warn"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-auto px-4 pb-6 md:px-6">
        {loading ? (
          <div aria-busy="true" aria-label="Loading markets">
            {[1, 0.7, 0.5, 0.35, 0.2].map((opacity, i) => (
              <div
                key={i}
                style={{ opacity }}
                className="grid grid-cols-[1fr_repeat(3,80px)] items-center gap-4 border-b border-line-soft py-5"
              >
                <span className="h-4 w-24 rounded-[3px] bg-raise" />
                <span className="h-3.5 rounded-[3px] bg-raise" />
                <span className="h-3.5 rounded-[3px] bg-raise" />
                <span className="h-3.5 rounded-[3px] bg-raise" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <h2 className="serif text-[26px]">
              {error ? "Market data is unavailable" : "No markets match"}
            </h2>
            {q.trim() || filter !== "all" ? (
              <button
                type="button"
                className="lg-focus mt-4 h-9 rounded-[7px] border border-line-strong px-4 text-[13px] text-subtle hover:text-text"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
              >
                Clear search and filters
              </button>
            ) : null}
          </div>
        ) : (
          <table aria-label="Markets" className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <SortHead id="name" label="Market" align="left" sort={sort} dir={dir} onSort={onSort} className="pl-0" />
                <SortHead id="mark" label="Mark" sort={sort} dir={dir} onSort={onSort} />
                <SortHead id="change" label="1h" sort={sort} dir={dir} onSort={onSort} />
                <SortHead id="funding" label="Funding" sort={sort} dir={dir} onSort={onSort} />
                <SortHead id="oi" label="OI" sort={sort} dir={dir} onSort={onSort} />
                <SortHead id="lev" label="Lev" sort={sort} dir={dir} onSort={onSort} />
                <SortHead id="signal" label="Top signal" align="left" sort={sort} dir={dir} onSort={onSort} className="pr-0" />
              </tr>
            </thead>
            <tbody>
              {rows.map((inst) => {
                const t = tickers[inst.symbol];
                const change = t?.change1h ?? null;
                const cluster = mapped.get(inst.symbol)?.cluster;
                const top = signals.get(inst.symbol)?.top;
                return (
                  <tr
                    key={inst.symbol}
                    id={`mkt-${inst.symbol}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      openMarket(inst.symbol);
                    }}
                    className="cursor-pointer border-b border-line-soft transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]"
                  >
                    <td className="py-4 pr-4">
                      <Link
                        href={`/markets/${encodeURIComponent(inst.symbol)}`}
                        className="lg-focus text-[14px] font-medium text-text hover:text-odds"
                      >
                        {perpName(inst.symbol)}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-dim">
                        <span className="capitalize">{inst.category}</span>
                        {cluster ? ` · ${cluster}` : ""}
                      </div>
                    </td>
                    <td className="num p-4 text-right text-mark">
                      {t ? fmtPx(t.markPrice, inst.priceDecimals) : "—"}
                    </td>
                    <td className={cn("num p-4 text-right", change != null ? signedClass(change) : "text-dim")}>
                      {change != null ? fmtPct(change) : "—"}
                    </td>
                    <td className={cn("num p-4 text-right", t ? signedClass(t.fundingRate) : "text-dim")}>
                      {t ? fmtFunding(t.fundingRate) : "—"}
                    </td>
                    <td className="num p-4 text-right text-subtle">
                      {t ? fmtPx(t.openInterest, 2) : "—"}
                    </td>
                    <td className="num p-4 text-right text-subtle">
                      {inst.maxLeverage}×
                    </td>
                    <td className="py-4 pl-4">
                      {top ? (
                        <Link
                          href={signalHref({ ...top, window: SIGNAL_WINDOW })}
                          className="lg-focus inline-flex rounded-[5px]"
                        >
                          <span className="sr-only">Top signal: </span>
                          <DirectionChip bias={top.bias} score={top.score} />
                        </Link>
                      ) : (
                        <span className="text-[12px] text-dim">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
