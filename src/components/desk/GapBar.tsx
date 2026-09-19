"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import { RowTrace } from "@/components/signal/GapTrace";
import { GAP_WINDOWS } from "@/lib/divergence";
import { fmtOdds, fmtOddsDelta, fmtPct, signedClass } from "@/lib/format";
import { signalHref } from "@/lib/links";
import { isActionable } from "@/lib/score";
import { perpName } from "@/lib/signal";
import type { GapRow, GapWindow, ResolvedEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

function Caret({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="8" height="8" aria-hidden className={cn("shrink-0", className)}>
      <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
    </svg>
  );
}

/** Event context that stays visible above the chart: 46px instead of a rail. */
export function GapBar({
  symbol,
  events,
  event,
  onSelect,
  gap,
  window,
  onWindow,
}: {
  symbol: string;
  events: ResolvedEvent[];
  event?: ResolvedEvent;
  onSelect: (id: string) => void;
  gap?: GapRow;
  window: GapWindow;
  onWindow: (w: GapWindow) => void;
}) {
  const name = perpName(symbol);
  if (!event) {
    return (
      <div className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line bg-surface px-5 py-2">
        <span className="kicker shrink-0">Driving event</span>
        <span className="text-[13px] text-subtle">
          No event currently maps to {name}. The perp still trades — you just
          have no Leadgap edge here.
        </span>
        <Link
          href="/markets"
          className="lg-focus ml-auto text-[12px] text-odds underline underline-offset-2"
        >
          See instruments with live signals →
        </Link>
      </div>
    );
  }
  const actionable = gap ? isActionable(gap) : false;
  return (
    <div className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-x-[18px] gap-y-2 border-b border-line bg-surface px-5 py-2">
      <span className="kicker shrink-0">Driving event</span>
      {events.length > 1 ? (
        <label className="relative flex min-w-0 max-w-[340px] items-center gap-[7px] text-[13px] text-text">
          <span className="truncate">{event.title}</span>
          <Caret className="text-dim" />
          <select
            aria-label="Driving event"
            value={event.id}
            onChange={(e) => onSelect(e.target.value)}
            className="lg-focus absolute inset-0 cursor-pointer opacity-0"
          >
            {events.slice(0, 12).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="min-w-0 max-w-[340px] truncate text-[13px]">
          {event.title}
        </span>
      )}
      <span className="hidden h-5 w-px shrink-0 bg-line-strong sm:block" aria-hidden />
      <span className="flex shrink-0 items-baseline gap-[7px] text-[12px] text-subtle">
        Yes
        <span className="num text-[14px] text-odds">{fmtOdds(event.yesPrice)}</span>
        {gap ? (
          <span className={cn("num text-[11px]", signedClass(gap.oddsMove))}>
            {fmtOddsDelta(gap.oddsMove)}
          </span>
        ) : null}
      </span>
      {gap ? (
        <>
          <RowTrace
            row={gap}
            width={152}
            height={26}
            pad={3}
            dots={false}
            zero={false}
            className="hidden md:block"
          />
          <span className="flex shrink-0 items-baseline gap-[7px] text-[12px] text-subtle">
            Gap
            <span className={cn("num text-[14px]", actionable ? "text-odds" : "text-subtle")}>
              {fmtPct(gap.gap)}
            </span>
          </span>
          <DirectionChip bias={gap.bias} score={gap.score} scoreWord size="sm" />
        </>
      ) : (
        <span className="text-[12px] text-dim">
          No comparable observation on the {window} window
        </span>
      )}
      <label className="num flex shrink-0 items-center gap-1 text-[11px] text-dim">
        <span className="relative flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 hover:text-text">
          {window}
          <Caret />
          <select
            aria-label="Comparison window"
            value={window}
            onChange={(e) => onWindow(e.target.value as GapWindow)}
            className="lg-focus absolute inset-0 cursor-pointer opacity-0"
          >
            {GAP_WINDOWS.map((id) => (
              <option key={id} value={id}>
                {id} window
              </option>
            ))}
          </select>
        </span>
      </label>
      <Link
        href={signalHref({ eventId: event.id, symbol, window })}
        className="lg-focus ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-subtle hover:text-text"
      >
        Full signal <ArrowUpRight size={13} aria-hidden />
      </Link>
    </div>
  );
}

/** Mobile: one line of context under the instrument header. */
export function GapStrip({
  symbol,
  event,
  gap,
  window,
}: {
  symbol: string;
  event?: ResolvedEvent;
  gap?: GapRow;
  window: GapWindow;
}) {
  if (!event) {
    return (
      <p className="shrink-0 border-b border-line bg-surface px-4 py-2.5 text-[12px] text-subtle">
        No event maps to {perpName(symbol)}. The perp still trades.
      </p>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5">
      {gap ? (
        <RowTrace row={gap} width={60} height={22} pad={3} dots={false} zero={false} />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-subtle">{event.title}</p>
        <p className="num mt-0.5 text-[12px] text-odds">
          {gap
            ? `Gap ${fmtPct(gap.gap)} · ${gap.bias === "none" ? "No edge" : gap.bias === "long" ? "Long" : "Short"} · ${gap.score}`
            : `Yes ${fmtOdds(event.yesPrice)} · no ${window} comparison`}
        </p>
      </div>
      <Link
        href={signalHref({ eventId: event.id, symbol, window })}
        aria-label="Open full signal"
        className="lg-focus shrink-0 text-dim hover:text-text"
      >
        <ArrowUpRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
