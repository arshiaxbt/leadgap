"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LiveDot, Segmented, TextInput } from "@/components/ui";
import { fmtFunding, fmtPct, fmtPx, signedClass } from "@/lib/format";
import { mapBySymbol } from "@/lib/mapping";
import { perpName } from "@/lib/signal";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { useMarkets } from "@/lib/useMarkets";
import { cn } from "@/lib/utils";

type SortCol = "name" | "mark" | "index" | "change" | "funding" | "oi" | "lev" | "events";
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

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.closest("[role='dialog']") || el.closest("thead")) return true;
  return false;
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
        className={cn("lg-focus hover:text-[var(--text)]", on ? "text-[var(--text)]" : undefined)}
      >
        {label}
        {on ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </DataTableHead>
  );
}

export function MarketsBoard() {
  const router = useRouter();
  const { instruments, tickers, eventCounts, error, asOf, loading } = useMarkets();
  const [filter, setFilter] = useState<CatFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortCol>("events");
  const [dir, setDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<string | null>(null);
  const mapped = useMemo(() => mapBySymbol(), []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return instruments
      .filter((i) => {
        if (filter !== "all" && i.category !== filter) return false;
        if (!needle) return true;
        const hay = `${i.symbol} ${i.baseAsset} ${i.category}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        const va = sortValue(a, sort, tickers, eventCounts);
        const vb = sortValue(b, sort, tickers, eventCounts);
        const cmp =
          typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [dir, eventCounts, filter, instruments, q, sort, tickers]);

  useEffect(() => {
    const first = rows[0]?.symbol;
    if (!first) return;
    setSelected((cur) => (cur && rows.some((row) => row.symbol === cur) ? cur : first));
  }, [rows]);

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!rows.length) return;
      const keys = rows.map((row) => row.symbol);
      const cur = selected && keys.includes(selected) ? selected : keys[0]!;
      const idx = keys.indexOf(cur);

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = keys[Math.min(idx + 1, keys.length - 1)]!;
        setSelected(next);
        document.getElementById(`mkt-${next}`)?.focus({ preventScroll: true });
        document.getElementById(`mkt-${next}`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = keys[Math.max(idx - 1, 0)]!;
        setSelected(next);
        document.getElementById(`mkt-${next}`)?.focus({ preventScroll: true });
        document.getElementById(`mkt-${next}`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        openMarket(cur);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMarket, rows, selected]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="lg-toolbar flex-wrap gap-x-2 gap-y-1">
        <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
        <span className="text-[12px] text-[var(--muted)]">
          <span className="num text-[var(--text)]">{loading ? "—" : instruments.length}</span> instruments
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

      {error ? <p className="px-3 py-1 text-[12px] text-[var(--warn)]">{error}</p> : null}

      {loading ? (
        <DataTableSkeleton
          columns={8}
          rows={14}
          columnWidths={[22, 12, 12, 10, 12, 12, 8, 10]}
          containerClassName="flex-1"
        />
      ) : rows.length === 0 ? (
        <DataTableEmpty>
          <p>No markets match.</p>
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
          className="min-w-[760px]"
          containerClassName="flex-1"
          role="listbox"
          aria-label="Markets"
          aria-activedescendant={selected ? `mkt-${selected}` : undefined}
        >
          <DataTableHeader>
            <tr>
              <SortHead id="name" label="Market" align="left" sticky sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="mark" label="Mark" sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="index" label="Index" sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="change" label="1h" sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="funding" label="Funding" sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="oi" label="OI" sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="lev" label="Lev" sort={sort} dir={dir} onSort={onSort} />
              <SortHead id="events" label="Events" sort={sort} dir={dir} onSort={onSort} />
            </tr>
          </DataTableHeader>
          <DataTableBody>
            {rows.map((inst) => {
              const t = tickers[inst.symbol];
              const change = t?.change1h ?? null;
              const cluster = mapped.get(inst.symbol)?.cluster;
              const events = eventCounts[inst.symbol] ?? 0;
              const on = selected === inst.symbol;
              return (
                <DataTableRow
                  key={inst.symbol}
                  id={`mkt-${inst.symbol}`}
                  role="option"
                  aria-selected={on}
                  selected={on}
                  interactive
                  tabIndex={on ? 0 : -1}
                  onClick={() => openMarket(inst.symbol)}
                  onFocus={() => setSelected(inst.symbol)}
                >
                  <DataTableCell
                    className={cn(
                      "sticky left-0 z-[1] px-3 bg-[var(--bg)]",
                      "group-hover:bg-[var(--hover)]",
                      on && "bg-[var(--elevated)] group-hover:bg-[var(--elevated)]",
                    )}
                  >
                    <div className="font-medium text-[var(--text)]">{perpName(inst.symbol)}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--dim)]">
                      <span className="capitalize">{inst.category}</span>
                      {cluster ? <span className="text-[var(--muted)]"> · {cluster}</span> : null}
                    </div>
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--mark)]">
                    {t ? fmtPx(t.markPrice, inst.priceDecimals) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--muted)]">
                    {t ? fmtPx(t.indexPrice, inst.priceDecimals) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className={change != null ? signedClass(change) : "text-[var(--dim)]"}>
                    {change != null ? fmtPct(change) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className={t ? signedClass(t.fundingRate) : "text-[var(--dim)]"}>
                    {t ? fmtFunding(t.fundingRate) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--muted)]">
                    {t ? fmtPx(t.openInterest, 2) : "—"}
                  </DataTableCell>
                  <DataTableCell numeric className="text-[var(--muted)]">
                    {inst.maxLeverage}x
                  </DataTableCell>
                  <DataTableCell numeric className={events > 0 ? "text-[var(--text)]" : "text-[var(--dim)]"}>
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
