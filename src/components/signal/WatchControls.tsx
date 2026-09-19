"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { perpName } from "@/lib/signal";
import type { GapRow, GapWindow } from "@/lib/types";
import { useWatchStore, type WatchStore } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

type Row = Pick<GapRow, "eventId" | "symbol" | "title" | "score" | "gap">;

const noop = () => () => {};
const notifySupport = () =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

/** Watch and Alert me, stored in this browser. */
export function WatchControls({
  row,
  window,
  className,
}: {
  row: Row;
  window: GapWindow;
  className?: string;
}) {
  const store = useWatchStore();
  const watching = store.isWatched(row);
  const rule = store.ruleFor(row);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const where =
    store.mode === "account" ? "Synced to your account." : "Saved in this browser.";
  const base =
    "lg-focus inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[7px] border text-[13px] transition-colors";
  return (
    <div className={cn("flex gap-2", className)}>
      <button
        type="button"
        aria-pressed={watching}
        disabled={busy || store.loading}
        onClick={async () => {
          setBusy(true);
          try {
            const now = await store.toggleWatch(row, window);
            toast(now ? "Added to your watchlist" : "Removed from your watchlist", {
              description: now
                ? `${perpName(row.symbol)} · ${window} window. ${where}`
                : undefined,
            });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update your watchlist.");
          } finally {
            setBusy(false);
          }
        }}
        className={cn(
          base,
          watching
            ? "border-[color-mix(in_srgb,var(--odds)_45%,var(--line))] text-odds"
            : "border-line-strong text-subtle hover:text-text",
        )}
      >
        {watching ? "Watching" : "Watch"}
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          base,
          rule && !rule.muted
            ? "border-[color-mix(in_srgb,var(--odds)_45%,var(--line))] text-odds"
            : "border-line-strong text-subtle hover:text-text",
        )}
      >
        {rule ? (rule.muted ? "Alert muted" : "Alert set") : "Alert me"}
      </button>
      <AlertDialog
        key={rule?.id ?? "new"}
        open={open}
        onOpenChange={setOpen}
        row={row}
        window={window}
        store={store}
        existing={rule ? { minScore: rule.minScore, minGap: rule.minGap } : null}
      />
    </div>
  );
}

function AlertDialog({
  open,
  onOpenChange,
  row,
  window,
  store,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: Row;
  window: GapWindow;
  store: WatchStore;
  existing: { minScore: number; minGap: number } | null;
}) {
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState(() =>
    String(existing?.minScore ?? Math.max(28, Math.floor(row.score / 10) * 10)),
  );
  const [gap, setGap] = useState(() =>
    String(
      existing
        ? Math.round(existing.minGap * 1000) / 10
        : Math.max(0.5, Math.floor(Math.abs(row.gap) * 200) / 2),
    ),
  );
  const permission = useSyncExternalStore(noop, notifySupport, () => "unsupported");
  const [asked, setAsked] = useState(false);
  const name = perpName(row.symbol);
  const scoreN = Number(score);
  const gapN = Number(gap);
  const invalid =
    !Number.isFinite(scoreN) ||
    scoreN < 0 ||
    scoreN > 100 ||
    !Number.isFinite(gapN) ||
    gapN < 0 ||
    gapN > 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-xl border-line-strong bg-surface p-[22px] sm:max-w-[420px]">
        <DialogTitle className="serif text-[24px] font-normal">
          Alert me on {name}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[13px] leading-[1.6] text-subtle">
          Fires when this signal crosses both thresholds on the {window} window.
        </DialogDescription>
        <form
          className="mt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (invalid || saving) return;
            setSaving(true);
            try {
              await store.saveRule({
                symbol: row.symbol,
                eventId: row.eventId,
                window,
                minScore: Math.round(scoreN),
                minGap: gapN / 100,
                label: row.title.slice(0, 240),
              });
              toast("Alert saved", {
                description: `${name} · score ≥ ${Math.round(scoreN)} and gap ≥ ${gapN}% on ${window}.`,
              });
              onOpenChange(false);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not save the alert.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] text-subtle">
              Score at least
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                required
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="lg-input num mt-1.5 h-10 px-3 text-[15px]"
              />
            </label>
            <label className="block text-[12px] text-subtle">
              Gap at least (%)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.1}
                required
                value={gap}
                onChange={(e) => setGap(e.target.value)}
                className="lg-input num mt-1.5 h-10 px-3 text-[15px]"
              />
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-[1.6] text-dim">
            {store.mode === "account"
              ? "Checked every minute by the research service, even while Leadgap is closed. New alerts appear in your watchlist inbox."
              : "Checked on every refresh while Leadgap is open in this browser. Log in to have alerts checked while Leadgap is closed."}{" "}
            Repeated triggers on the same rule wait 30 minutes.
          </p>
          {permission === "default" && !asked ? (
            <button
              type="button"
              onClick={() => {
                setAsked(true);
                void Notification.requestPermission();
              }}
              className="lg-focus mt-3 text-[12px] text-odds hover:underline"
            >
              Also show browser notifications
            </button>
          ) : null}
          <div className="mt-5 flex items-center gap-2">
            {existing ? (
              <RemoveRule row={row} store={store} onDone={() => onOpenChange(false)} />
            ) : null}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="lg-focus ml-auto h-9 rounded-[7px] border border-line-strong px-3.5 text-[13px] text-subtle hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={invalid || saving}
              className="lg-focus h-9 rounded-[7px] bg-odds px-4 text-[13px] font-semibold text-on-odds disabled:opacity-50"
            >
              {existing ? "Update alert" : "Save alert"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveRule({
  row,
  store,
  onDone,
}: {
  row: Row;
  store: WatchStore;
  onDone: () => void;
}) {
  const rule = store.ruleFor(row);
  if (!rule) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await store.removeRule(rule.id);
          toast("Alert removed");
          onDone();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not remove the alert.");
        }
      }}
      className="lg-focus h-9 rounded-[7px] px-1 text-[13px] text-short hover:underline"
    >
      Remove
    </button>
  );
}
