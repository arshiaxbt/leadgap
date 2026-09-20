"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import {
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import {
  FeedStamp,
  ageCopy,
  feedState,
  useNow,
  FEED_ALERT_AFTER_MS,
} from "@/components/signal/FeedStamp";
import { RowTrace } from "@/components/signal/GapTrace";
import { SignalSheet } from "@/components/signal/SignalSheet";
import { SignalTour } from "@/components/signal/SignalTour";
import { WorkspaceHeading } from "@/components/WorkspaceHeading";
import { GAP_WINDOWS, WINDOW_MS } from "@/lib/divergence";
import { fmtCompact, fmtOdds, fmtOddsDelta, fmtPct } from "@/lib/format";
import { signalHref } from "@/lib/links";
import { catchupCopy, isActionable } from "@/lib/score";
import { leaderLabel, mappingLabel, perpName } from "@/lib/signal";
import type { GapRow, GapWindow } from "@/lib/types";
import { useGapsFeed } from "@/lib/useGapsFeed";
import { useHydrated } from "@/lib/useHydrated";
import { cn } from "@/lib/utils";

type Filter = "actionable" | "odds" | "all";
type Sort = "score" | "gap" | "move";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "actionable", label: "Candidates" },
  { id: "odds", label: "Divergences" },
  { id: "all", label: "All" },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: "Score" },
  { id: "gap", label: "Largest gap" },
  { id: "move", label: "Odds move" },
];
const MIN_SCORES = [0, 12, 28, 40, 55, 70];
const LIMIT = 80;
const GRID = "lg:grid lg:grid-cols-[74px_minmax(0,1fr)_132px_236px_126px_48px]";

const keyOf = (row: GapRow) => `${row.eventId}-${row.symbol}`;

export function OpportunityFeed() {
  const params = useSearchParams();
  return <SignalWorkspace key={params.toString()} params={params} />;
}

function SignalWorkspace({ params }: { params: ReadonlyURLSearchParams }) {
  const router = useRouter();
  const requestedWindow = params.get("window") as GapWindow;
  const requestedFilter = params.get("filter") as Filter;
  const [gapWindow, setGapWindow] = useState<GapWindow>(
    GAP_WINDOWS.includes(requestedWindow) ? requestedWindow : "4h",
  );
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.id === requestedFilter)
      ? requestedFilter
      : "actionable",
  );
  const [sort, setSort] = useState<Sort>("score");
  const [minScore, setMinScore] = useState(0);
  const [query, setQuery] = useState(params.get("symbol") ?? "");
  const [sheetRow, setSheetRow] = useState<GapRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const hydrated = useHydrated();
  const live = useGapsFeed(gapWindow);
  // Match the server's loading render until hydration completes.
  const { gaps, summary, events, asOf, error, loading, retry, coverage } =
    hydrated
      ? live
      : {
          ...live,
          gaps: [],
          events: [],
          summary: { actionable: 0, oddsFirst: 0, topScore: 0 },
          asOf: 0,
          error: null,
          loading: true,
          coverage: undefined,
        };
  const now = useNow(5000);
  const state = feedState({ asOf, loading, error, now });
  const interrupted =
    Boolean(asOf) && now > 0 && now - asOf > FEED_ALERT_AFTER_MS;
  const degraded = interrupted || state === "error";

  const shown = useMemo(
    () =>
      gaps
        .filter((row) => {
          if (filter === "actionable" && !isActionable(row)) return false;
          if (filter === "odds" && isActionable(row)) return false;
          if (row.score < minScore) return false;
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
    [gaps, filter, minScore, query, sort],
  );
  const rows = shown.slice(0, LIMIT);
  const instrumentCount = useMemo(
    () => new Set(events.flatMap((e) => e.perps.map((p) => p.symbol))).size,
    [events],
  );
  const narrowed = filter !== "all" || minScore > 0 || query.trim() !== "";
  const longer = GAP_WINDOWS[GAP_WINDOWS.indexOf(gapWindow) + 1];

  function showAll() {
    setFilter("all");
    setMinScore(0);
    setQuery("");
  }

  function focusRow(e: KeyboardEvent, index: number, prefix: string) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = rows[index + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) document.getElementById(`${prefix}${keyOf(next)}`)?.focus();
  }

  function openRow(e: MouseEvent, row: GapRow) {
    if ((e.target as HTMLElement).closest("a,button")) return;
    router.push(signalHref(row));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:overflow-hidden">
      <WorkspaceHeading
        title="Signals"
        description="Supported price events compared with perpetual moves. Candidates require timing and quote evidence."
      >
        <FeedStamp asOf={asOf} loading={loading} error={error} retry={retry} />
      </WorkspaceHeading>

      <BookStrip
        loading={loading}
        candidates={summary.actionable}
        watching={summary.oddsFirst}
        events={events.length}
        instruments={instrumentCount}
        window={gapWindow}
        onWindow={setGapWindow}
      />

      <div className="lg-toolbar flex-wrap gap-y-2.5">
        <div className="seg" role="group" aria-label="Signal filter">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="hidden h-5 w-px bg-line-strong md:block" aria-hidden />
        <label className="ctl">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="lg-focus cursor-pointer appearance-none bg-transparent text-text"
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <Caret />
        </label>
        <label className="ctl">
          Min score
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="lg-focus num cursor-pointer appearance-none bg-transparent text-text"
          >
            {MIN_SCORES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Any" : n}
              </option>
            ))}
          </select>
          <Caret />
        </label>
        <div className="relative w-full sm:w-[200px]">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-dim"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter event or perp"
            aria-label="Filter event or perp"
            className="lg-input h-[30px] pl-8 text-[12px]"
          />
        </div>
        <span className="num ml-auto text-[11px] text-dim" role="status">
          {loading
            ? "LOADING…"
            : `${Math.min(shown.length, LIMIT)} OF ${gaps.length} SHOWN`}
        </span>
      </div>

      {coverage && asOf - coverage.startedAt < WINDOW_MS[gapWindow] ? (
        <p className="px-6 pb-3 text-[12px] text-subtle" role="status">
          Collecting a full {gapWindow} comparison. Shorter windows become
          available first.
        </p>
      ) : null}

      {degraded ? (
        <div role="alert" className="workspace-error shrink-0">
          <span
            className="status-dot shrink-0"
            data-state="stale"
            aria-hidden
          />
          <p className="min-w-0 flex-1">
            {asOf
              ? `Updates interrupted ${ageCopy(asOf, now)}. Showing the last comparable observation — gaps below may have moved.`
              : "Signals could not load. Retry the feed to fetch current data."}
          </p>
          <button
            type="button"
            onClick={retry}
            className="lg-focus h-8 shrink-0 rounded-[7px] border border-[rgba(224,179,65,0.45)] px-3.5 text-[13px] font-medium text-warn"
          >
            Retry feed
          </button>
        </div>
      ) : null}

      {!loading && (
        <p
          className="px-4 py-2 text-[11px] leading-relaxed text-dim md:px-6"
          role="status"
        >
          {gaps.filter((r) => r.timing?.status !== "odds-leads").length}{" "}
          comparisons lack clear odds leadership;{" "}
          {gaps.filter((r) => r.execution?.status !== "pass").length} lack
          passing quote evidence.
          {gapWindow === "1m" || gapWindow === "5m"
            ? " This window is too short to measure timing; try 15m or longer."
            : ""}
          {coverage?.queryCount
            ? ` Discovery rotates ${coverage.queryCount} queries over ${Math.round((coverage.discoveryCycleMs ?? 0) / 60000)} minutes, with up to ${coverage.catalogLimit} events. Quotes cover at most 20 events and 12 instruments per update.`
            : " Coverage is bounded; this is not a scan of every market."}
        </p>
      )}
      <section
        aria-label="Signal results"
        className="px-4 pb-6 md:px-6 lg:min-h-0 lg:flex-1 lg:overflow-auto"
      >
        {loading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState
            filter={filter}
            query={query}
            window={gapWindow}
            events={events.length}
            total={gaps.length}
            longer={longer}
            narrowed={narrowed}
            error={Boolean(error) && !gaps.length}
            onWindow={setGapWindow}
            onShowAll={showAll}
            onRetry={retry}
          />
        ) : (
          <>
            <div role="table" aria-label="Signals" className="hidden lg:block">
              <div
                role="row"
                className={cn(GRID, "items-end border-b border-line pb-2.5")}
              >
                <span role="columnheader" className="kicker">
                  Score
                </span>
                <span role="columnheader" className="kicker pl-4">
                  Event
                </span>
                <span role="columnheader" className="kicker pl-4">
                  Yes prob.
                </span>
                <span role="columnheader" className="kicker pl-4">
                  Implied vs observed · the gap
                </span>
                <span role="columnheader" className="kicker pl-4">
                  Direction
                </span>
                <span role="columnheader">
                  <span className="sr-only">Open</span>
                </span>
              </div>
              {rows.map((row, i) => (
                <SignalRow
                  key={keyOf(row)}
                  row={row}
                  first={i === 0}
                  muted={degraded}
                  onKeyDown={(e) => focusRow(e, i, "signal-")}
                  onClick={(e) => openRow(e, row)}
                />
              ))}
            </div>
            <ul aria-label="Signals" className="-mx-4 md:-mx-6 lg:hidden">
              {rows.map((row, i) => (
                <SignalCard
                  key={keyOf(row)}
                  row={row}
                  muted={degraded}
                  onKeyDown={(e) => focusRow(e, i, "signal-mobile-")}
                  onOpen={() => {
                    setSheetRow(row);
                    setSheetOpen(true);
                  }}
                />
              ))}
            </ul>
            <div
              data-testid="results-footer"
              className="num flex flex-wrap items-center justify-between gap-3 py-4 text-[11px] text-dim"
            >
              <span>
                {shown.length > LIMIT ? `TOP ${LIMIT} SHOWN` : "END OF RESULTS"}{" "}
                · ONLY FRESH, COMPARABLE OBSERVATIONS
              </span>
              {narrowed && gaps.length > rows.length ? (
                <button
                  type="button"
                  onClick={showAll}
                  className="lg-focus text-[11px] text-subtle hover:text-text"
                >
                  Show all {gaps.length} →
                </button>
              ) : null}
            </div>
            <Legend />
          </>
        )}
      </section>

      <SignalSheet
        row={sheetRow}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      {!loading && rows.length > 0 ? <SignalTour /> : null}
    </div>
  );
}

function Caret() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="8"
      height="8"
      aria-hidden
      className="shrink-0"
    >
      <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
    </svg>
  );
}

function BookStrip({
  loading,
  candidates,
  watching,
  events,
  instruments,
  window,
  onWindow,
}: {
  loading: boolean;
  candidates: number;
  watching: number;
  events: number;
  instruments: number;
  window: GapWindow;
  onWindow: (w: GapWindow) => void;
}) {
  const total = candidates + watching;
  const lit = total ? Math.round((candidates / total) * 5) : 0;
  const value = (n: number) => (loading ? "—" : n);
  return (
    <div className="mx-4 flex shrink-0 flex-wrap items-stretch gap-px overflow-hidden rounded-[10px] border border-line bg-line md:mx-6 lg:flex-nowrap">
      <div className="min-w-[45%] flex-1 bg-surface px-[18px] py-3.5 sm:min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="num text-[26px] leading-none font-medium text-odds">
            {value(candidates)}
          </span>
          <span className="text-[12px] text-subtle">candidates</span>
        </p>
        <div className="mt-2.5 flex h-1 gap-[3px]" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={cn("flex-1", i < lit ? "bg-odds" : "bg-line-strong")}
            />
          ))}
        </div>
      </div>
      <div className="min-w-[45%] flex-1 bg-surface px-[18px] py-3.5 sm:min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="num text-[26px] leading-none font-medium">
            {value(watching)}
          </span>
          <span className="text-[12px] text-subtle">divergences</span>
        </p>
        <p className="mt-2.5 text-[11px] text-dim">
          Supported comparisons, not candidates
        </p>
      </div>
      <div className="hidden flex-1 bg-surface px-[18px] py-3.5 sm:block">
        <p className="flex items-baseline gap-2">
          <span className="num text-[26px] leading-none font-medium">
            {events || (loading ? "—" : 0)}
          </span>
          <span className="text-[12px] text-subtle">mapped events</span>
        </p>
        <p className="mt-2.5 text-[11px] text-dim">
          Across {instruments} instrument{instruments === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex w-full flex-col justify-between bg-surface px-[18px] py-3.5 lg:w-auto lg:flex-[1.4]">
        <p className="kicker" id="window-lens">
          Comparison window
        </p>
        <div
          className="mt-2.5 flex gap-0.5"
          role="group"
          aria-labelledby="window-lens"
        >
          {GAP_WINDOWS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === window}
              onClick={() => onWindow(id)}
              className={cn(
                "lg-focus num flex-1 rounded-[4px] py-1.5 text-[11px] transition-colors",
                id === window
                  ? "bg-active text-text"
                  : "text-dim hover:text-text",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalRow({
  row,
  first,
  muted,
  onKeyDown,
  onClick,
}: {
  row: GapRow;
  first: boolean;
  muted: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
  onClick: (e: MouseEvent) => void;
}) {
  const actionable = isActionable(row) && !muted;
  const href = signalHref(row);
  const name = perpName(row.symbol);
  return (
    <div
      role="row"
      onClick={onClick}
      className={cn(
        GRID,
        "group cursor-pointer items-start border-b border-line-soft py-[18px] transition-colors hover:bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]",
      )}
    >
      <div
        role="cell"
        className="flex items-baseline gap-2"
        data-tour={first ? "score" : undefined}
      >
        <span
          aria-hidden
          className={cn(
            "block h-[26px] w-0.5 shrink-0",
            actionable ? "bg-odds" : "bg-line-strong",
          )}
        />
        <span
          className={cn(
            "num text-[22px] leading-none font-medium",
            actionable ? "text-odds" : muted ? "text-subtle" : "text-dim",
          )}
        >
          {row.score}
        </span>
      </div>
      <div
        role="cell"
        className="min-w-0 px-4"
        data-tour={first ? "event" : undefined}
      >
        <Link
          id={`signal-${keyOf(row)}`}
          href={href}
          onKeyDown={onKeyDown}
          className="lg-focus line-clamp-2 text-[15px] leading-[1.35] tracking-[-0.01em] text-text group-hover:text-odds"
        >
          {row.title}
        </Link>
        <div className="mt-[7px] flex min-w-0 items-center gap-2 text-[11px] text-dim">
          <span className="chip">{name}</span>
          <span className="truncate">{mappingLabel(row)}</span>
          <span className="shrink-0">· vol ${fmtCompact(row.volume)}</span>
        </div>
      </div>
      <div role="cell" className="px-4">
        <div
          className={cn(
            "num text-[16px] leading-none",
            muted ? "text-subtle" : "text-odds",
          )}
        >
          {fmtOdds(row.yesPrice)}
        </div>
        <div
          className={cn(
            "num mt-1.5 text-[11px]",
            muted
              ? "text-dim"
              : row.oddsMove < 0
                ? "text-short"
                : row.oddsMove > 0
                  ? "text-long"
                  : "text-dim",
          )}
        >
          {fmtOddsDelta(row.oddsMove)}
        </div>
      </div>
      <div
        role="cell"
        className="-mt-1 flex items-center gap-3 px-4"
        data-tour={first ? "gap" : undefined}
      >
        <RowTrace row={row} dim={muted} />
        <div>
          <div
            className={cn(
              "num text-[16px] leading-none",
              actionable ? "text-odds" : "text-subtle",
            )}
          >
            {fmtPct(row.gap)}
          </div>
          <div className="num mt-1.5 text-[10px] text-dim uppercase">
            {catchupCopy(row.catchup)}
          </div>
        </div>
      </div>
      <div
        role="cell"
        className="px-4"
        data-tour={first ? "direction" : undefined}
      >
        <DirectionChip bias={row.bias} muted={muted} />
        <div className="mt-[7px] text-[11px] text-dim">
          {leaderLabel(row.leader)}
        </div>
      </div>
      <div role="cell" className="text-right">
        <Link
          href={href}
          tabIndex={-1}
          aria-label={`Open signal: ${row.title}`}
          className="inline-flex text-dim transition-colors group-hover:text-odds"
        >
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function SignalCard({
  row,
  muted,
  onKeyDown,
  onOpen,
}: {
  row: GapRow;
  muted: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
  onOpen: () => void;
}) {
  const actionable = isActionable(row) && !muted;
  return (
    <li className="border-t border-line-soft">
      <button
        type="button"
        id={`signal-mobile-${keyOf(row)}`}
        onKeyDown={onKeyDown}
        onClick={onOpen}
        aria-haspopup="dialog"
        className="lg-focus block w-full px-4 py-4 text-left transition-colors hover:bg-surface md:px-6"
      >
        <span className="flex items-center justify-between">
          <span className="chip">{perpName(row.symbol)}</span>
          <span
            className={cn(
              "num text-[20px]",
              actionable ? "text-odds" : "text-dim",
            )}
          >
            <span className="sr-only">Score </span>
            {row.score}
          </span>
        </span>
        <span className="mt-2 block text-[14px] leading-[1.4]">
          {row.title}
        </span>
        <RowTrace
          row={row}
          width={320}
          height={40}
          pad={4}
          dots={false}
          zero={false}
          dim={muted}
          className="mt-2.5 h-10 w-full"
        />
        <span className="mt-2 flex items-center justify-between gap-3">
          <span
            className={cn(
              "num text-[13px]",
              actionable ? "text-odds" : "text-subtle",
            )}
          >
            {fmtPct(row.gap)} gap
          </span>
          <DirectionChip bias={row.bias} size="sm" muted={muted} />
        </span>
      </button>
    </li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2 rounded-[10px] border border-line bg-surface px-[18px] py-3.5 text-[12px] text-subtle">
      <span className="flex items-center gap-2">
        <span className="h-0.5 w-3.5 bg-odds" aria-hidden /> Model-implied perp
        move
      </span>
      <span className="flex items-center gap-2">
        <span className="h-0.5 w-3.5 bg-mark" aria-hidden /> Observed perp move
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-3.5 bg-[var(--band)]" aria-hidden /> The gap —
        what is left
      </span>
      <span className="text-dim lg:ml-auto">
        A heuristic comparison. Not a forecast, not evidence of causation.
        Dashed lines mean only the window’s endpoints are known.
      </span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading signals" className="pt-1">
      <div
        className={cn(GRID, "hidden gap-4 border-b border-line pb-2.5 lg:grid")}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-2 rounded-[2px] bg-line" />
        ))}
      </div>
      {[1, 0.66, 0.36].map((opacity, i) => (
        <div
          key={i}
          style={{ opacity }}
          className="grid grid-cols-[48px_1fr_80px] items-center gap-4 border-b border-line-soft py-5 lg:grid-cols-[74px_1fr_132px_236px_126px]"
        >
          <span className="h-[22px] rounded-[3px] bg-raise" />
          <span className="h-3.5 rounded-[3px] bg-raise" />
          <span className="h-4 rounded-[3px] bg-raise" />
          <span className="hidden h-10 rounded-[4px] bg-raise lg:block" />
          <span className="hidden h-[22px] w-[70px] rounded-[4px] bg-raise lg:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filter,
  query,
  window,
  events,
  total,
  longer,
  narrowed,
  error,
  onWindow,
  onShowAll,
  onRetry,
}: {
  filter: Filter;
  query: string;
  window: GapWindow;
  events: number;
  total: number;
  longer?: GapWindow;
  narrowed: boolean;
  error: boolean;
  onWindow: (w: GapWindow) => void;
  onShowAll: () => void;
  onRetry: () => void;
}) {
  const searching = query.trim() !== "";
  const title = error
    ? "Waiting for market data"
    : searching
      ? "No matching signals"
      : filter === "actionable"
        ? "No research candidates right now."
        : filter === "odds"
          ? "No supported divergences in this view."
          : "No comparable observations yet.";
  const body = error
    ? "The signal feed did not respond. Retry to fetch the latest comparisons."
    : searching
      ? `Nothing on the ${window} window matches “${query.trim()}”.`
      : filter === "actionable"
        ? `Nothing passes the model’s thresholds across ${events} mapped event${events === 1 ? "" : "s"} on the ${window} window. That’s a normal state, not an error.`
        : filter === "odds"
          ? `No supported non-candidate comparisons are available on the ${window} window.`
          : `Signals appear once both the event odds and the perp have fresh data across the full ${window} window.`;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <svg
        viewBox="0 0 120 44"
        width="120"
        height="44"
        aria-hidden
        className="opacity-50"
      >
        <line x1="0" y1="34" x2="120" y2="34" stroke="var(--line-strong)" />
        <path
          d="M0 34 L30 33 L60 34 L90 33 L120 34"
          fill="none"
          stroke="var(--mark)"
          strokeWidth="1.6"
        />
        <path
          d="M0 33 L30 32 L60 33 L90 32 L120 33"
          fill="none"
          stroke="var(--odds)"
          strokeWidth="1.8"
        />
      </svg>
      <h2 className="serif mt-[18px] text-[26px]">{title}</h2>
      <p className="mt-2.5 max-w-[46ch] text-[13px] leading-[1.65] text-subtle">
        {body}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="lg-focus h-9 rounded-[7px] bg-odds px-[15px] text-[13px] font-semibold text-on-odds"
          >
            Retry feed
          </button>
        ) : (
          <>
            {longer && !searching ? (
              <button
                type="button"
                onClick={() => onWindow(longer)}
                className="lg-focus h-9 rounded-[7px] bg-odds px-[15px] text-[13px] font-semibold text-on-odds"
              >
                Widen to a {longer} window
              </button>
            ) : null}
            {narrowed ? (
              <button
                type="button"
                onClick={onShowAll}
                className="lg-focus h-9 rounded-[7px] border border-line-strong px-[15px] text-[13px] text-subtle hover:text-text"
              >
                {total ? `Show all ${total} signals` : "Show all signals"}
              </button>
            ) : null}
          </>
        )}
      </div>
      <Link
        href="/markets"
        className="lg-focus mt-4 text-[12px] text-dim hover:text-text"
      >
        Browse markets →
      </Link>
    </div>
  );
}
