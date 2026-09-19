"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import { FeedStamp } from "@/components/signal/FeedStamp";
import { GapHistory } from "@/components/signal/GapHistory";
import { endpointTrace } from "@/components/signal/GapTrace";
import { ResidualChart, Sparkline } from "@/components/signal/ResidualChart";
import { WatchControls } from "@/components/signal/WatchControls";
import { PolymarketEventLink } from "@/components/ui";
import { GAP_WINDOWS, WINDOW_MS } from "@/lib/divergence";
import {
  fmtCompact,
  fmtCountdown,
  fmtFunding,
  fmtOdds,
  fmtOddsDelta,
  fmtPct,
  fmtPx,
  signedClass,
} from "@/lib/format";
import { deskHref, eventHref } from "@/lib/links";
import { isActionable, scoreBreakdown } from "@/lib/score";
import {
  betaExplanation,
  eventImpact,
  impliedMove,
  mappedBeta,
  modelForRow,
  rowScale,
} from "@/lib/sensitivity";
import {
  leaderLabel,
  mappingExplanation,
  mappingLabel,
  perpName,
  scoreStanding,
} from "@/lib/signal";
import { trackEvent } from "@/lib/track";
import type { GapRow, GapWindow, ResolvedEvent } from "@/lib/types";
import { useAsset } from "@/lib/useAsset";
import { gapsQuery } from "@/lib/useGapsFeed";
import { useHydrated } from "@/lib/useHydrated";
import { cn } from "@/lib/utils";

const HERO_WINDOWS: GapWindow[] = ["15m", "1h", "4h", "1d"];

const WINDOW_PHRASE: Record<GapWindow, string> = {
  "1m": "the last minute",
  "5m": "the last 5 minutes",
  "15m": "the last 15 minutes",
  "30m": "the last 30 minutes",
  "1h": "the last hour",
  "4h": "the last 4 hours",
  "12h": "the last 12 hours",
  "1d": "the last day",
};

export function SignalDetail({
  eventId,
  symbol,
  initialWindow,
}: {
  eventId: string;
  symbol: string;
  initialWindow: GapWindow;
}) {
  const [window, setWindowState] = useState<GapWindow>(initialWindow);
  const asset = useAsset(symbol);
  const feed = useQuery(gapsQuery(window));
  const data = asset.data;

  function setWindow(next: GapWindow) {
    setWindowState(next);
    const url = new URL(globalThis.location.href);
    url.searchParams.set("window", next);
    globalThis.history.replaceState(null, "", url);
  }

  const event = data?.events.find((e) => e.id === eventId);
  const row = data?.windows?.[window]?.find((r) => r.eventId === eventId);
  const hydrated = useHydrated();
  const scores = useMemo(
    () => (hydrated ? (feed.data?.gaps ?? []) : []).map((g) => g.score),
    [feed.data, hydrated],
  );
  const name = perpName(symbol);

  if (asset.isPending) return <DetailSkeleton />;
  if (!data || !event) {
    return (
      <div className="m-auto max-w-md px-6 py-16 text-center">
        <p className="kicker">Signal</p>
        <h1 className="serif mt-3 text-[30px]">
          {asset.error ? "This signal couldn’t load." : "This signal isn’t live."}
        </h1>
        <p className="mt-3 text-[13px] leading-[1.65] text-subtle">
          {asset.error
            ? "The market feed did not respond. Retry, or return to Signals."
            : `The event is no longer mapped to ${name}, or it hasn’t been collected yet.`}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {asset.error ? (
            <button
              type="button"
              onClick={() => void asset.refetch()}
              className="lg-focus h-9 rounded-[7px] bg-odds px-4 text-[13px] font-semibold text-on-odds"
            >
              Retry
            </button>
          ) : null}
          <Link
            href="/"
            className="lg-focus inline-flex h-9 items-center rounded-[7px] border border-line-strong px-4 text-[13px] text-subtle hover:text-text"
          >
            Back to Signals
          </Link>
        </div>
      </div>
    );
  }

  const link = event.perps.find((p) => p.symbol === symbol);
  const odds = data.oddsHistory[eventId] ?? [];
  const oddsInWindow = odds.filter((p) => p.t >= data.asOf - WINDOW_MS[window]);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 pt-[22px] md:px-6">
        <nav aria-label="Breadcrumb" className="num flex items-center gap-2.5 text-[11px] text-dim">
          <Link href="/" className="lg-focus text-subtle hover:text-text">
            SIGNALS
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={`/markets/${encodeURIComponent(symbol)}`}
            className="lg-focus text-mark hover:text-text"
          >
            {symbol}
          </Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{window.toUpperCase()} WINDOW</span>
        </nav>
        <FeedStamp
          className="ml-auto"
          asOf={data.asOf}
          loading={asset.isFetching && !data}
          error={asset.error?.message ?? null}
        />
      </div>

      <div className="grid gap-7 px-4 pt-4 pb-8 md:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:[grid-template-areas:'main_rail'_'more_rail'] [grid-template-areas:'main'_'rail'_'more']">
        <div className="min-w-0 [grid-area:main]">
          <p className="flex flex-wrap items-center gap-2.5 text-[12px] text-subtle">
            <span className="chip">{name}</span>
            {row || link ? mappingLabel(row ?? { mappingKind: link!.mappingKind, mappingReason: link!.mappingReason }) : "Mapped event"}
            {link ? ` · mapping confidence ${Math.round(link.confidence * 100)}%` : ""}
          </p>
          <h1 className="serif mt-3 max-w-[20ch] text-[32px] leading-[1.1] md:text-[42px]">
            {event.question || event.title}
          </h1>

          <Hero
            row={row}
            event={event}
            window={window}
            onWindow={setWindow}
            asOf={data.asOf}
            yesSeries={oddsInWindow.map((p) => p.v)}
          />

          {row ? (
            <Narrative row={row} window={window} />
          ) : (
            <p className="mt-5 max-w-[70ch] text-[15px] leading-[1.6] text-subtle">
              No comparable observation for {name} on the {window} window yet —
              either the event or the perp lacks fresh data at the window’s
              start. Try another window.
            </p>
          )}
        </div>

        <aside
          aria-label="The decision"
          className="flex flex-col gap-px self-start overflow-hidden rounded-[10px] border border-line bg-line [grid-area:rail] lg:sticky lg:top-4"
        >
          <Decision
            row={row}
            symbol={symbol}
            window={window}
            scores={scores}
            decimals={data.instrument.priceDecimals}
            mark={data.ticker?.markPrice}
            funding={data.ticker?.fundingRate}
            nextFunding={data.ticker?.nextFunding}
            event={event}
          />
        </aside>

        <div className="min-w-0 [grid-area:more]">
          <div className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-3">
            <section className="bg-surface p-[18px]">
              <h2 className="kicker">Why these are linked</h2>
              <p className="mt-3 text-[13px] leading-[1.65] text-subtle">
                {row || link
                  ? mappingExplanation(
                      row ?? {
                        mappingKind: link!.mappingKind,
                        mappingReason: link!.mappingReason,
                        symbol,
                        signedBeta: link!.signedBeta,
                      },
                    )
                  : "No mapping on record for this perp."}
              </p>
              {row && betaExplanation(row, event.endsAt, data.asOf) ? (
                <p className="mt-2 text-[12px] leading-[1.6] text-dim">
                  {betaExplanation(row, event.endsAt, data.asOf)}
                </p>
              ) : null}
              <dl className="mt-3.5">
                <Line
                  label={row?.betaSource === "threshold" ? "Sensitivity (now)" : "Sensitivity"}
                  value={(() => {
                    const beta = row?.signedBeta ?? (link ? mappedBeta(link) : undefined);
                    return beta == null ? "—" : `${beta >= 0 ? "+" : ""}${beta.toFixed(2)}`;
                  })()}
                />
                <Line label="Mapping confidence" value={link ? `${Math.round(link.confidence * 100)}%` : "—"} />
                <Line label="Event volume" value={`$${fmtCompact(event.volume)}`} />
              </dl>
            </section>
            <section className="bg-surface p-[18px]">
              <h2 className="kicker">Where the score comes from</h2>
              {row ? <Breakdown row={row} /> : (
                <p className="mt-3 text-[13px] text-subtle">Scored once the window has comparable data.</p>
              )}
              <p className="mt-3.5 text-[11px] leading-[1.6] text-dim">
                Additive split of the published score. Not a probability of
                profit.{" "}
                <Link href="/model" className="lg-focus text-subtle underline underline-offset-2 hover:text-text">
                  How the model works
                </Link>
              </p>
            </section>
            <GapHistory
              eventId={eventId}
              symbol={symbol}
              signedBeta={row?.signedBeta ?? (link ? mappedBeta(link) : eventImpact(symbol))}
              mappedBeta={link?.signedBeta ?? 1}
              implied={(() => {
                if (!row) return undefined;
                const model = modelForRow(row, event);
                return (pThen: number, pNow: number, tThen: number, tNow: number) =>
                  impliedMove(model, pThen, pNow, tThen, tNow);
              })()}
              window={window}
              windowMs={WINDOW_MS[window]}
              odds={odds}
              marks={data.markHistory}
              asOf={data.asOf}
              modelVersion={data.modelVersion}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({
  row,
  event,
  window,
  onWindow,
  asOf,
  yesSeries,
}: {
  row?: GapRow;
  event: ResolvedEvent;
  window: GapWindow;
  onWindow: (w: GapWindow) => void;
  asOf: number;
  yesSeries: number[];
}) {
  const expected = row ? (row.expected ?? row.oddsMove * row.signedBeta) : 0;
  const actual = row ? (row.actual ?? row.perpMove) : 0;
  const actionable = row ? isActionable(row) : false;
  return (
    <figure className="mt-[26px] overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-[18px] py-[13px]">
        <span className="kicker">The residual</span>
        {row ? (
          <>
            <Key swatch="bg-odds" label="Implied" value={fmtPct(expected)} tone="text-odds" />
            <Key swatch="bg-mark" label="Observed" value={fmtPct(actual)} tone="text-mark" />
            <Key swatch="h-2.5 bg-[var(--band)]" label="Gap" value={fmtPct(row.gap)} tone={actionable ? "text-odds" : "text-subtle"} />
          </>
        ) : null}
        <div className="flex flex-wrap gap-0.5 md:ml-auto" role="group" aria-label="Comparison window">
          {GAP_WINDOWS.filter((id) => HERO_WINDOWS.includes(id) || id === window).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === window}
              onClick={() => onWindow(id)}
              className={cn(
                "lg-focus num rounded-[4px] px-2 py-1 text-[11px]",
                id === window ? "bg-active text-text" : "text-subtle hover:text-text",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      {row ? (
        <ResidualChart
          trace={row.trace ?? endpointTrace(expected, actual)}
          estimated={!row.trace}
          windowMs={WINDOW_MS[window]}
          end={asOf}
          label={`Over ${WINDOW_PHRASE[window]}, the odds implied ${fmtPct(expected)} and the perp moved ${fmtPct(actual)}: a gap of ${fmtPct(row.gap)}.`}
        />
      ) : (
        <div className="flex h-[300px] items-center justify-center px-6 text-center text-[13px] text-subtle">
          No comparable observation on the {window} window.
        </div>
      )}
      <figcaption className="flex items-center gap-3.5 border-t border-line bg-side px-[18px] py-3">
        <span className="kicker shrink-0">Yes probability</span>
        <Sparkline
          values={yesSeries}
          width={700}
          height={34}
          fill="rgba(203,241,82,0.09)"
          className="h-[34px] min-w-0 flex-1"
        />
        {yesSeries.length < 2 ? <span className="flex-1" /> : null}
        <span className="num text-[12px] text-odds">{fmtOdds(event.yesPrice)}</span>
        {row ? (
          <span className={cn("num text-[11px]", signedClass(row.oddsMove))}>
            {fmtOddsDelta(row.oddsMove)}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

function Key({
  swatch,
  label,
  value,
  tone,
}: {
  swatch: string;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <span className="flex items-center gap-[7px] text-[12px] text-subtle">
      <span className={cn("h-0.5 w-3.5", swatch)} aria-hidden />
      {label} <span className={cn("num", tone)}>{value}</span>
    </span>
  );
}

function Narrative({ row, window }: { row: GapRow; window: GapWindow }) {
  const name = perpName(row.symbol);
  const expected = row.expected ?? row.oddsMove * row.signedBeta;
  const actual = row.actual ?? row.perpMove;
  const lead =
    row.leader === "perp"
      ? `${name} moved more than the odds on this window — the perp led, so this is not a Leadgap setup.`
      : row.leader === "flat"
        ? `Odds and ${name} are moving in line. The remaining gap is too small to act on.`
        : row.bias === "none"
          ? `Odds moved first, but the residual does not clear the trade threshold yet.`
          : `The model indicates a ${row.gap > 0 ? "positive" : "negative"} ${name} residual.`;
  const caught =
    row.catchup != null && Number.isFinite(row.catchup)
      ? Math.round(Math.max(0, row.catchup) * 100)
      : null;
  return (
    <p className="mt-5 max-w-[70ch] text-[15px] leading-[1.6] text-text">
      {lead} Yes repriced{" "}
      <span className="num text-odds">{fmtOddsDelta(row.oddsMove)}</span> over{" "}
      {WINDOW_PHRASE[window]};{" "}
      {row.betaSource === "threshold" ? (
        <>given the strike and time to expiry, that implies a </>
      ) : (
        <>
          if a Yes outcome is worth about one day’s typical{" "}
          {perpName(row.symbol)} move, that implies a{" "}
        </>
      )}
      <span className="num text-odds">{fmtPct(expected)}</span> perp move. The
      mark moved <span className="num text-mark">{fmtPct(actual)}</span>
      {caught != null ? (
        <>
          {" "}
          — <span className="num">{caught}%</span> of it.
        </>
      ) : (
        "."
      )}
    </p>
  );
}

function Breakdown({ row }: { row: GapRow }) {
  const parts = scoreBreakdown({
    ...row,
    score: row.score,
    scale: rowScale(row, WINDOW_MS),
  });
  const max = Math.max(1, ...parts.map((p) => p.points));
  return (
    <ul className="mt-3 flex flex-col gap-[11px]">
      {parts.map((part) => (
        <li key={part.label}>
          <div className="flex justify-between text-[12px]">
            <span className="text-subtle">{part.label}</span>
            <span className="num">{part.points}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-line">
            <span
              className="block h-1 bg-odds"
              style={{ width: `${(part.points / max) * 96}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-[9px] text-[12px]">
      <dt className="text-subtle">{label}</dt>
      <dd className="num text-right">{value}</dd>
    </div>
  );
}

function Decision({
  row,
  symbol,
  window,
  scores,
  decimals,
  mark,
  funding,
  nextFunding,
  event,
}: {
  row?: GapRow;
  symbol: string;
  window: GapWindow;
  scores: number[];
  decimals: number;
  mark?: number;
  funding?: number;
  nextFunding?: number;
  event: ResolvedEvent;
}) {
  const name = perpName(symbol);
  const actionable = row ? isActionable(row) : false;
  const caught =
    row?.catchup != null && Number.isFinite(row.catchup)
      ? `${Math.round(Math.max(0, row.catchup) * 100)}%`
      : "—";
  const desk = deskHref({ eventId: event.id, symbol, window });
  return (
    <>
      <div className="bg-surface p-[18px]">
        <p className="kicker">The decision</p>
        <div className="mt-3.5 flex items-center gap-2.5">
          <DirectionChip bias={row?.bias ?? "none"} symbol={symbol} size="lg" />
          {row ? (
            <span className="text-[12px] text-subtle">
              {leaderLabel(row.leader).toLowerCase().replace(" ", "-")}
            </span>
          ) : null}
        </div>
        <p className="mt-[18px] flex items-end gap-1.5">
          <span
            className={cn(
              "num text-[44px] leading-[0.9] font-medium tracking-[-0.03em]",
              actionable ? "text-odds" : "text-dim",
            )}
          >
            {row ? row.score : "—"}
          </span>
          <span className="num pb-1 text-[14px] text-dim">/100</span>
        </p>
        <p className="mt-2 text-[12px] text-subtle">
          {row ? scoreStanding(row.score, scores) : "Not scored on this window"}
        </p>
      </div>
      <div className="bg-surface px-[18px] py-1.5">
        <dl>
          <Stat label="Remaining gap" value={row ? fmtPct(row.gap) : "—"} tone={actionable ? "text-odds" : undefined} />
          <Stat label="Mark captured" value={caught} />
          <Stat label={`${name} mark`} value={mark != null ? fmtPx(mark, decimals) : "—"} tone="text-mark" />
          <Stat
            last
            label="Funding · next"
            value={funding != null ? fmtFunding(funding) : "—"}
            tone={funding != null ? signedClass(funding) : undefined}
            after={nextFunding ? fmtCountdown(nextFunding) : undefined}
          />
        </dl>
      </div>
      <div className="flex flex-col gap-2.5 bg-surface p-[18px]">
        <Link
          href={desk}
          onClick={() =>
            trackEvent("view_gap", {
              symbol,
              eventId: event.id,
              score: row?.score ?? 0,
            })
          }
          className="lg-focus flex h-11 items-center justify-center gap-2 rounded-[7px] bg-odds text-[14px] font-semibold text-on-odds"
        >
          Open {name} desk <ArrowRight size={16} aria-hidden />
        </Link>
        <WatchControls
          row={{
            eventId: event.id,
            symbol,
            title: event.title,
            score: row?.score ?? 0,
            gap: row?.gap ?? 0,
          }}
          window={window}
        />
        <div className="mt-1 flex items-center justify-center gap-4 text-[12px] text-dim">
          <Link href={eventHref(event.id)} className="lg-focus hover:text-text">
            Event view
          </Link>
          <PolymarketEventLink
            slug={event.slug}
            className="lg-focus inline-flex items-center gap-1.5 hover:text-text"
          >
            View event on Polymarket <ArrowUpRight size={13} aria-hidden />
          </PolymarketEventLink>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  after,
  last = false,
}: {
  label: string;
  value: string;
  tone?: string;
  after?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-[11px]",
        !last && "border-b border-line",
      )}
    >
      <dt className="text-[13px] text-subtle">{label}</dt>
      <dd className={cn("num text-[16px]", tone)}>
        {value}
        {after ? <span className="ml-1.5 text-dim">{after}</span> : null}
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading signal" className="px-6 pt-6">
      <div className="h-3 w-56 rounded-[3px] bg-raise" />
      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="h-3 w-40 rounded-[3px] bg-raise" />
          <div className="mt-4 h-10 w-3/4 rounded-[4px] bg-raise" />
          <div className="mt-7 h-[380px] rounded-[10px] bg-surface" />
        </div>
        <div className="h-[420px] rounded-[10px] bg-surface" />
      </div>
    </div>
  );
}
