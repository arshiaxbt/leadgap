"use client";

import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fmtPct } from "@/lib/format";
import { signalHref } from "@/lib/links";
import { evaluateAlert, type AlertState } from "@/lib/research";
import { perpName } from "@/lib/signal";
import type { GapWindow } from "@/lib/types";
import { gapsQuery } from "@/lib/useGapsFeed";
import { recordAlerts, useWatchState } from "@/lib/watchlist";

/**
 * Evaluates saved alert rules against the live feed while Leadgap is open.
 * Uses the same crossing and 30-minute cooldown rules as the research service.
 */
export function AlertWatcher() {
  const state = useWatchState();
  const router = useRouter();
  const active = useMemo(
    () => state.rules.filter((rule) => !rule.muted),
    [state.rules],
  );
  const windows = useMemo(
    () => [...new Set(active.map((rule) => rule.window))] as GapWindow[],
    [active],
  );
  const feeds = useQueries({
    queries: windows.map((window) => gapsQuery(window)),
  });
  const stamps = feeds.map((feed) => feed.dataUpdatedAt).join(",");

  useEffect(() => {
    if (!active.length) return;
    const now = Date.now();
    const changed: Record<string, AlertState> = {};
    for (const rule of active) {
      const feed = feeds[windows.indexOf(rule.window)]?.data;
      if (!feed) continue;
      const row = feed.gaps.find(
        (g) => g.eventId === rule.eventId && g.symbol === rule.symbol,
      );
      const previous = state.alerts[rule.id] ?? { matched: false, lastFired: 0 };
      const result = evaluateAlert(rule, previous, row, now, feed.asOf);
      if (
        result.state.matched !== previous.matched ||
        result.state.lastFired !== previous.lastFired
      )
        changed[rule.id] = result.state;
      if (result.fire && row) {
        const href = signalHref({ ...row, window: rule.window });
        toast(`${perpName(row.symbol)} alert · score ${row.score}`, {
          description: `${row.title} — gap ${fmtPct(row.gap)} on the ${rule.window} window.`,
          action: { label: "Open", onClick: () => router.push(href) },
          duration: 12_000,
        });
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          document.visibilityState !== "visible"
        ) {
          try {
            new Notification(`Leadgap · ${perpName(row.symbol)} score ${row.score}`, {
              body: `Gap ${fmtPct(row.gap)} on the ${rule.window} window. ${row.title}`,
              tag: rule.id,
            });
          } catch {
            // Some browsers only allow notifications from a service worker.
          }
        }
      }
    }
    if (Object.keys(changed).length) recordAlerts(changed);
    // Re-run when any feed refreshes or rules change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamps, active]);

  return null;
}
