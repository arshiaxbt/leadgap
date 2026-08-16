"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { GapMeter } from "@/components/GapMeter";
import { MenuSelect } from "@/components/MenuSelect";
import { OddsFigure } from "@/components/OddsFigure";
import { SetupInspector, setupHref } from "@/components/SetupInspector";
import { LiveDot, Segmented, TextInput } from "@/components/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { eventTitleKey, GAP_WINDOWS } from "@/lib/divergence";
import { fmtFunding, signedClass } from "@/lib/format";
import { biasCopy, isActionable } from "@/lib/score";
import { perpName } from "@/lib/signal";
import { trackEvent } from "@/lib/track";
import type { GapRow, GapWindow, PerpsTicker } from "@/lib/types";
import { useGapsFeed } from "@/lib/useGapsFeed";
import { cn } from "@/lib/utils";

type Filter = "actionable" | "odds" | "all";
type Sort = "score" | "gap" | "fresh";

const XL = "(min-width: 1280px)";

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

function focusSetup(key: string) {
  const desktop = document.getElementById(`setup-${key}`);
  const mobile = document.getElementById(`setup-m-${key}`);
  const el =
    desktop && desktop.getClientRects().length > 0 ? desktop : (mobile ?? desktop);
  el?.focus({ preventScroll: true });
  el?.scrollIntoView({ block: "nearest" });
}

function biasClass(bias: GapRow["bias"]): string {
  switch (bias) {
    case "long":
      return "text-[var(--long)]";
    case "short":
      return "text-[var(--short)]";
    case "none":
      return "text-[var(--dim)]";
    default: {
      const _never: never = bias;
      return _never;
    }
  }
}

function expectedActual(row: GapRow): { expected: number; actual: number } {
  return {
    expected: row.expected ?? row.oddsMove * row.signedBeta,
    actual: row.actual ?? row.perpMove,
  };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.closest("[role='dialog']") || el.closest("[cmdk-input-wrapper]")) return true;
  return false;
}

function useXl(): boolean {
  const [xl, setXl] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(XL);
    const on = () => setXl(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return xl;
}

function PerpCell({
  row,
  tickers,
}: {
  row: GapRow;
  tickers: Record<string, PerpsTicker>;
}) {
  const funding = tickers[row.symbol]?.fundingRate;
  return (
    <div>
      <div className="text-[var(--mark)]">{perpName(row.symbol)}</div>
      {funding == null ? null : (
        <div className={cn("num text-[10px]", signedClass(funding))}>{fmtFunding(funding)}</div>
      )}
    </div>
  );
}

export function OpportunityFeed() {
  const router = useRouter();
  const xl = useXl();
  const [gapWindow, setGapWindow] = useState<GapWindow>("4h");
  const [filter, setFilter] = useState<Filter>("actionable");
  const [sort, setSort] = useState<Sort>("score");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [flashes, setFlashes] = useState<Set<string>>(new Set());
  const prevPrints = useRef<Map<string, { gap: number; score: number }>>(new Map());
  const { gaps, summary, events, tickers, asOf, error, loading } = useGapsFeed(gapWindow);

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

  useEffect(() => {
    if (xl) setSheetOpen(false);
  }, [xl]);

  useEffect(() => {
    const next = new Set<string>();
    for (const row of gaps) {
      const key = rowKey(row);
      const prev = prevPrints.current.get(key);
      if (prev && (prev.gap !== row.gap || prev.score !== row.score)) next.add(key);
    }
    prevPrints.current = new Map(gaps.map((row) => [rowKey(row), { gap: row.gap, score: row.score }]));
    if (next.size === 0) return;
    setFlashes(next);
    const id = globalThis.setTimeout(() => setFlashes(new Set()), 80);
    return () => globalThis.clearTimeout(id);
  }, [gaps]);

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

  const openTrade = useCallback(
    (row: GapRow) => {
      trackEvent("view_gap", { symbol: row.symbol, eventId: row.eventId, score: row.score });
      router.push(setupHref(row));
    },
    [router],
  );

  const selectRow = useCallback(
    (key: string, openSheet: boolean) => {
      setSelected(key);
      if (openSheet && !xl) setSheetOpen(true);
    },
    [xl],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!table.length) return;
      const keys = table.map(rowKey);
      const cur = selected && keys.includes(selected) ? selected : keys[0]!;
      const idx = keys.indexOf(cur);

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = keys[Math.min(idx + 1, keys.length - 1)]!;
        setSelected(next);
        focusSetup(next);
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = keys[Math.max(idx - 1, 0)]!;
        setSelected(next);
        focusSetup(next);
        return;
      }
      if (event.key === "Enter") {
        const row = table.find((r) => rowKey(r) === cur);
        if (!row) return;
        event.preventDefault();
        openTrade(row);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTrade, selected, table]);

  const emptyCopy = query.trim()
    ? "No matching setups. Clear the search or switch to All."
    : filter === "all"
      ? "No divergence in this window. Mapped events below still open a desk."
      : "No matching setups. Switch to Watching or All.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="lg-toolbar flex-wrap gap-x-2 gap-y-1">
        <LiveDot label={asOf ? new Date(asOf).toLocaleTimeString() : "Live"} />
        <Segmented
          compact
          options={GAP_WINDOWS.map((id) => ({ id, label: id }))}
          value={gapWindow}
          onChange={setGapWindow}
        />
        <Segmented
          options={[
            {
              id: "actionable",
              label: `Tradeable ${summary.actionable}`,
              hint: "Odds moved first and the perp has not fully followed.",
            },
            {
              id: "odds",
              label: `Watching ${summary.oddsFirst}`,
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
        <div className="w-36">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Event or perp"
            aria-label="Filter event or perp"
          />
        </div>
      </div>

      {error ? <p className="px-3 py-1 text-[12px] text-[var(--warn)]">{error}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col xl:grid xl:grid-cols-[minmax(0,1.62fr)_minmax(280px,0.38fr)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-[var(--line)] xl:border-r xl:border-b-0">
          {loading ? (
            <DataTableSkeleton columns={5} rows={12} columnWidths={[70, 16, 18, 14, 12]} />
          ) : table.length === 0 ? (
            <DataTableEmpty>
              <p>{emptyCopy}</p>
              {query.trim() ? (
                <button
                  type="button"
                  className="lg-focus mt-2 text-[var(--text)] underline underline-offset-2"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              ) : filter !== "all" ? (
                <button
                  type="button"
                  className="lg-focus mt-2 text-[var(--text)] underline underline-offset-2"
                  onClick={() => setFilter("all")}
                >
                  Show all
                </button>
              ) : null}
            </DataTableEmpty>
          ) : (
            <>
              <ul
                className="min-h-0 flex-1 overflow-auto xl:hidden"
                role="listbox"
                aria-label="Setups"
                aria-activedescendant={active ? `setup-m-${rowKey(active)}` : undefined}
              >
                {table.map((row) => {
                  const key = rowKey(row);
                  const on = active ? rowKey(active) === key : false;
                  const { expected, actual } = expectedActual(row);
                  return (
                    <li
                      key={key}
                      id={`setup-m-${key}`}
                      role="option"
                      aria-selected={on}
                      tabIndex={on ? 0 : -1}
                      onClick={() => selectRow(key, true)}
                      className={cn(
                        "cursor-pointer border-b border-[var(--line)] px-3 py-2.5 outline-none",
                        "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--odds)_40%,transparent)] focus-visible:ring-inset",
                        on ? "bg-[var(--elevated)] shadow-[inset_2px_0_0_var(--odds)]" : "hover:bg-[var(--hover)]",
                        flashes.has(key) && "lg-print-flash",
                      )}
                    >
                      <p className="truncate text-[14px] leading-5 text-[var(--text)]">{row.title}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <OddsFigure yes={row.yesPrice} delta={row.oddsMove} size="sm" />
                        <GapMeter dense expected={expected} actual={actual} />
                        <div className="ml-auto text-right">
                          <PerpCell row={row} tickers={tickers} />
                        </div>
                        <span className={cn("shrink-0 text-[12px]", biasClass(row.bias))}>
                          {biasCopy(row.bias)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <DataTable
                containerClassName="hidden min-h-0 flex-1 xl:block"
                role="listbox"
                aria-label="Setups"
                aria-activedescendant={active ? `setup-${rowKey(active)}` : undefined}
              >
                <DataTableHeader>
                  <tr>
                    <DataTableHead className="px-3">Event</DataTableHead>
                    <DataTableHead>Yes</DataTableHead>
                    <DataTableHead>Gap</DataTableHead>
                    <DataTableHead>Perp</DataTableHead>
                    <DataTableHead>Side</DataTableHead>
                  </tr>
                </DataTableHeader>
                <DataTableBody>
                  {table.map((row) => {
                    const key = rowKey(row);
                    const on = active ? rowKey(active) === key : false;
                    const { expected, actual } = expectedActual(row);
                    return (
                      <DataTableRow
                        key={key}
                        id={`setup-${key}`}
                        role="option"
                        aria-selected={on}
                        selected={on}
                        flash={flashes.has(key)}
                        interactive
                        tabIndex={on ? 0 : -1}
                        onClick={() => selectRow(key, false)}
                      >
                        <DataTableCell className="max-w-0 px-3">
                          <p className="truncate text-[14px] leading-5 text-[var(--text)]">{row.title}</p>
                        </DataTableCell>
                        <DataTableCell>
                          <OddsFigure yes={row.yesPrice} delta={row.oddsMove} size="sm" />
                        </DataTableCell>
                        <DataTableCell>
                          <GapMeter dense expected={expected} actual={actual} />
                        </DataTableCell>
                        <DataTableCell>
                          <PerpCell row={row} tickers={tickers} />
                        </DataTableCell>
                        <DataTableCell>
                          <span className={biasClass(row.bias)}>{biasCopy(row.bias)}</span>
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
            </>
          )}
          {linked.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] px-3 py-2">
              <span className="text-[11px] text-[var(--dim)]">Mapped</span>
              {linked.map((event) => (
                <Link
                  key={event.id}
                  href={`/markets/${event.perps[0]!.symbol}?event=${event.id}`}
                  className="text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {event.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="hidden min-h-0 overflow-auto bg-[var(--surface)] xl:block">
          {active ? (
            <SetupInspector row={active} />
          ) : loading ? null : (
            <p className="px-4 py-10 text-[13px] text-[var(--muted)]">Select a setup.</p>
          )}
        </aside>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] gap-0 overflow-y-auto rounded-t-lg bg-[var(--surface)] p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{active?.title ?? "Setup"}</SheetTitle>
            <SheetDescription>Setup inspector</SheetDescription>
          </SheetHeader>
          {active ? <SetupInspector row={active} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
