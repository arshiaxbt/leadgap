"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GapTrace, endpointTrace } from "@/components/signal/GapTrace";
import { DirectionChip } from "@/components/signal/DirectionChip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { fmtPct } from "@/lib/format";
import { deskHref, signalHref } from "@/lib/links";
import { isActionable } from "@/lib/score";
import { mappingLabel, perpName, thesisLine } from "@/lib/signal";
import { trackEvent } from "@/lib/track";
import type { GapRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Mobile signal inspector: the gap, the thesis, one action. */
export function SignalSheet({
  row,
  open,
  onOpenChange,
}: {
  row: GapRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[90dvh] max-h-[90dvh] gap-0 overflow-hidden rounded-t-[14px] border-0 bg-side p-0"
      >
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
        {row ? <SheetBody row={row} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ row }: { row: GapRow }) {
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? row.perpMove;
  const actionable = isActionable(row);
  const name = perpName(row.symbol);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto px-[18px] pt-2 pb-[18px]">
        <div className="flex items-center gap-2">
          <span className="chip">{name}</span>
          <span className="text-[11px] text-dim">
            {mappingLabel(row)} · {row.window} window
          </span>
        </div>
        <SheetTitle className="serif mt-3 text-[24px] leading-[1.25] font-normal text-text">
          {row.question || row.title}
        </SheetTitle>
        <SheetDescription className="sr-only">
          How far the {name} perp has followed this event on the {row.window}{" "}
          window.
        </SheetDescription>
        <figure className="mt-4 overflow-hidden rounded-[10px] border border-line bg-surface">
          <figcaption className="flex gap-3.5 border-b border-line px-3.5 py-2.5 text-[11px]">
            <span className="text-odds">Implied {fmtPct(expected)}</span>
            <span className="text-mark">Observed {fmtPct(actual)}</span>
          </figcaption>
          <GapTrace
            trace={row.trace ?? endpointTrace(expected, actual)}
            estimated={!row.trace}
            width={320}
            height={130}
            pad={14}
            dots={false}
            zero
            strokeScale={1.2}
            className="h-[130px] w-full"
          />
          <p
            className={cn(
              "num border-t border-line p-2.5 text-center text-[16px]",
              actionable ? "text-odds" : "text-subtle",
            )}
          >
            Gap {fmtPct(row.gap)}
          </p>
        </figure>
        <p className="mt-3.5 text-[13px] leading-[1.6] text-subtle">
          {thesisLine(row)}
        </p>
        <div className="mt-4 flex items-center gap-2.5">
          <span
            className={cn(
              "num text-[32px] font-medium",
              actionable ? "text-odds" : "text-dim",
            )}
          >
            {row.score}
          </span>
          <span className="text-[12px] text-subtle">Leadgap score</span>
          <DirectionChip bias={row.bias} className="ml-auto" />
        </div>
        <Link
          href={signalHref(row)}
          className="lg-focus mt-5 inline-flex items-center gap-1.5 text-[13px] text-subtle hover:text-text"
        >
          Full signal <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="shrink-0 border-t border-line px-[18px] pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <Link
          href={deskHref(row)}
          onClick={() =>
            trackEvent("view_gap", {
              symbol: row.symbol,
              eventId: row.eventId,
              score: row.score,
            })
          }
          className="lg-focus flex h-[46px] w-full items-center justify-center rounded-[8px] bg-odds text-[15px] font-semibold text-on-odds"
        >
          Open {name} desk
        </Link>
      </div>
    </>
  );
}
