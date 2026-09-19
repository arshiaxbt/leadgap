"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const STALE_AFTER_MS = 90_000;

export type FeedState = "wait" | "fresh" | "stale" | "error";

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Ticks once a second so ages and freshness stay honest between refetches. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function feedState(args: {
  asOf: number;
  loading: boolean;
  error: string | null;
  now: number;
}): FeedState {
  if (args.error) return args.asOf ? "error" : args.loading ? "wait" : "error";
  if (!args.asOf) return "wait";
  if (args.now && args.now - args.asOf > STALE_AFTER_MS) return "stale";
  return "fresh";
}

/** Freshness stamp: a dot plus the time of the last good observation. */
export function FeedStamp({
  asOf,
  loading,
  error,
  retry,
  className,
}: {
  asOf: number;
  loading: boolean;
  error: string | null;
  retry?: () => void;
  className?: string;
}) {
  const now = useNow();
  // Until mounted there is no clock; render the same state as the server.
  const state = now ? feedState({ asOf, loading, error, now }) : "wait";
  const label =
    state === "wait"
      ? "CONNECTING…"
      : state === "fresh"
        ? `FRESH · ${clockTime(asOf)}`
        : state === "stale"
          ? `STALE · LAST UPDATE ${clockTime(asOf)}`
          : asOf
            ? `INTERRUPTED · LAST UPDATE ${clockTime(asOf)}`
            : "INTERRUPTED";
  return (
    <div className={cn("flex items-center gap-[18px]", className)}>
      <span
        role="status"
        className={cn(
          "feed-status",
          (state === "stale" || state === "error") && "text-warn",
        )}
      >
        <span className="status-dot" data-state={state} aria-hidden />
        <span>{label}</span>
      </span>
      {retry ? (
        <>
          <span className="h-3.5 w-px bg-line-strong" aria-hidden />
          <button
            type="button"
            onClick={retry}
            aria-label="Refresh data"
            className="lg-focus num flex items-center gap-1.5 text-[11px] text-subtle transition-colors hover:text-text"
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3v5h-5" />
            </svg>
            REFRESH
          </button>
        </>
      ) : null}
    </div>
  );
}

/** "Updated 8 minutes ago" style age for banners. */
export function ageCopy(asOf: number, now: number): string {
  const mins = Math.max(0, Math.round((now - asOf) / 60_000));
  if (mins < 1) return "less than a minute ago";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
