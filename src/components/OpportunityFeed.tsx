"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { ArrowDownUp, ArrowRight, Search } from "lucide-react";
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
import { FeedStatus } from "@/components/FeedStatus";
import { WorkspaceHeading } from "@/components/WorkspaceHeading";
import { GapMeter } from "@/components/GapMeter";
import { MenuSelect } from "@/components/MenuSelect";
import { OddsFigure } from "@/components/OddsFigure";
import { SetupInspector } from "@/components/SetupInspector";
import { Segmented, TextInput } from "@/components/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GAP_WINDOWS, WINDOW_MS } from "@/lib/divergence";
import { fmtPct } from "@/lib/format";
import { biasCopy, isActionable } from "@/lib/score";
import { perpName } from "@/lib/signal";
import type { GapRow, GapWindow } from "@/lib/types";
import { useGapsFeed } from "@/lib/useGapsFeed";
import { cn } from "@/lib/utils";

type Filter = "actionable" | "odds" | "all";
const keyOf = (row: GapRow) => `${row.eventId}-${row.symbol}`;

export function OpportunityFeed() {
  const params = useSearchParams();
  return <SignalWorkspace key={params.toString()} params={params} />;
}
function SignalWorkspace({ params }: { params: ReadonlyURLSearchParams }) {
  const requestedWindow = params.get("window") as GapWindow;
  const requestedFilter = params.get("filter") as Filter;
  const [gapWindow, setGapWindow] = useState<GapWindow>(
    GAP_WINDOWS.includes(requestedWindow) ? requestedWindow : "4h",
  );
  const [filter, setFilter] = useState<Filter>(
    ["all", "actionable", "odds"].includes(requestedFilter)
      ? requestedFilter
      : "actionable",
  );
  const [sort, setSort] = useState("score");
  const [query, setQuery] = useState(params.get("symbol") ?? "");
  const [selected, setSelected] = useState<string | null>(
    params.get("event") && params.get("symbol")
      ? `${params.get("event")}-${params.get("symbol")}`
      : null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const { gaps, summary, events, asOf, error, loading, retry, coverage } =
    useGapsFeed(gapWindow);
  const shown = useMemo(
    () =>
      gaps
        .filter((row) => {
          if (filter === "actionable" && !isActionable(row)) return false;
          if (
            filter === "odds" &&
            !(row.leader === "odds" && !isActionable(row))
          )
            return false;
          return `${row.title} ${row.question} ${row.symbol}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        })
        .sort((a, b) =>
          sort === "gap"
            ? Math.abs(b.gap) - Math.abs(a.gap)
            : sort === "move"
              ? Math.abs(b.oddsMove) - Math.abs(a.oddsMove)
              : b.score - a.score,
        ),
    [gaps, filter, query, sort],
  );
  const table = shown.slice(0, 80);
  const active = table.find((row) => keyOf(row) === selected) ?? table[0];
  function select(row: GapRow) {
    setSelected(keyOf(row));
    if (!window.matchMedia("(min-width: 1280px)").matches) setSheetOpen(true);
  }
  function rowKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next =
      table[
        Math.max(
          0,
          Math.min(table.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)),
        )
      ];
    if (!next) return;
    setSelected(keyOf(next));
    const prefix = window.matchMedia("(min-width: 1280px)").matches
      ? "signal-"
      : "signal-mobile-";
    document.getElementById(`${prefix}${keyOf(next)}`)?.focus();
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceHeading
        title="Signals"
        description="Follow the event. Measure what the market has priced in."
      >
        <FeedStatus asOf={asOf} error={error} loading={loading} retry={retry} />
        <Link
          href="/about"
          className="lg-focus hidden items-center gap-2 text-[13px] text-[var(--muted)] hover:text-[var(--text)] lg:inline-flex"
        >
          How to read a signal <ArrowRight size={14} />
        </Link>
      </WorkspaceHeading>
      <dl className="workspace-summary">
        <div>
          <dt>Tradeable signals</dt>
          <dd className="num text-[var(--odds)]">
            {loading ? "—" : summary.actionable}
          </dd>
        </div>
        <div>
          <dt>Watching</dt>
          <dd className="num">{loading ? "—" : summary.oddsFirst}</dd>
        </div>
        <div>
          <dt>Mapped events</dt>
          <dd className="num">{events.length || "—"}</dd>
        </div>
        <div className="hidden sm:block">
          <dt>Lookback</dt>
          <dd className="num">
            {gapWindow} <small>comparison window</small>
          </dd>
        </div>
      </dl>
      <div className="lg-toolbar flex-wrap gap-y-3">
        <Segmented
          options={[
            { id: "actionable", label: "Tradeable" },
            { id: "odds", label: "Watching" },
            { id: "all", label: "All signals" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Window</span>
          <MenuSelect
            ariaLabel="Comparison window"
            value={gapWindow}
            onChange={setGapWindow}
            options={GAP_WINDOWS.map((id) => ({ id, label: id }))}
          />
        </div>
        <div className="relative w-full sm:w-48">
          <Search
            size={14}
            className="pointer-events-none absolute top-3 left-2.5 text-[var(--muted)]"
          />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search signals"
            aria-label="Filter event or perp"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          <ArrowDownUp size={14} className="text-[var(--muted)]" />
          <MenuSelect
            ariaLabel="Sort signals"
            value={sort}
            onChange={setSort}
            options={[
              { id: "score", label: "Score" },
              { id: "gap", label: "Largest gap" },
              { id: "move", label: "Odds move" },
            ]}
          />
        </div>
      </div>
      {coverage && asOf - coverage.startedAt < WINDOW_MS[gapWindow] ? (
        <p
          className="border-b border-[var(--line)] px-6 py-3 text-xs text-[var(--muted)]"
          role="status"
        >
          Collecting a full {gapWindow} comparison. Shorter windows become
          available first.
        </p>
      ) : null}
      {error ? (
        <p className="workspace-error" role="alert">
          {error}{" "}
          <button onClick={retry} className="ml-2 underline">
            Retry
          </button>
        </p>
      ) : null}
      <div className="signals-grid min-h-0 flex-1 flex-col">
        <section
          aria-label="Signal results"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:border-r xl:border-[var(--line)]"
        >
          <div className="flex shrink-0 items-center justify-between px-6 py-3 text-xs text-[var(--muted)]">
            <span>
              {loading
                ? "Loading signals…"
                : `${shown.length} signal${shown.length === 1 ? "" : "s"}${shown.length > 80 ? " · showing the top 80" : ""}`}
            </span>
            <span className="hidden sm:inline">
              Ranked by{" "}
              {sort === "score"
                ? "model score"
                : sort === "gap"
                  ? "remaining gap"
                  : "odds movement"}
            </span>
          </div>
          {loading ? (
            <DataTableSkeleton columns={5} rows={8} />
          ) : !table.length ? (
            <DataTableEmpty>
              <ArrowDownUp size={24} className="mb-4 text-[var(--muted)]" />
              <h2 className="mb-2 text-lg text-[var(--text)]">
                {error
                  ? "Waiting for market data"
                  : query
                    ? "No matching signals"
                    : "No signals in this view"}
              </h2>
              <p className="max-w-sm leading-6">
                {error
                  ? "Retry the feed to load current signals."
                  : "Try another window or view all signals to see more event-to-market comparisons."}
              </p>
              <button
                className="lg-focus mt-5 rounded-md border border-[var(--line-strong)] px-4 py-2 text-[var(--text)]"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  if (error) retry();
                }}
              >
                {error ? "Retry feed" : "Show all signals"}
              </button>
              <Link href="/markets" className="mt-4 hover:underline">
                Browse markets →
              </Link>
            </DataTableEmpty>
          ) : (
            <div className="min-h-0 overflow-auto">
              <ul className="xl:hidden" aria-label="Signals">
                {table.map((row, i) => (
                  <li
                    key={keyOf(row)}
                    className="border-b border-[var(--line)]"
                  >
                    <button
                      id={`signal-mobile-${keyOf(row)}`}
                      onKeyDown={(e) => rowKeyDown(e, i)}
                      onClick={() => select(row)}
                      className="lg-focus w-full px-4 py-4 text-left hover:bg-[var(--hover)]"
                    >
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-[var(--muted)]">
                          {perpName(row.symbol)}
                        </span>
                        <span className="num text-[var(--odds)]">
                          Score {row.score}
                        </span>
                      </div>
                      <p className="text-[14px] leading-6">{row.title}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <OddsFigure
                          yes={row.yesPrice}
                          delta={row.oddsMove}
                          size="sm"
                        />
                        <span className="num text-[var(--odds)]">
                          {fmtPct(row.gap)} gap
                        </span>
                        <ArrowRight size={16} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <DataTable
                className="signal-table table-fixed"
                containerClassName="hidden xl:block"
                aria-label="Signals"
              >
                <colgroup>
                  <col style={{ width: "43%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <DataTableHeader>
                  <tr>
                    <DataTableHead className="pl-6">
                      Event / market
                    </DataTableHead>
                    <DataTableHead>Yes probability</DataTableHead>
                    <DataTableHead>Remaining gap</DataTableHead>
                    <DataTableHead>Direction</DataTableHead>
                    <DataTableHead align="right" className="pr-6">
                      Score
                    </DataTableHead>
                  </tr>
                </DataTableHeader>
                <DataTableBody>
                  {table.map((row, i) => (
                    <DataTableRow key={keyOf(row)} selected={active === row}>
                      <DataTableCell className="pl-6 pr-4">
                        <button
                          id={`signal-${keyOf(row)}`}
                          onKeyDown={(e) => rowKeyDown(e, i)}
                          onClick={() => select(row)}
                          aria-pressed={active === row}
                          className="lg-focus w-full text-left"
                        >
                          <span className="mb-1.5 block text-[12px] text-[var(--muted)]">
                            {perpName(row.symbol)}
                          </span>
                          <span className="line-clamp-2 text-[14px] leading-6">
                            {row.title}
                          </span>
                        </button>
                      </DataTableCell>
                      <DataTableCell>
                        <OddsFigure
                          yes={row.yesPrice}
                          delta={row.oddsMove}
                          size="sm"
                        />
                      </DataTableCell>
                      <DataTableCell>
                        <span className="num mb-2 block text-[var(--odds)]">
                          {fmtPct(row.gap)}
                        </span>
                        <GapMeter
                          dense
                          expected={row.expected}
                          actual={row.actual}
                        />
                      </DataTableCell>
                      <DataTableCell>
                        <span
                          className={
                            row.bias === "long"
                              ? "text-[var(--long)]"
                              : row.bias === "short"
                                ? "text-[var(--short)]"
                                : "text-[var(--muted)]"
                          }
                        >
                          {biasCopy(row.bias)}
                        </span>
                      </DataTableCell>
                      <DataTableCell numeric className="pr-6">
                        <span
                          className={cn(
                            "text-base",
                            isActionable(row) && "text-[var(--odds)]",
                          )}
                        >
                          {row.score}
                        </span>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-6 py-3 text-xs text-[var(--muted)]"
                data-testid="results-footer"
              >
                <span>
                  {shown.length > 80
                    ? "Top 80 results shown."
                    : "End of results."}{" "}
                  Only fresh, comparable observations appear.
                </span>
                {filter !== "all" || query ? (
                  <button
                    className="lg-focus underline"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
        <aside
          className="inspector hidden min-h-0 overflow-auto xl:block"
          aria-label="Signal inspector"
        >
          {active ? (
            <SetupInspector row={active} />
          ) : (
            <div className="p-6">
              <h2 className="text-base">Signal details</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Select a signal to compare event odds with the related market.
              </p>
            </div>
          )}
        </aside>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[88dvh] max-h-[88dvh] gap-0 overflow-hidden rounded-t-xl bg-[var(--surface)] p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Signal details</SheetTitle>
            <SheetDescription>
              Compare the selected event with its mapped market.
            </SheetDescription>
          </SheetHeader>
          {active ? <SetupInspector row={active} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
