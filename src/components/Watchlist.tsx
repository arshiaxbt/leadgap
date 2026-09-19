"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { DirectionChip } from "@/components/signal/DirectionChip";
import { RowTrace } from "@/components/signal/GapTrace";
import { useNow } from "@/components/signal/FeedStamp";
import { WorkspaceHeading } from "@/components/WorkspaceHeading";
import { fmtPct } from "@/lib/format";
import { signalHref } from "@/lib/links";
import { isActionable } from "@/lib/score";
import { perpName } from "@/lib/signal";
import type { GapRow, GapWindow } from "@/lib/types";
import { gapsQuery } from "@/lib/useGapsFeed";
import {
  useWatchStore,
  type AccountNotice,
  type SavedRule,
  type SavedSignal,
  type WatchStore,
} from "@/lib/watchlist";
import { cn } from "@/lib/utils";

function agoCopy(ts: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ts) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Watchlist() {
  const state = useWatchStore();
  const now = useNow(30_000);
  const windows = useMemo(
    () =>
      [
        ...new Set([
          ...state.items.map((i) => i.window),
          ...state.rules.map((r) => r.window),
        ]),
      ] as GapWindow[],
    [state.items, state.rules],
  );
  const feeds = useQueries({ queries: windows.map((w) => gapsQuery(w)) });
  const find = (window: GapWindow, eventId: string, symbol: string) =>
    feeds[windows.indexOf(window)]?.data?.gaps.find(
      (g) => g.eventId === eventId && g.symbol === symbol,
    );
  const loadingFor = (window: GapWindow) =>
    feeds[windows.indexOf(window)]?.isPending ?? false;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <WorkspaceHeading
        title="Watchlist"
        description={`Signals you’re tracking, and the alerts that fire when the gap moves. ${state.mode === "account" ? "Synced to your account." : "Saved in this browser."}`}
      />
      <div className="flex flex-col gap-7 px-4 pb-8 md:px-6">
        {state.error ? (
          <p role="alert" className="workspace-error mx-0">
            {state.error}
          </p>
        ) : null}
        {state.overflow ? (
          <p className="rounded-[10px] border border-line bg-surface px-[18px] py-3 text-[12px] text-subtle">
            {state.overflow} saved item{state.overflow === 1 ? "" : "s"} stayed
            in this browser because your account is at its limit (100 signals,
            20 alerts).
          </p>
        ) : null}
        {state.mode === "account" ? <Inbox store={state} now={now} /> : null}
        <section aria-labelledby="watching-heading">
          <h2 id="watching-heading" className="kicker mb-3">
            Watching · {state.items.length}
          </h2>
          {state.loading ? (
            <p className="text-[12px] text-dim">Loading your watchlist…</p>
          ) : state.items.length === 0 ? (
            <Empty
              title="Nothing saved yet."
              body="Open a signal and choose Watch to follow its gap here."
            />
          ) : (
            <ul className="overflow-hidden rounded-[10px] border border-line">
              {state.items.map((item) => (
                <WatchRow
                  key={item.id}
                  item={item}
                  row={find(item.window, item.eventId, item.symbol)}
                  loading={loadingFor(item.window)}
                  onRemove={() => void state.removeWatch(item.id)}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="rules-heading">
          <h2 id="rules-heading" className="kicker mb-3">
            Alert rules · {state.rules.length}
          </h2>
          {state.rules.length === 0 ? (
            <Empty
              title="No alerts yet."
              body="Open a signal and choose Alert me to get a notice when it crosses your score and gap thresholds."
            />
          ) : (
            <ul className="overflow-hidden rounded-[10px] border border-line">
              {state.rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  lastFired={state.lastFired[rule.id] ?? 0}
                  now={now}
                  live={find(rule.window, rule.eventId, rule.symbol)}
                  store={state}
                />
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-[1.6] text-dim">
            {state.mode === "account"
              ? "Alerts are checked every minute by the research service, even while Leadgap is closed."
              : "Alerts are checked on every refresh while Leadgap is open in this browser. Log in to have them checked while it’s closed."}{" "}
            Repeated triggers on the same rule have a 30-minute cooldown.
            The current model sizes implied moves from each perp’s volatility, so older
            rules on those markets may fire less often.
          </p>
        </section>
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong px-[18px] py-6">
      <p className="text-[14px]">{title}</p>
      <p className="mt-1 text-[12px] text-subtle">{body}</p>
      <Link
        href="/"
        className="lg-focus mt-3 inline-block text-[12px] text-odds hover:underline"
      >
        Browse signals →
      </Link>
    </div>
  );
}

function WatchRow({
  item,
  row,
  loading,
  onRemove,
}: {
  item: SavedSignal;
  row?: GapRow;
  loading: boolean;
  onRemove: () => void;
}) {
  const name = perpName(item.symbol);
  const actionable = row ? isActionable(row) : false;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-[18px] py-4 last:border-b-0">
      <span className="chip">{name}</span>
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={signalHref({ eventId: item.eventId, symbol: item.symbol, window: item.window })}
          className="lg-focus text-[14px] text-text hover:text-odds"
        >
          {item.label}
        </Link>
        <p className="mt-1 text-[11px] text-dim">
          Saved on {item.window} window · refreshed every 20s
        </p>
      </div>
      {row ? (
        <>
          <RowTrace row={row} width={120} height={32} pad={3} dots={false} zero={false} className="hidden sm:block" />
          <span
            className={cn(
              "num w-16 text-right text-[14px]",
              actionable ? "text-odds" : "text-subtle",
            )}
          >
            {fmtPct(row.gap)}
          </span>
          <DirectionChip bias={row.bias} score={row.score} />
        </>
      ) : (
        <span className="text-[12px] text-dim">
          {loading ? "Loading…" : `Not live on the ${item.window} window`}
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${item.label} from watchlist`}
        onClick={onRemove}
        className="lg-focus rounded-[5px] p-1 text-dim hover:text-text"
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}

function RuleRow({
  rule,
  lastFired,
  now,
  live,
  store,
}: {
  rule: SavedRule;
  lastFired: number;
  now: number;
  live?: GapRow;
  store: WatchStore;
}) {
  const name = perpName(rule.symbol);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-[18px] py-4 last:border-b-0">
      <span
        aria-hidden
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          rule.muted ? "bg-off" : "bg-odds",
        )}
      />
      <div className={cn("min-w-0 flex-1 basis-56 text-[13px]", rule.muted && "text-dim")}>
        <Link
          href={signalHref({ eventId: rule.eventId, symbol: rule.symbol, window: rule.window })}
          className="lg-focus hover:text-odds"
        >
          {name} · score ≥ <span className="num">{rule.minScore}</span> and gap ≥{" "}
          <span className="num">{(rule.minGap * 100).toFixed(1)}%</span>
        </Link>
        <p className="mt-1 truncate text-[11px] text-dim">
          {rule.window} window
          {rule.label ? ` · ${rule.label}` : ""}
          {live ? ` · now ${live.score} / ${fmtPct(live.gap)}` : ""}
        </p>
      </div>
      <span className="text-[11px] text-dim">
        {lastFired && now ? `Last fired ${agoCopy(lastFired, now)}` : "Never fired"}
      </span>
      <span className={cn("text-[12px]", rule.muted ? "text-dim" : "text-long")}>
        {rule.muted ? "Muted" : "Active"}
      </span>
      <button
        type="button"
        onClick={() => void store.setRuleMuted(rule.id, !rule.muted)}
        className="lg-focus text-[12px] text-subtle hover:text-text"
      >
        {rule.muted ? "Resume" : "Mute"}
      </button>
      <button
        type="button"
        aria-label={`Delete alert for ${name}`}
        onClick={() => void store.removeRule(rule.id)}
        className="lg-focus rounded-[5px] p-1 text-dim hover:text-text"
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}

function Inbox({ store, now }: { store: WatchStore; now: number }) {
  const unread = store.notices.filter((n) => !n.read).length;
  return (
    <section aria-labelledby="inbox-heading">
      <h2 id="inbox-heading" className="kicker mb-3">
        Alerts inbox · {unread} unread
      </h2>
      {store.notices.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-line-strong px-[18px] py-4 text-[12px] text-subtle">
          Fired alerts land here, newest first.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-line">
          {store.notices.slice(0, 20).map((notice) => (
            <NoticeRow key={notice.id} notice={notice} now={now} store={store} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NoticeRow({
  notice,
  now,
  store,
}: {
  notice: AccountNotice;
  now: number;
  store: WatchStore;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-[18px] py-3.5 last:border-b-0">
      <span
        aria-hidden
        className={cn("size-[7px] shrink-0 rounded-full", notice.read ? "bg-off" : "bg-odds")}
      />
      <div className="min-w-0 flex-1 basis-56">
        <Link
          href={signalHref({ eventId: notice.eventId, symbol: notice.symbol })}
          className={cn("lg-focus text-[13px] hover:text-odds", notice.read && "text-subtle")}
        >
          {notice.title}
        </Link>
        <p className="mt-1 text-[11px] text-dim">
          {perpName(notice.symbol)} · {now ? agoCopy(notice.createdAt, now) : ""}
        </p>
      </div>
      {!notice.read ? (
        <button
          type="button"
          onClick={() => void store.markRead(notice.id)}
          className="lg-focus text-[12px] text-subtle hover:text-text"
        >
          Mark read
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Delete alert notice: ${notice.title}`}
        onClick={() => void store.removeNotice(notice.id)}
        className="lg-focus rounded-[5px] p-1 text-dim hover:text-text"
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}
