"use client";

import Link from "next/link";
import { ExpectedActual } from "@/components/desk/ExpectedActual";
import { Pill } from "@/components/ui";
import { fmtCompact, fmtOddsDelta, fmtOddsRange, leaderCopy, signedClass } from "@/lib/format";
import { scoreBreakdown, scoreClass } from "@/lib/score";
import {
  confidencePct,
  oddsPrior,
  perpName,
  signalAction,
  thesisLine,
  whyAsset,
  whyDirection,
  whyNow,
} from "@/lib/signal";
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
  const parts = scoreBreakdown({
    oddsMove: row.oddsMove,
    perpMove: row.perpMove,
    signedBeta: row.signedBeta,
    confidence: row.confidence,
    volume: row.volume,
    score: row.score,
    leader: row.leader,
  });

  const body = (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium leading-4 text-zinc-100 ${compact ? "text-[12px]" : "text-[13px]"}`}>{row.title}</p>
        <span className={`num shrink-0 font-semibold ${compact ? "text-lg" : "text-xl"} ${scoreClass(row.score)}`}>
          {Math.round(row.score)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="num text-[15px] font-semibold text-[#3ee0a8]">
          Yes {fmtOddsRange(prior, row.yesPrice)}
        </span>
        <span className={`num text-[11px] ${signedClass(row.oddsMove)}`}>{fmtOddsDelta(row.oddsMove)}</span>
      </div>

      <div className="flex flex-wrap gap-1">
        <Pill tone={row.bias === "long" ? "long" : row.bias === "short" ? "short" : "mute"}>{action}</Pill>
        <Pill tone={row.leader === "odds" ? "lead" : row.leader === "perp" ? "perp" : "mute"}>
          {leaderCopy(row.leader)}
        </Pill>
        <span className="text-[10px] text-[#5c6478]">{confidencePct(row.confidence)}</span>
        {row.volume > 0 ? <span className="num text-[10px] text-[#5c6478]">{fmtCompact(row.volume)} vol</span> : null}
      </div>

      <ExpectedActual expected={expected} actual={actual} />

      <dl className="space-y-0.5 text-[11px] leading-4">
        <div>
          <dt className="inline text-[#5c6478]">Why this asset · </dt>
          <dd className="inline text-zinc-300">{whyAsset(row)}</dd>
        </div>
        <div>
          <dt className="inline text-[#5c6478]">Why now · </dt>
          <dd className="inline text-zinc-300">{whyNow(row)}</dd>
        </div>
        <div>
          <dt className="inline text-[#5c6478]">Why this direction · </dt>
          <dd className="inline text-zinc-300">{whyDirection(row)}</dd>
        </div>
      </dl>

      <p className="text-[11px] leading-4 text-zinc-400">{thesisLine(row)}</p>

      {compact ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#5c6478]">Score {Math.round(row.score)}</p>
          <ul className="mt-1 space-y-0.5">
          {parts.map((part) => (
            <li key={part.label} className="flex justify-between gap-2 text-[11px] text-[#8b93a7]">
              <span>{part.label}</span>
              <span className="num text-zinc-200">
                {part.points >= 0 ? "+" : ""}
                {part.points}
              </span>
            </li>
          ))}
          </ul>
        </div>
      ) : (
        <details>
          <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-[#5c6478]">
            Score {Math.round(row.score)}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {parts.map((part) => (
              <li key={part.label} className="flex justify-between gap-2 text-[11px] text-[#8b93a7]">
                <span>{part.label}</span>
                <span className="num text-zinc-200">
                  {part.points >= 0 ? "+" : ""}
                  {part.points}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {trade ? (
        <span className="inline-flex w-full items-center justify-center rounded-md bg-[#3ee0a8] py-1 text-[11px] font-semibold text-[#07080c]">
          {row.bias === "none" ? `Open ${name}` : action}
        </span>
      ) : null}
    </div>
  );

  if (!trade) return body;
  return (
    <Link
      href={href}
      onClick={() => trackEvent("view_gap", { symbol: row.symbol, eventId: row.eventId, score: row.score })}
      className="block rounded-lg border border-[#1a2030] bg-[#0e1118] p-2 transition hover:border-[#3ee0a8]/30"
    >
      {body}
    </Link>
  );
}
