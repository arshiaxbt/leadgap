"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAccessToken, usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AlertRule, WatchItem } from "@/lib/research";
import { usePrivyMount } from "@/lib/usePrivyMount";
import {
  AccountWatchContext,
  forgetMigrated,
  readWatchState,
  ruleId,
  signalKey,
  type AccountNotice,
  type SavedRule,
  type SavedSignal,
  type WatchStore,
} from "@/lib/watchlist";

const ENABLED = process.env.NEXT_PUBLIC_ENABLE_RESEARCH === "true";

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Log in to access saved research.");
  const response = await fetch(`/api/research/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error ?? "Saved research is unavailable right now.");
  return data;
}

const migrationFlag = (userId: string) => `leadgap:research-migrated:${userId}`;

function needsMigration(userId: string): boolean {
  try {
    if (window.localStorage.getItem(migrationFlag(userId)) === "done") return false;
  } catch {
    // Without storage we still attempt the move; it is idempotent.
  }
  const local = readWatchState();
  return local.items.length > 0 || local.rules.length > 0;
}

/** Account-backed watchlist and alerts when research is enabled and a user is signed in. */
export function ResearchProvider({ children }: { children: ReactNode }) {
  const mount = usePrivyMount();
  // Reads Privy, so it waits for the browser like the provider above it.
  if (!ENABLED || mount !== "ready") return children;
  return <ResearchSession>{children}</ResearchSession>;
}

function ResearchSession({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const userId = ready && authenticated ? user?.id : undefined;
  const client = useQueryClient();
  const previous = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Drop the previous account's data on logout or account switch.
    if (previous.current && previous.current !== userId)
      client.removeQueries({ queryKey: ["research"] });
    previous.current = userId;
  }, [client, userId]);

  if (!userId) return children;
  return (
    <AccountStore key={userId} userId={userId}>
      {children}
    </AccountStore>
  );
}

function AccountStore({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const client = useQueryClient();
  // Mounted only on the client, after Privy is ready, so storage is readable here.
  const [migrated, setMigrated] = useState(() => !needsMigration(userId));
  const [overflow, setOverflow] = useState(0);
  const watchlist = useQuery({
    queryKey: ["research", userId, "watchlist"],
    queryFn: () => request<{ items: SavedSignal[] }>("watchlist"),
    staleTime: 30_000,
    retry: 1,
  });
  const rules = useQuery({
    queryKey: ["research", userId, "rules"],
    queryFn: () => request<{ items: SavedRule[] }>("rules"),
    staleTime: 30_000,
    retry: 1,
  });
  const notices = useQuery({
    queryKey: ["research", userId, "notifications"],
    queryFn: () => request<{ items: AccountNotice[] }>("notifications"),
    refetchInterval: 60_000,
    // Keep polling in hidden tabs so fired alerts can raise a browser notification.
    refetchIntervalInBackground: true,
    staleTime: 20_000,
    retry: 1,
  });

  // Move anything saved in this browser before sign-in into the account, once.
  useEffect(() => {
    if (migrated) return;
    const local = readWatchState();
    let stop = false;
    void (async () => {
      try {
        const result = await request<
          Record<"watchlist" | "rules", { imported: string[]; existing: string[]; invalid: number; overflow: string[] }>
        >("import", {
          method: "POST",
          body: JSON.stringify({
            watchlist: local.items satisfies WatchItem[],
            rules: local.rules satisfies AlertRule[],
          }),
        });
        if (stop) return;
        forgetMigrated({
          watchlist: [...result.watchlist.imported, ...result.watchlist.existing],
          rules: [...result.rules.imported, ...result.rules.existing],
        });
        const moved = result.watchlist.imported.length + result.rules.imported.length;
        const left = result.watchlist.overflow.length + result.rules.overflow.length;
        setOverflow(left);
        if (!left) {
          try {
            window.localStorage.setItem(migrationFlag(userId), "done");
          } catch {
            // Nothing else to do.
          }
        }
        if (moved)
          toast("Watchlist synced to your account", {
            description: `${moved} saved item${moved === 1 ? "" : "s"} moved from this browser.${left ? ` ${left} stayed here: account limit reached.` : ""}`,
          });
        await client.invalidateQueries({ queryKey: ["research", userId] });
      } catch {
        // Keep local copies; try again next session.
      } finally {
        if (!stop) setMigrated(true);
      }
    })();
    return () => {
      stop = true;
    };
  }, [client, migrated, userId]);

  const store = useMemo<WatchStore>(() => {
    const items = watchlist.data?.items ?? [];
    const ruleItems = rules.data?.items ?? [];
    const noticeItems = notices.data?.items ?? [];
    const lastFired: Record<string, number> = {};
    for (const n of noticeItems)
      lastFired[n.ruleId] = Math.max(lastFired[n.ruleId] ?? 0, n.createdAt);
    const refresh = (kind: string) =>
      client.invalidateQueries({ queryKey: ["research", userId, kind] });
    const put = async (kind: "watchlist" | "rules", body: unknown) => {
      await request(kind, { method: "PUT", body: JSON.stringify(body) });
      await refresh(kind);
    };
    const del = async (kind: string, id: string) => {
      await request(`${kind}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh(kind);
    };
    const findRule = (row: { eventId: string; symbol: string }) => {
      const key = signalKey(row);
      return ruleItems.find((r) => signalKey(r) === key);
    };
    return {
      mode: "account",
      loading: watchlist.isPending || rules.isPending || !migrated,
      error:
        watchlist.error?.message ?? rules.error?.message ?? null,
      items,
      rules: ruleItems,
      lastFired,
      notices: noticeItems,
      noticesAt: notices.dataUpdatedAt,
      overflow,
      isWatched: (row) => items.some((item) => item.id === signalKey(row)),
      ruleFor: findRule,
      async toggleWatch(row, window) {
        const id = signalKey(row);
        if (items.some((item) => item.id === id)) {
          await del("watchlist", id);
          return false;
        }
        await put("watchlist", {
          id,
          symbol: row.symbol,
          eventId: row.eventId,
          label: row.title.slice(0, 240),
          window,
          filter: "all",
          savedAt: Date.now(),
        } satisfies SavedSignal);
        return true;
      },
      removeWatch: (id) => del("watchlist", id),
      async saveRule(rule) {
        const id = ruleId(rule);
        const existing = ruleItems.find((r) => r.id === id);
        await put("rules", {
          ...rule,
          id,
          muted: false,
          createdAt: existing?.createdAt ?? Date.now(),
        } satisfies SavedRule);
      },
      async setRuleMuted(id, muted) {
        const rule = ruleItems.find((r) => r.id === id);
        if (rule) await put("rules", { ...rule, muted });
      },
      removeRule: (id) => del("rules", id),
      async markRead(id) {
        await request(`notifications?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: "{}",
        });
        await refresh("notifications");
      },
      removeNotice: (id) => del("notifications", id),
    };
  }, [client, migrated, notices.data, notices.dataUpdatedAt, overflow, rules.data, rules.error, rules.isPending, userId, watchlist.data, watchlist.error, watchlist.isPending]);

  return (
    <AccountWatchContext.Provider value={store}>
      {children}
    </AccountWatchContext.Provider>
  );
}
