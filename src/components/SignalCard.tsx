"use client";

import Link from "next/link";
import { ExpectedActual } from "@/components/desk/ExpectedActual";
import { Pill, PolymarketEventLink } from "@/components/ui";
import { fmtOdds, fmtOddsDelta, fmtOddsRange, fmtPct, fmtScore, leaderCopy } from "@/lib/format";
import { scoreClass } from "@/lib/score";
import { confidencePct, oddsPrior, perpName, signalAction, thesisLine } from "@/lib/signal";
import { trackEvent } from "@/lib/track";
import type { GapRow } from "@/lib/types";

export function SignalCard({
  row,
  compact = false,
  trade = true,
}: {
  row: GapRow;
  compact?: boolean;
  trade?: boolean;
}) {
  const href = `/markets/${row.symbol}?event=${row.eventId}`;
  const prior = oddsPrior(row.yesPrice, row.oddsMove);
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? row.perpMove;
  const name = perpName(row.symbol);
  const action = signalAction(row.bias ?? "none", row.symbol);
  const oddsLed = row.leader === "odds";

  const body = (
    <div className="flex flex-col gap-3">
      <p className={`event-title text-[var(--text)] ${compact ? "text-[15px] leading-5" : "text-[20px] leading-6"}`}>
        {row.title}
      </p>

      <div className="grid grid-cols-3 gap-px border border-[var(--line)] bg-[var(--line)]">
        <div className="bg-[var(--surface)] px-2 py-2">
          <div className="lg-label">Yes</div>
          <div className={`num mt-0.5 font-medium leading-none text-[var(--signal)] ${compact ? "text-[15px]" : "text-[18px]"}`}>
            {fmtOdds(row.yesPrice)}
          </div>
          {compact ? null : (
            <div className="num mt-1 text-[10px] text-[var(--muted)]">
              {fmtOddsRange(prior, row.yesPrice)} · {fmtOddsDelta(row.oddsMove)}
            </div>
          )}
        </div>
        <div className="bg-[var(--surface)] px-2 py-2">
          <div className="lg-label">Gap</div>
          <div
            className={`num mt-0.5 font-medium leading-none ${compact ? "text-[15px]" : "text-[18px]"} ${
              oddsLed ? "text-[var(--signal)]" : "text-[var(--dim)]"
            }`}
          >
            {fmtPct(row.gap)}
          </div>
          {compact ? null : <div className="mt-1 text-[10px] text-[var(--dim)]">{leaderCopy(row.leader)}</div>}
        </div>
        <div className="bg-[var(--surface)] px-2 py-2">
          <div className="lg-label">Score</div>
          <div className={`num mt-0.5 font-medium leading-none ${compact ? "text-[15px]" : "text-[18px]"} ${scoreClass(row.score)}`}>
            {fmtScore(row.score)}
          </div>
          {compact ? null : <div className="mt-1 text-[10px] text-[var(--dim)]">{confidencePct(row.confidence)}</div>}
        </div>
      </div>

      {compact ? null : <ExpectedActual expected={expected} actual={actual} emphasizeGap={oddsLed} />}

      <p className="text-[13px] leading-5 text-[var(--text)]">{thesisLine(row)}</p>

      {trade ? (
        <div className="flex flex-col gap-1.5">
          <Link
            href={href}
            onClick={() => trackEvent("view_gap", { symbol: row.symbol, eventId: row.eventId, score: row.score })}
            className="inline-flex w-full items-center justify-center border border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] py-2 text-[12px] font-medium text-[var(--signal)] hover:bg-[color-mix(in_srgb,var(--signal)_8%,transparent)]"
          >
            {row.bias === "none" ? `Open ${name} desk` : `${action} on the desk`}
          </Link>
          <PolymarketEventLink
            slug={row.slug}
            className="text-center text-[11px] text-[var(--muted)] hover:text-[var(--signal)]"
          >
            Open event on Polymarket
          </PolymarketEventLink>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>{action}</Pill>
        </div>
      )}
    </div>
  );

  return body;
}
