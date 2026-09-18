"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { readJson } from "@/lib/http";
import type { GapRow } from "@/lib/types";
import type { HistoryBatch } from "@/lib/research";
export function SignalHistory({ row }: { row: GapRow }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["signal-history", row.eventId, row.symbol],
    queryFn: () =>
      readJson<{ batches: HistoryBatch[] }>(
        `/api/history?symbol=${encodeURIComponent(row.symbol)}&eventId=${encodeURIComponent(row.eventId)}`,
      ),
    enabled: open,
    staleTime: 60_000,
    retry: 1,
  });
  if (process.env.NEXT_PUBLIC_ENABLE_HISTORY !== "true") return null;
  const points =
    query.data?.batches.filter(
      (b) => b.odds[row.eventId] && b.marks[row.symbol],
    ) ?? [];
  const last = points.at(-1),
    token = last?.odds[row.eventId][2];
  const same = points.filter(
    (b) =>
      b.odds[row.eventId][2] === token &&
      b.links?.[row.eventId]?.[row.symbol] === row.signedBeta,
  );
  const first = same[0];
  const values = first
    ? same.map((b) => ({
        t: b.t,
        probability: b.odds[row.eventId][1],
        price: b.marks[row.symbol][1],
        gap:
          (b.odds[row.eventId][1] - first.odds[row.eventId][1]) *
            row.signedBeta -
          (b.marks[row.symbol][1] / first.marks[row.symbol][1] - 1),
      }))
    : [];
  const max = Math.max(0.0001, ...values.map((v) => Math.abs(v.gap)));
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="border-t border-[var(--line)] pt-3"
    >
      <summary className="lg-focus text-sm">Signal history</summary>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Up to six hours. Residual relative to the first sample with the current
        outcome and mapping.
      </p>
      {query.isPending ? (
        <p className="mt-3 text-xs">Loading history…</p>
      ) : query.error ? (
        <p role="status" className="mt-3 text-xs">
          {query.error.message}
        </p>
      ) : values.length < 2 ? (
        <p className="mt-3 text-xs">Collecting comparable observations.</p>
      ) : (
        <>
          <svg
            viewBox="0 0 320 96"
            role="img"
            aria-label="Residual over the available history"
            className="my-3 w-full"
          >
            <line x1="0" y1="48" x2="320" y2="48" stroke="var(--line-strong)" />
            <polyline
              fill="none"
              stroke="var(--odds)"
              strokeWidth="2"
              points={values
                .map(
                  (v) =>
                    `${((v.t - values[0].t) / (values.at(-1)!.t - values[0].t)) * 320},${48 - (v.gap / max) * 40}`,
                )
                .join(" ")}
            />
          </svg>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-[var(--muted)]">Yes</dt>
              <dd className="num">
                {(values.at(-1)!.probability * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Mark</dt>
              <dd className="num">{values.at(-1)!.price.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Samples</dt>
              <dd className="num">{values.length}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {new Date(values[0].t).toLocaleTimeString()}–
            {new Date(values.at(-1)!.t).toLocaleTimeString()} · Model{" "}
            {last?.modelVersion.slice(0, 8)}
          </p>
        </>
      )}
    </details>
  );
}
