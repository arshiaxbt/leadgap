"use client";
import { useState } from "react";
import { usePrivy, getAccessToken } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { GapRow } from "@/lib/types";
import type { WatchItem, AlertRule, Notice } from "@/lib/research";
async function request<T>(
  collection: string,
  method = "GET",
  body?: unknown,
  id?: string,
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Log in to access saved research.");
  const response = await fetch(
    `/api/research/${collection}${id ? `?id=${encodeURIComponent(id)}` : ""}`,
    {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not update saved research.");
  return data;
}
export function ResearchControls({ row }: { row?: GapRow }) {
  const mount = usePrivyMount();
  if (process.env.NEXT_PUBLIC_ENABLE_RESEARCH !== "true") return null;
  return mount === "ready" ? (
    <ResearchSession row={row} />
  ) : (
    <span className="text-xs text-[var(--muted)]">
      Sign in to save research
    </span>
  );
}
function ResearchSession({ row }: { row?: GapRow }) {
  const { user, authenticated, login } = usePrivy();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("watchlist"),
    [message, setMessage] = useState("");
  const [score, setScore] = useState("60"),
    [gap, setGap] = useState("1"),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["research", user?.id, tab],
    queryFn: () => request<{ items: (WatchItem | AlertRule | Notice)[] }>(tab),
    enabled: open && authenticated,
    refetchInterval: open ? 30_000 : false,
    retry: 1,
  });
  const inbox = useQuery({
    queryKey: ["research", user?.id, "notifications"],
    queryFn: () => request<{ items: Notice[] }>("notifications"),
    enabled: authenticated && !row,
    refetchInterval: 60_000,
    retry: 1,
  });
  const unread = inbox.data?.items.filter((n) => !n.read).length ?? 0;
  async function action(
    collection: string,
    method: string,
    body?: unknown,
    id?: string,
  ) {
    setBusy(true);
    setMessage("");
    try {
      await request(collection, method, body, id);
      await client.invalidateQueries({ queryKey: ["research", user?.id] });
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const key = row ? `${row.eventId}-${row.symbol}-${row.window}` : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        aria-label={
          row ? "Save signal or create alert" : "Watchlist and notifications"
        }
        className="lg-focus inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--line)] px-2.5 text-xs"
        onClick={() => {
          if (!authenticated) {
            login();
            return;
          }
          setOpen(true);
        }}
      >
        {row ? <Bookmark size={15} /> : <Bell size={16} />}
        <span className={row ? "" : "hidden lg:inline"}>
          {row ? "Save / alert" : "Research"}
        </span>
        {unread > 0 ? (
          <span className="num text-[var(--odds)]">{unread}</span>
        ) : null}
      </button>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>Saved research</DialogTitle>
        <DialogDescription>
          Your watchlist, alert rules and notifications.
        </DialogDescription>
        {row ? (
          <div className="border-y border-[var(--line)] py-4">
            <p className="text-sm">{row.title}</p>
            <button
              disabled={busy}
              onClick={() =>
                void action("watchlist", "PUT", {
                  id: key,
                  symbol: row.symbol,
                  eventId: row.eventId,
                  label: row.title,
                  window: row.window,
                  filter: "all",
                })
              }
              className="lg-focus mt-3 rounded-md bg-[var(--text)] px-3 py-2 text-sm text-[var(--bg)]"
            >
              Save {row.window} signal
            </button>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action("rules", "PUT", {
                  id: key,
                  symbol: row.symbol,
                  eventId: row.eventId,
                  window: row.window,
                  minScore: Number(score),
                  minGap: Number(gap) / 100,
                  muted: false,
                });
              }}
            >
              <label className="text-xs">
                Minimum score
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="mt-1 block h-10 w-24 rounded border border-[var(--line)] px-2"
                />
              </label>
              <label className="text-xs">
                Absolute gap (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  value={gap}
                  onChange={(e) => setGap(e.target.value)}
                  className="mt-1 block h-10 w-24 rounded border border-[var(--line)] px-2"
                />
              </label>
              <button
                disabled={busy}
                className="lg-focus h-10 rounded border border-[var(--line-strong)] px-3 text-sm"
              >
                Create alert
              </button>
            </form>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Alerts appear here when both thresholds are crossed on fresh data.
              Repeated alerts have a 30-minute cooldown.
            </p>
          </div>
        ) : null}
        <div className="flex gap-2" role="group" aria-label="Research section">
          {["watchlist", "rules", "notifications"].map((id) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                setMessage("");
              }}
              className={`lg-focus rounded px-3 py-2 text-sm capitalize ${tab === id ? "bg-[var(--elevated)]" : "text-[var(--muted)]"}`}
            >
              {id}
            </button>
          ))}
        </div>
        <p role="status" className="text-sm text-[var(--muted)]">
          {message ||
            query.error?.message ||
            (query.isPending ? "Loading…" : "")}
        </p>
        {query.error ? (
          <button
            onClick={() => void query.refetch()}
            className="lg-focus text-sm underline"
          >
            Retry
          </button>
        ) : null}
        {!query.isPending && !query.error && !query.data?.items.length ? (
          <p className="py-4 text-sm text-[var(--muted)]">
            {tab === "watchlist"
              ? "Save a signal from its details to find it here."
              : tab === "rules"
                ? "Create an alert from a signal’s details."
                : "No notifications yet."}
          </p>
        ) : null}
        <ul className="divide-y divide-[var(--line)]">
          {query.data?.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  onClick={() => setOpen(false)}
                  href={
                    "window" in item
                      ? `/?symbol=${encodeURIComponent(item.symbol)}&event=${encodeURIComponent(item.eventId)}&window=${item.window}&filter=${"filter" in item ? item.filter : "all"}`
                      : `/markets/${encodeURIComponent(item.symbol)}?event=${encodeURIComponent(item.eventId)}`
                  }
                  className="lg-focus text-sm hover:underline"
                >
                  {"label" in item
                    ? item.label
                    : "title" in item
                      ? item.title
                      : `${item.symbol} · ${item.window} · score ≥ ${item.minScore} · gap ≥ ${(item.minGap * 100).toFixed(1)}%`}
                </Link>
                {"muted" in item ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action("rules", "PUT", {
                        ...item,
                        muted: !item.muted,
                      })
                    }
                    className="lg-focus mt-2 block text-xs underline"
                  >
                    {item.muted ? "Resume alert" : "Mute alert"}
                  </button>
                ) : null}
                {"read" in item && !item.read ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action("notifications", "PATCH", {}, item.id)
                    }
                    className="lg-focus mt-2 block text-xs text-[var(--odds)] underline"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
              <button
                disabled={busy}
                aria-label="Delete saved item"
                onClick={() => void action(tab, "DELETE", undefined, item.id)}
                className="lg-focus rounded p-2"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
