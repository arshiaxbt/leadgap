"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableSkeleton,
} from "@/components/DataTable";
import { Segmented, TextInput } from "@/components/ui";
import { fmtFunding, fmtPct, fmtPx, signedClass } from "@/lib/format";
import { mapBySymbol } from "@/lib/mapping";
import { perpName } from "@/lib/signal";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { useMarkets } from "@/lib/useMarkets";
import { FeedStatus } from "@/components/FeedStatus";
import { WorkspaceHeading } from "@/components/WorkspaceHeading";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SortCol =
  | "name"
  | "mark"
  | "index"
  | "change"
  | "funding"
  | "oi"
  | "lev"
  | "events";
type SortDir = "asc" | "desc";
type CatFilter = "all" | "index" | "commodity" | "crypto" | "equity";

const CATS: { id: CatFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "index", label: "Index" },
  { id: "commodity", label: "Commodities" },
  { id: "crypto", label: "Crypto" },
  { id: "equity", label: "Equities" },
];

function sortValue(
  inst: PerpsInstrument,
  col: SortCol,
  tickers: Record<string, PerpsTicker>,
  eventCounts: Record<string, number>,
): number | string {
  const t = tickers[inst.symbol];
  switch (col) {
    case "name":
      return inst.symbol;
    case "mark":
      return t?.markPrice ?? 0;
    case "index":
      return t?.indexPrice ?? 0;
    case "change":
      return t?.change1h ?? 0;
    case "funding":
      return t?.fundingRate ?? 0;
    case "oi":
      return t?.openInterest ?? 0;
    case "lev":
      return inst.maxLeverage;
    case "events":
      return eventCounts[inst.symbol] ?? 0;
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
  sticky = false,
  sort,
  dir,
  onSort,
}: {
  id: SortCol;
  label: string;
  align?: "left" | "right";
  sticky?: boolean;
  sort: SortCol;
  dir: SortDir;
  onSort: (id: SortCol) => void;
}) {
  const on = sort === id;
  return (
    <DataTableHead
      align={align}
      aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(sticky && "sticky left-0 z-20 bg-[var(--bg)] px-3")}
    >
      <button
        type="button"
        onClick={() => onSort(id)}
        className={cn(
          "lg-focus hover:text-[var(--text)]",
          on ? "text-[var(--text)]" : undefined,
        )}
      >
        {label}
        {on ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </DataTableHead>
  );
}

export function MarketsBoard() {
  const router = useRouter();
  const { instruments, tickers, eventCounts, error, asOf, loading, retry } =
    useMarkets();
  const [filter, setFilter] = useState<CatFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortCol>("events");
  const [dir, setDir] = useState<SortDir>("desc");

  const mapped = useMemo(() => mapBySymbol(), []);

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
        const va = sortValue(a, sort, tickers, eventCounts);
        const vb = sortValue(b, sort, tickers, eventCounts);
        const cmp =
          typeof va === "string" && typeof vb === "string"
            ? va.localeCompare(vb)
            : Number(va) - Number(vb);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [dir, eventCounts, filter, instruments, q, sort, tickers]);

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
      router.push(`/markets/${symbol}`);
    },
    [router],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceHeading
        title="Markets"
        description="Every perpetual market. One place to find your next trade."
      >
        <FeedStatus asOf={asOf} error={error} loading={loading} retry={retry} />
      </WorkspaceHeading>
      <div className="lg-toolbar flex-wrap gap-x-2 gap-y-1">
        <span className="text-[12px] text-[var(--muted)]">
          <span className="num text-[var(--text)]">
            {loading ? "—" : instruments.length}
          </span>{" "}
          instruments
        </span>
        <div className="w-36">
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search markets"
          />
        </div>
        <Segmented compact options={CATS} value={filter} onChange={setFilter} />
      </div>

      {error ? (
        <p className="workspace-error" role="alert">
          {error}{" "}
          <button onClick={retry} className="ml-2 underline">
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <DataTableSkeleton
          columns={8}
          rows={14}
          columnWidths={[22, 12, 12, 10, 12, 12, 8, 10]}
          containerClassName="flex-1"
        />
      ) : rows.length === 0 ? (
        <DataTableEmpty>
          <h2 className="text-lg text-[var(--text)]">
            {error ? "Market data is unavailable" : "No markets match"}
          </h2>
          {q.trim() || filter !== "all" ? (
            <button
              type="button"
              className="lg-focus mt-2 text-[var(--text)] underline underline-offset-2"
              onClick={() => {
                setQ("");
                setFilter("all");
              }}
            >
              Clear search and filters
            </button>
          ) : null}
        </DataTableEmpty>
      ) : (
        <DataTable
          className="market-table min-w-[760px]"
          containerClassName="flex-1"
          aria-label="Markets"
        >
          <DataTableHeader>
            <tr>
              <SortHead
                id="name"
                label="Market"
                align="left"
                sticky
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="mark"
                label="Mark"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="index"
                label="Index"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="change"
                label="1h"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="funding"
                label="Funding"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="oi"
                label="OI"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="lev"
                label="Lev"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHead
                id="events"
                label="Events"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
            </tr>
          </DataTableHeader>
          <DataTableBody>
            {rows.map((inst) => {
              const t = tickers[inst.symbol];
              const change = t?.change1h ?? null;
              const cluster = mapped.get(inst.symbol)?.cluster;
              const events = eventCounts[inst.symbol] ?? 0;
              const on = false;
              return (
                <DataTableRow
                  key={inst.symbol}
                  id={`mkt-${inst.symbol}`}
                  selected={on}
                  interactive
                  tabIndex={-1}
                  onClick={() => openMarket(inst.symbol)}
                >
                  <DataTableCell
                    className={cn(
                      "sticky left-0 z-[1] px-3 bg-[var(--bg)]",
                      "group-hover:bg-[var(--hover)]",
                      on &&
                        "bg-[var(--elevated)] group-hover:bg-[var(--elevated)]",
                    )}
                  >
                    <Link
                      href={`/markets/${encodeURIComponent(inst.symbol)}`}
                      className="lg-focus font-medium text-[var(--text)]"
                    >
                      {perpName(inst.symbol)}{" "}
                      <span className="ml-2 text-[var(--muted)]">↗</span>
                    </Link>
                    <div className="mt-0.5 text-[11px] text-[var(--dim)]">
                      <span className="capitalize">{inst.category}</span>
                      {cluster ? (
                        <span className="text-[var(--muted)]">
                          {" "}
                          · {cluster}
                        </span>
                      ) : null}
                    </div>
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--mark)]">
                    {t ? fmtPx(t.markPrice, inst.priceDecimals) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--muted)]">
                    {t ? fmtPx(t.indexPrice, inst.priceDecimals) : "—"}
                  </DataTableCell>
                  <DataTableCell
                    numeric
                    className={
                      change != null ? signedClass(change) : "text-[var(--dim)]"
                    }
                  >
                    {change != null ? fmtPct(change) : "—"}
                  </DataTableCell>
                  <DataTableCell
                    numeric
                    className={
                      t ? signedClass(t.fundingRate) : "text-[var(--dim)]"
                    }
                  >
                    {t ? fmtFunding(t.fundingRate) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--muted)]">
                    {t ? fmtPx(t.openInterest, 2) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--muted)]">
                    {inst.maxLeverage}x
                  </DataTableCell>
                  <DataTableCell
                    numeric
                    className={
                      events > 0 ? "text-[var(--text)]" : "text-[var(--dim)]"
                    }
                  >
                    {events}
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
