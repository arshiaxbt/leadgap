"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { SCORE_MODEL_VERSION } from "./score";
import type { AlertRule, AlertState, WatchItem } from "./research";
import type { GapRow, GapWindow } from "./types";

/**
 * Saved signals and alert rules, kept in this browser. Nothing here is sent to
 * a server; alerts are evaluated while Leadgap is open (see AlertWatcher).
 */
export type SavedSignal = WatchItem & { savedAt: number };
export type SavedRule = AlertRule & { createdAt: number; label?: string; scoreVersion?: string };
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
  const id = ruleId(rule);
  const next: SavedRule = { ...rule, id, muted: false, createdAt: Date.now(), scoreVersion: SCORE_MODEL_VERSION };
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

/** Remove local copies that now live in the account; keep anything the account refused. */
export function forgetMigrated(ids: { watchlist: string[]; rules: string[] }) {
  const items = new Set(ids.watchlist);
  const rules = new Set(ids.rules);
  update((state) => ({
    items: state.items.filter((item) => !items.has(item.id)),
    rules: state.rules.filter((rule) => !rules.has(rule.id)),
    alerts: Object.fromEntries(
      Object.entries(state.alerts).filter(([key]) => !rules.has(key)),
    ),
  }));
}

export function readWatchState(): WatchState {
  return read();
}

/** A notification written by the research service when a rule fires. */
export type AccountNotice = {
  id: string;
  ruleId: string;
  title: string;
  symbol: string;
  eventId: string;
  createdAt: number;
  read: boolean;
};

/** One interface for the browser-only store and the signed-in account store. */
export type WatchStore = {
  mode: "local" | "account";
  loading: boolean;
  error: string | null;
  items: SavedSignal[];
  rules: SavedRule[];
  /** Local mode: per-rule crossing state. Account mode: derived from notices. */
  lastFired: Record<string, number>;
  notices: AccountNotice[];
  /** When notices last loaded; 0 until the first load (and always in local mode). */
  noticesAt: number;
  /** Local items the account could not take (limit reached). */
  overflow: number;
  isWatched(row: Pick<GapRow, "eventId" | "symbol">): boolean;
  ruleFor(row: Pick<GapRow, "eventId" | "symbol">): SavedRule | undefined;
  toggleWatch(
    row: Pick<GapRow, "eventId" | "symbol" | "title">,
    window: GapWindow,
  ): Promise<boolean>;
  removeWatch(id: string): Promise<void>;
  saveRule(rule: Omit<SavedRule, "id" | "createdAt" | "muted">): Promise<void>;
  setRuleMuted(id: string, muted: boolean): Promise<void>;
  removeRule(id: string): Promise<void>;
  markRead(id: string): Promise<void>;
  removeNotice(id: string): Promise<void>;
};

export const AccountWatchContext = createContext<WatchStore | null>(null);

function localStore(state: WatchState): WatchStore {
  return {
    mode: "local",
    loading: false,
    error: null,
    items: state.items,
    rules: state.rules,
    lastFired: Object.fromEntries(
      Object.entries(state.alerts).map(([id, s]) => [id, s.lastFired]),
    ),
    notices: [],
    noticesAt: 0,
    overflow: 0,
    isWatched: (row) => isWatched(state, row),
    ruleFor: (row) => ruleFor(state, row),
    toggleWatch: async (row, window) => toggleWatch(row, window),
    removeWatch: async (id) => removeWatch(id),
    saveRule: async (rule) => void saveRule(rule),
    setRuleMuted: async (id, muted) => setRuleMuted(id, muted),
    removeRule: async (id) => removeRule(id),
    markRead: async () => {},
    removeNotice: async () => {},
  };
}

/** The active store: the signed-in account when research is on, else this browser. */
export function useWatchStore(): WatchStore {
  const account = useContext(AccountWatchContext);
  const state = useWatchState();
  const local = useMemo(() => localStore(state), [state]);
  return account ?? local;
}

export function ruleId(rule: Pick<SavedRule, "eventId" | "symbol" | "window">): string {
  return `${signalKey(rule)}-${rule.window}`.slice(0, 64);
}
