"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { GapMeter } from "@/components/GapMeter";
import { PolymarketEventLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { fmtOdds, fmtOddsDelta, fmtPct, fmtCompact } from "@/lib/format";
import { perpName, thesisLine } from "@/lib/signal";
import { trackEvent } from "@/lib/track";
import type { GapRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export function setupHref(row: Pick<GapRow, "symbol" | "eventId">): string {
  return `/markets/${encodeURIComponent(row.symbol)}?event=${encodeURIComponent(row.eventId)}`;
}
export function SetupInspector({
  row,
  className,
}: {
  row: GapRow;
  className?: string;
}) {
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? row.perpMove;
  return (
    <div className={cn("flex min-h-full flex-col", className)}>
      <div className="inspector-heading">
        <span>Signal details</span>
        <span className="num pr-6 xl:pr-0">{row.window} window</span>
      </div>
      <div className="inspector-body">
        <div>
          <p className="mb-3 text-xs text-[var(--muted)]">
            {perpName(row.symbol)} <span aria-hidden> / </span>{" "}
            {row.mappingKind === "named"
              ? "Direct event link"
              : "Related event"}
          </p>
          <h2>{row.question || row.title}</h2>
        </div>
        <div>
          <p className="mb-2 text-xs text-[var(--muted)]">Yes probability</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="inspector-metric num">
              {fmtOdds(row.yesPrice)}
            </span>
            <span className="num text-sm text-[var(--odds)]">
              {fmtOddsDelta(row.oddsMove)}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-4 text-xs text-[var(--muted)]">
            The event-to-market gap
          </p>
          <GapMeter expected={expected} actual={actual} />
          <dl className="mt-4">
            <div className="comparison-line">
              <dt className="text-[var(--muted)]">Model-implied move</dt>
              <dd className="num text-[var(--odds)]">{fmtPct(expected)}</dd>
            </div>
            <div className="comparison-line">
              <dt className="text-[var(--muted)]">Observed perp move</dt>
              <dd className="num text-[var(--mark)]">{fmtPct(actual)}</dd>
            </div>
            <div className="comparison-line border-b-0">
              <dt>Remaining gap</dt>
              <dd className="num text-[var(--odds)]">{fmtPct(row.gap)}</dd>
            </div>
          </dl>
        </div>
        <p className="text-[13px] leading-6 text-[var(--muted)]">
          {thesisLine(row)}
        </p>
        <details className="border-t border-[var(--line)] pt-4">
          <summary className="lg-focus text-[13px]">
            Why these markets are linked
          </summary>
          <p className="mt-3 text-[13px] leading-6 text-[var(--muted)]">
            {row.mappingReason}
          </p>
          <dl className="mt-2">
            <div className="comparison-line">
              <dt>Mapping confidence</dt>
              <dd className="num">{Math.round(row.confidence * 100)}%</dd>
            </div>
            <div className="comparison-line">
              <dt>Event volume</dt>
              <dd className="num">${fmtCompact(row.volume)}</dd>
            </div>
            <div className="comparison-line">
              <dt>Model score</dt>
              <dd className="num">{row.score}/100</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            A heuristic comparison, not a forecast or evidence of causation.
            Confidence describes the mapping, not a probability of profit.
          </p>
        </details>
      </div>
      <div className="sticky bottom-0 mt-auto border-t border-[var(--line)] bg-[var(--surface)] p-6">
        <Link
          href={setupHref(row)}
          onClick={() =>
            trackEvent("view_gap", {
              symbol: row.symbol,
              eventId: row.eventId,
              score: row.score,
            })
          }
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-11 w-full gap-2",
          )}
        >
          Open {perpName(row.symbol)} desk <ArrowRight size={16} />
        </Link>
        <PolymarketEventLink
          slug={row.slug}
          className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          View event on Polymarket <ArrowUpRight size={14} />
        </PolymarketEventLink>
      </div>
    </div>
  );
}
