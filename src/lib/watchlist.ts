"use client";

import { useSyncExternalStore } from "react";
import type { AlertRule, AlertState, WatchItem } from "./research";
import type { GapRow, GapWindow } from "./types";

/**
 * Saved signals and alert rules, kept in this browser. Nothing here is sent to
 * a server; alerts are evaluated while Leadgap is open (see AlertWatcher).
 */
export type SavedSignal = WatchItem & { savedAt: number };
export type SavedRule = AlertRule & { createdAt: number; label?: string };
export type WatchState = {
  items: SavedSignal[];
  rules: SavedRule[];
  alerts: Record<string, AlertState>;
};

const KEY = "leadgap:watchlist:v1";
const EMPTY: WatchState = { items: [], rules: [], alerts: {} };
const listeners = new Set<() => void>();
let cache: { raw: string | null; state: WatchState } | null = null;

function parse(raw: string | null): WatchState {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<WatchState>;
    return {
      items: Array.isArray(value.items) ? value.items : [],
      rules: Array.isArray(value.rules) ? value.rules : [],
      alerts:
        value.alerts && typeof value.alerts === "object" ? value.alerts : {},
    };
  } catch {
    return EMPTY;
  }
}

function read(): WatchState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage can be blocked; the watchlist then lives for this page only.
    return cache?.state ?? EMPTY;
  }
  if (cache && cache.raw === raw) return cache.state;
  cache = { raw, state: parse(raw) };
  return cache.state;
}

function write(next: WatchState) {
  const raw = JSON.stringify(next);
  cache = { raw, state: next };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Keep the in-memory copy.
  }
  for (const fn of listeners) fn();
}

function update(fn: (state: WatchState) => WatchState) {
  write(fn(read()));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWatchState(): WatchState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function signalKey(row: Pick<GapRow, "eventId" | "symbol">): string {
  return `${row.eventId}-${row.symbol}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function isWatched(
  state: WatchState,
  row: Pick<GapRow, "eventId" | "symbol">,
): boolean {
  const id = signalKey(row);
  return state.items.some((item) => item.id === id);
}

export function toggleWatch(
  row: Pick<GapRow, "eventId" | "symbol" | "title">,
  window: GapWindow,
): boolean {
  const id = signalKey(row);
  let watching = false;
  update((state) => {
    if (state.items.some((item) => item.id === id)) {
      return { ...state, items: state.items.filter((item) => item.id !== id) };
    }
    watching = true;
    return {
      ...state,
      items: [
        {
          id,
          symbol: row.symbol,
          eventId: row.eventId,
          label: row.title,
          window,
          filter: "all",
          savedAt: Date.now(),
        },
        ...state.items,
      ],
    };
  });
  return watching;
}

export function removeWatch(id: string) {
  update((state) => ({
    ...state,
    items: state.items.filter((item) => item.id !== id),
  }));
}

export function saveRule(
  rule: Omit<SavedRule, "id" | "createdAt" | "muted">,
): SavedRule {
  const id = `${signalKey(rule)}-${rule.window}`.slice(0, 64);
  const next: SavedRule = { ...rule, id, muted: false, createdAt: Date.now() };
  update((state) => ({
    ...state,
    rules: [next, ...state.rules.filter((r) => r.id !== id)],
    // A replaced rule starts unarmed so it can fire on its next crossing.
    alerts: Object.fromEntries(
      Object.entries(state.alerts).filter(([key]) => key !== id),
    ),
  }));
  return next;
}

export function setRuleMuted(id: string, muted: boolean) {
  update((state) => ({
    ...state,
    rules: state.rules.map((r) => (r.id === id ? { ...r, muted } : r)),
  }));
}

export function removeRule(id: string) {
  update((state) => ({
    ...state,
    rules: state.rules.filter((r) => r.id !== id),
    alerts: Object.fromEntries(
      Object.entries(state.alerts).filter(([key]) => key !== id),
    ),
  }));
}

export function recordAlerts(next: Record<string, AlertState>) {
  update((state) => ({ ...state, alerts: { ...state.alerts, ...next } }));
}

export function ruleFor(
  state: WatchState,
  row: Pick<GapRow, "eventId" | "symbol">,
): SavedRule | undefined {
  const key = signalKey(row);
  return state.rules.find((r) => signalKey(r) === key);
}
