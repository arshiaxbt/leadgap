import Link from "next/link";
import { ExpectedActual } from "@/components/desk/ExpectedActual";
import { Pill } from "@/components/ui";
import { fmtCompact, fmtOddsRange, leaderCopy, signedClass } from "@/lib/format";
import { confidencePct, oddsPrior, perpName, signalAction, thesisLine } from "@/lib/signal";
import { scoreClass } from "@/lib/score";
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

  const body = (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium leading-4 text-zinc-100 ${compact ? "text-[12px]" : "text-[13px]"}`}>{row.title}</p>
        <span className={`num shrink-0 font-semibold ${compact ? "text-lg" : "text-xl"} ${scoreClass(row.score)}`}>
          {Math.round(row.score)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="num text-[15px] font-semibold text-[#3ee0a8]">{fmtOddsRange(prior, row.yesPrice)}</span>
        <span className={`num text-[11px] ${signedClass(row.oddsMove)}`}>
          {row.oddsMove >= 0 ? "+" : ""}
          {(row.oddsMove * 100).toFixed(1)}¢
        </span>
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

      <p className="text-[11px] leading-4 text-zinc-300">{thesisLine(row)}</p>

      {trade ? (
        <span className="inline-flex w-full items-center justify-center rounded-md bg-[#3ee0a8] py-1 text-[11px] font-semibold text-[#07080c]">
          {row.bias === "none" ? `Open ${name}` : action}
        </span>
      ) : null}
    </div>
  );

  if (!trade) return body;
  return (
    <Link href={href} className="block rounded-lg border border-[#1a2030] bg-[#0e1118] p-2 transition hover:border-[#3ee0a8]/30">
      {body}
    </Link>
  );
}
