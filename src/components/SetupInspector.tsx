"use client";

import Link from "next/link";
import { GapMeter } from "@/components/GapMeter";
import { OddsFigure } from "@/components/OddsFigure";
import { ResidualSpark } from "@/components/desk/ResidualSpark";
import { buttonVariants } from "@/components/ui/button";
import { PolymarketEventLink } from "@/components/ui";
import { fmtPct, fmtScore } from "@/lib/format";
import { scoreClass } from "@/lib/score";
import { perpName, thesisLine } from "@/lib/signal";
import { trackEvent } from "@/lib/track";
import type { GapRow, ResidualPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export function setupHref(row: Pick<GapRow, "symbol" | "eventId">): string {
  return `/markets/${row.symbol}?event=${row.eventId}`;
}

function expectedActual(row: GapRow): { expected: number; actual: number } {
  return {
    expected: row.expected ?? row.oddsMove * row.signedBeta,
    actual: row.actual ?? row.perpMove,
  };
}

/** Current expected vs actual as two level lines — not a time series. */
function snapshotSpark(expected: number, actual: number): ResidualPoint[] {
  return Array.from({ length: 8 }, (_, i) => ({
    t: i,
    expected,
    actual,
    gap: expected - actual,
  }));
}

function TradeActions({ row }: { row: GapRow }) {
  const href = setupHref(row);
  const name = perpName(row.symbol);

  function onTrade() {
    trackEvent("view_gap", { symbol: row.symbol, eventId: row.eventId, score: row.score });
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {row.bias === "none" ? (
        <Link href={href} onClick={onTrade} className={cn(buttonVariants({ variant: "default" }), "h-10 w-full")}>
          Open {name}
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={href}
            onClick={onTrade}
            className={cn(
              buttonVariants({ variant: row.bias === "long" ? "long" : "ghost", size: "sm" }),
              "h-10 w-full",
              row.bias !== "long" && "border border-[var(--line)] opacity-40",
            )}
          >
            Long {name}
          </Link>
          <Link
            href={href}
            onClick={onTrade}
            className={cn(
              buttonVariants({ variant: row.bias === "short" ? "short" : "ghost", size: "sm" }),
              "h-10 w-full",
              row.bias !== "short" && "border border-[var(--line)] opacity-40",
            )}
          >
            Short {name}
          </Link>
        </div>
      )}
      <PolymarketEventLink
        slug={row.slug}
        className="text-center text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        Open event on Polymarket
      </PolymarketEventLink>
    </div>
  );
}

export function SetupInspector({
  row,
  className,
}: {
  row: GapRow;
  className?: string;
}) {
  const { expected, actual } = expectedActual(row);
  const oddsLed = row.leader === "odds";

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-col gap-3 p-4">
        <p className="pr-8 text-[15px] leading-5 text-[var(--text)]">{row.question || row.title}</p>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[var(--dim)]">Yes</span>
            <OddsFigure yes={row.yesPrice} delta={row.oddsMove} size="sm" />
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[var(--dim)]">Gap</span>
            <span className={cn("num", oddsLed ? "text-[var(--odds)]" : "text-[var(--dim)]")}>
              {fmtPct(row.gap)}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[var(--dim)]">Score</span>
            <span className={cn("num", scoreClass(row.score))}>{fmtScore(row.score)}</span>
          </span>
        </div>

        <GapMeter expected={expected} actual={actual} />

        <p className="text-[13px] leading-5 text-[var(--text)]">{thesisLine(row)}</p>

        <ResidualSpark points={snapshotSpark(expected, actual)} className="h-8 opacity-80" />
      </div>

      <div className="sticky bottom-0 z-10 border-t border-[var(--line)] bg-[var(--surface)] p-3">
        <TradeActions row={row} />
      </div>
    </div>
  );
}
