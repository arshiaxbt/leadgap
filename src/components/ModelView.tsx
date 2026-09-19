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
    label: "Implied-move magnitude",
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
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
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
        .filter(
          (r) =>
            r.leader === "odds" &&
            r.catchup != null &&
            Number.isFinite(r.catchup),
        )
        .map((r) => Math.max(0, r.catchup!)),
    );
    const factors = FACTORS.map((f) => {
      const values = rows.map(
        (r) => scoreFactors({ ...r, scale: rowScale(r, WINDOW_MS) })[f.key],
      );
      return {
        ...f,
        avg: values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null,
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
          <Kpi
            label="Scored now"
            value={feed.isPending ? "—" : String(rows.length)}
          />
          <Kpi
            label="Candidate rate"
            tone="text-odds"
            value={
              feed.isPending || !rows.length
                ? "—"
                : `${Math.round((stats.actionable / rows.length) * 100)}%`
            }
          />
          <Kpi
            label="Median mark captured"
            value={
              stats.captured == null
                ? "—"
                : `${Math.round(stats.captured * 100)}%`
            }
          />
          <Kpi
            label="Model version"
            tone="text-mark"
            value={version.slice(0, 16)}
          />
        </dl>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[10px] border border-line bg-surface p-5">
            <h2 className="kicker">Score composition</h2>
            <p className="mt-2 text-[12px] leading-[1.6] text-subtle">
              Score = 100 × the product of six factors, each between 0 and 1.
              Because they multiply, one weak factor pulls the whole score down.
              Bars show each factor’s live average on the {window} window.
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
              Candidates require a score of at least 28, a clear side, less than
              85% catch-up, measured odds leadership and a gap above estimated
              costs. Missing evidence cannot qualify.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {stats.bands.map((b) => (
                <div key={b.label} className="flex items-center gap-2.5">
                  <span className="num w-[52px] text-[11px] text-dim">
                    {b.label}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded-[3px] bg-line">
                    <span
                      className={cn("block h-4", b.tone)}
                      style={{ width: `${(b.count / maxBand) * 100}%` }}
                    />
                  </div>
                  <span className="num w-[34px] text-right text-[11px]">
                    {b.count}
                  </span>
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
              maps to the price move that would explain it, given time to expiry
              and an assumed volatility (for a digital,{" "}
              <span className="num">ln S = ln K + σ√τ·Φ⁻¹(p)</span>). Odds that
              drift as expiry nears are not read as price moves. Markets priced
              below 5% or above 95%, or resolving within the window, are left
              out: there a one-tick wobble or time decay would read as a large
              move. Clear negative outcomes such as “will not reach” use the
              complement probability (1 − Yes). Compound conditions and
              unsupported negations are left out.
            </p>
            <p>
              <span className="text-text">Supported events only.</span> The
              selected question must name the underlying and express a supported
              price threshold with an expiry. News, mentions, macro outcomes and
              relative-performance questions are excluded. The parent event
              title cannot establish a link.
            </p>
            <p className="text-[12px] text-dim">
              Model v5 adds strict eligibility, measured timing and quote
              evidence. Saved alert settings remain intact; changing the model
              does not create an alert crossing. Historical v4 replay remains
              separate.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 border-t border-line pt-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <h2 className="text-[15px] font-medium">Known limitations</h2>
          <ul className="flex list-disc flex-col gap-2.5 pl-4 text-[13px] leading-[1.6] text-subtle marker:text-dim">
            <li>
              Volatility assumptions and the threshold pricing model can be
              wrong. A supported price relationship does not establish
              mispricing.
            </li>
            <li>
              Timing compares minute returns over up to 60 minutes at lags from
              −5 to +5 minutes. It needs 12 pairs, 80% coverage, correlation ≥
              0.4 and a 0.1 advantage over zero and opposite lags. The 1m and 5m
              windows cannot qualify. Correlation does not establish causality.
            </li>
            <li>
              Upstream feeds can be delayed or interrupted. Observations older
              than 90 seconds are dropped rather than scored, so coverage can
              thin out.
            </li>
            <li>
              The residual is gross. The separate $100 notional / 30-minute
              benchmark estimates spread, depth, taker fees and adverse funding.
              It is research evidence, not an executable order or profit
              forecast.
            </li>
            <li>
              Any calibration will be measured on a small, evolving sample and
              can shift as the model or coverage changes.
            </li>
          </ul>
        </section>
        <p className="mt-6 text-[12px] text-dim">
          New to the gap?{" "}
          <Link
            href="/about"
            className="lg-focus text-subtle underline underline-offset-2 hover:text-text"
          >
            Read the guide
          </Link>{" "}
          or{" "}
          <Link
            href="/?tour=1"
            className="lg-focus text-subtle underline underline-offset-2 hover:text-text"
          >
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
