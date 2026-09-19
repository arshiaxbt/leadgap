"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkline } from "@/components/signal/ResidualChart";
import { residualPath } from "@/lib/divergence";
import { readJson } from "@/lib/http";
import type { HistoryBatch } from "@/lib/research";
import { SCORE_MODEL_VERSION, residualTrend } from "@/lib/score";
import type { GapWindow, Snapshot } from "@/lib/types";

const ARCHIVE = process.env.NEXT_PUBLIC_ENABLE_HISTORY === "true";

/**
 * The gap over time. Uses the six-hour archive when it is enabled; otherwise
 * the rolling residual from the live snapshot.
 */
export function GapHistory({
  eventId,
  symbol,
  signedBeta,
  window,
  windowMs,
  odds,
  marks,
  asOf,
  modelVersion,
}: {
  eventId: string;
  symbol: string;
  signedBeta: number;
  window: GapWindow;
  windowMs: number;
  odds: Snapshot[];
  marks: Snapshot[];
  asOf: number;
  modelVersion?: string;
}) {
  const archive = useQuery({
    queryKey: ["signal-history", eventId, symbol],
    queryFn: ({ signal }) =>
      readJson<{ batches: HistoryBatch[] }>(
        `/api/history?symbol=${encodeURIComponent(symbol)}&eventId=${encodeURIComponent(eventId)}`,
        signal,
      ),
    enabled: ARCHIVE,
    staleTime: 60_000,
    retry: 1,
  });

  let title: string;
  let gaps: number[];
  let model: string;
  let note: string | null = null;
  if (ARCHIVE) {
    // Residual relative to the first sample with the current outcome and mapping.
    const points =
      archive.data?.batches?.filter((b) => b.odds[eventId] && b.marks[symbol]) ?? [];
    const last = points.at(-1);
    const token = last?.odds[eventId]![2];
    const same = points.filter(
      (b) =>
        b.odds[eventId]![2] === token &&
        b.links?.[eventId]?.[symbol] === signedBeta,
    );
    const first = same[0];
    gaps = first
      ? same.map(
          (b) =>
            (b.odds[eventId]![1] - first.odds[eventId]![1]) * signedBeta -
            (b.marks[symbol]![1] / first.marks[symbol]![1] - 1),
        )
      : [];
    title = "Gap history · 6h";
    model = last?.modelVersion.slice(0, 16) ?? modelVersion ?? SCORE_MODEL_VERSION;
    if (archive.isPending) note = "Loading history…";
    else if (archive.error) note = archive.error.message;
  } else {
    gaps = residualPath({
      odds,
      marks,
      signedBeta,
      windowMs,
      now: asOf || undefined,
    }).map((p) => p.gap);
    title = `Gap history · rolling ${window}`;
    model = modelVersion?.slice(0, 16) ?? SCORE_MODEL_VERSION;
  }
  const trend = residualTrend(gaps.map((gap) => ({ gap })));

  return (
    <section className="bg-surface p-[18px]">
      <h2 className="kicker">{title}</h2>
      {note ? (
        <p role="status" className="mt-3.5 text-[12px] leading-[1.6] text-subtle">
          {note}
        </p>
      ) : gaps.length >= 3 ? (
        <>
          <Sparkline
            values={gaps}
            width={320}
            height={96}
            baseline={0}
            dot
            className="mt-3.5 h-24 w-full"
            label="Residual over the available history"
          />
          <p className="mt-3 text-[12px] text-subtle">
            Residual is{" "}
            <span className={trend === "closing" ? "text-mark" : "text-odds"}>
              {trend}
            </span>{" "}
            —{" "}
            {trend === "expanding"
              ? "the mark is falling further behind, not catching up."
              : trend === "closing"
                ? "the mark is catching up; what is left is shrinking."
                : "the gap is holding roughly steady."}
          </p>
        </>
      ) : (
        <p className="mt-3.5 text-[12px] leading-[1.6] text-subtle">
          Collecting comparable observations. The history appears once there is
          enough data on both sides.
        </p>
      )}
      <dl className="mt-3">
        <div className="flex justify-between gap-4 border-t border-line py-[9px] text-[12px]">
          <dt className="text-subtle">Samples</dt>
          <dd className="num">{gaps.length}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line py-[9px] text-[12px]">
          <dt className="text-subtle">Model</dt>
          <dd className="num">{model}</dd>
        </div>
      </dl>
    </section>
  );
}
