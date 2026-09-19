"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FeedStamp } from "@/components/signal/FeedStamp";
import { WorkspaceHeading } from "@/components/WorkspaceHeading";
import { GAP_WINDOWS, WINDOW_MS } from "@/lib/divergence";
import {
  SCORE_MODEL_VERSION,
  isActionable,
  scoreFactors,
  type ScoreFactors,
} from "@/lib/score";
import { rowScale } from "@/lib/sensitivity";
import type { GapWindow } from "@/lib/types";
import { feedError, gapsQuery } from "@/lib/useGapsFeed";
import { useHydrated } from "@/lib/useHydrated";
import { cn } from "@/lib/utils";

const FACTORS: { key: keyof ScoreFactors; label: string; rule: string }[] = [
  {
    key: "magnitude",
    label: "Perp lag (residual magnitude)",
    rule: "The gap against two of the perp’s typical moves over the window. Capped at 1.",
  },
  {
    key: "lead",
    label: "Odds-first leadership",
    rule: "1 when the odds-implied move beats the perp’s by 25%, 0.42 in line, 0.12 when the perp led.",
  },
  {
    key: "confidence",
    label: "Mapping confidence",
    rule: "How directly the event names or clusters with the perp.",
  },
  {
    key: "liquidity",
    label: "Volume / liquidity",
    rule: "log₁₀ of event volume over 6, capped at 1.",
  },
  {
    key: "movement",
    label: "Odds movement",
    rule: "1 for moves ≥ 0.8 pts, 0.65 for ≥ 0.3 pts, otherwise 0.3.",
  },
  {
    key: "sanity",
    label: "Sanity damping",
    rule: "Pulls down implausibly large odds or implied moves.",
  },
];

const BANDS = [
  { lo: 80, hi: 101, label: "80–100", tone: "bg-odds" },
  { lo: 60, hi: 80, label: "60–80", tone: "bg-odds" },
  { lo: 40, hi: 60, label: "40–60", tone: "bg-subtle" },
  { lo: 20, hi: 40, label: "20–40", tone: "bg-faint" },
  { lo: 0, hi: 20, label: "0–20", tone: "bg-off" },
];

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function ModelView() {
  const [window, setWindow] = useState<GapWindow>("4h");
  const hydrated = useHydrated();
  const query = useQuery(gapsQuery(window));
  // Cached data can predate this boundary's hydration; match the server first.
  const feed = hydrated
    ? query
    : { ...query, data: undefined, error: null, isPending: true };
  const rows = useMemo(() => feed.data?.gaps ?? [], [feed.data]);
  const stats = useMemo(() => {
    const actionable = rows.filter(isActionable).length;
    const captured = median(
      rows
        .filter((r) => r.leader === "odds" && r.catchup != null && Number.isFinite(r.catchup))
        .map((r) => Math.max(0, r.catchup!)),
    );
    const factors = FACTORS.map((f) => {
      const values = rows.map(
        (r) => scoreFactors({ ...r, scale: rowScale(r, WINDOW_MS) })[f.key],
      );
      return {
        ...f,
        avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      };
    });
    const bands = BANDS.map((b) => ({
      ...b,
      count: rows.filter((r) => r.score >= b.lo && r.score < b.hi).length,
    }));
    return { actionable, captured, factors, bands };
  }, [rows]);
  const maxBand = Math.max(1, ...stats.bands.map((b) => b.count));
  const version = feed.data?.modelVersion ?? SCORE_MODEL_VERSION;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <WorkspaceHeading
        title="Model"
        description="How the Leadgap score is built, and how it is behaving on live data right now. A heuristic ranking, not a proof of causality or a forecast."
      >
        <FeedStamp
          asOf={feed.data?.asOf ?? 0}
          loading={feed.isPending}
          error={feedError(feed.data, feed.error)}
        />
      </WorkspaceHeading>
      <div className="px-4 pb-10 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="kicker" id="model-window">
            Live window
          </span>
          <div className="seg" role="group" aria-labelledby="model-window">
            {GAP_WINDOWS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === window}
                onClick={() => setWindow(id)}
                className="num px-2.5 text-[11px]"
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line lg:grid-cols-4">
          <Kpi label="Scored now" value={feed.isPending ? "—" : String(rows.length)} />
          <Kpi
            label="Actionable rate"
            tone="text-odds"
            value={
              feed.isPending || !rows.length
                ? "—"
                : `${Math.round((stats.actionable / rows.length) * 100)}%`
            }
          />
          <Kpi
            label="Median mark captured"
            value={stats.captured == null ? "—" : `${Math.round(stats.captured * 100)}%`}
          />
          <Kpi label="Model version" tone="text-mark" value={version.slice(0, 16)} />
        </dl>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[10px] border border-line bg-surface p-5">
            <h2 className="kicker">Score composition</h2>
            <p className="mt-2 text-[12px] leading-[1.6] text-subtle">
              Score = 100 × the product of six factors, each between 0 and 1.
              Because they multiply, one weak factor pulls the whole score
              down. Bars show each factor’s live average on the {window} window.
            </p>
            <ul className="mt-4 flex flex-col gap-3.5">
              {stats.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex justify-between gap-4 text-[12px]">
                    <span>{f.label}</span>
                    <span className="num text-subtle">
                      {f.avg == null ? "—" : `avg ${f.avg.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-line">
                    <span
                      className="block h-[5px] bg-odds"
                      style={{ width: `${Math.round((f.avg ?? 0) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-dim">{f.rule}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[10px] border border-line bg-surface p-5">
            <h2 className="kicker">Live signals by score band · {window}</h2>
            <p className="mt-2 text-[12px] leading-[1.6] text-subtle">
              How today’s comparisons are distributed. Tradeable signals score
              28 or more with a clear side and less than 85% of the move
              already caught.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {stats.bands.map((b) => (
                <div key={b.label} className="flex items-center gap-2.5">
                  <span className="num w-[52px] text-[11px] text-dim">{b.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-[3px] bg-line">
                    <span
                      className={cn("block h-4", b.tone)}
                      style={{ width: `${(b.count / maxBand) * 100}%` }}
                    />
                  </div>
                  <span className="num w-[34px] text-right text-[11px]">{b.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-3.5 text-[11px] leading-[1.6] text-dim">
              n = {rows.length} live comparisons. Historical calibration — how
              often the mark later closed the gap — is research-only and not
              published until the archive is large enough.
            </p>
          </section>
        </div>

        <section className="mt-6 grid gap-4 border-t border-line pt-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <h2 className="text-[15px] font-medium">How odds become a move</h2>
          <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-subtle">
            <p>
              <span className="text-text">Price-threshold markets</span> —
              “above $X on a date”, “reach $X by a date” — are options on the
              perp itself. With the strike fixed, a change in Yes probability
              maps to the price move that would explain it, given time to
              expiry and an assumed volatility (for a digital,{" "}
              <span className="num">ln S = ln K + σ√τ·Φ⁻¹(p)</span>). Odds that
              drift as expiry nears are not read as price moves. Markets priced
              below 5% or above 95%, or resolving within the window, are left
              out: there a one-tick wobble or time decay would read as a large
              move.
            </p>
            <p>
              <span className="text-text">Other events</span> are assumed to be
              worth about one day’s typical move of the perp if they resolve
              Yes rather than No (volatility ÷ √365; ~3% for ETH, ~2% for
              oil). The mapping only sets the direction, flipped when the
              question is bad news for the perp (recessions, delistings, “dip
              to”). Ambiguous wording — negations, macro data prints — is left
              out rather than guessed. The size is an assumption, not an
              estimate.
            </p>
            <p className="text-[12px] text-dim">
              Model v3 (September 2026). v1 read every odds move one-for-one
              as a price move (6 points became 6%, in oil or ETH alike), so
              signals now score far lower and alert rules saved under v1 may
              stop firing.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 border-t border-line pt-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <h2 className="text-[15px] font-medium">Known limitations</h2>
          <ul className="flex list-disc flex-col gap-2.5 pl-4 text-[13px] leading-[1.6] text-subtle marker:text-dim">
            <li>
              Mapping from event to perp is heuristic — a named or clustered
              relationship, not a verified economic link.
            </li>
            <li>
              “Odds-led” is a magnitude comparison within the selected window.
              It does not establish which market moved first in time.
            </li>
            <li>
              Upstream feeds can be delayed or interrupted. Observations older
              than 90 seconds are dropped rather than scored, so coverage can
              thin out.
            </li>
            <li>
              The residual ignores fees, funding and slippage. A large gap is
              not a profit estimate.
            </li>
            <li>
              Any calibration will be measured on a small, evolving sample and
              can shift as the model or coverage changes.
            </li>
          </ul>
        </section>
        <p className="mt-6 text-[12px] text-dim">
          New to the gap?{" "}
          <Link href="/about" className="lg-focus text-subtle underline underline-offset-2 hover:text-text">
            Read the guide
          </Link>{" "}
          or{" "}
          <Link href="/?tour=1" className="lg-focus text-subtle underline underline-offset-2 hover:text-text">
            take the Signals tour
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="bg-surface px-[18px] py-4">
      <dt className="kicker">{label}</dt>
      <dd className={cn("num mt-1.5 text-[24px]", tone)}>{value}</dd>
    </div>
  );
}
