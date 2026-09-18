"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export function FeedStatus({
  asOf,
  loading,
  error,
  retry,
}: {
  asOf: number;
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const stale = asOf > 0 && now - asOf > 90_000;
  const state = loading
    ? "Connecting"
    : error
      ? "Updates interrupted"
      : stale
        ? "Data delayed"
        : asOf
          ? "Updated"
          : "Awaiting data";
  return (
    <div className="feed-status" role="status">
      <span
        className={`status-square ${error || stale ? "status-delayed" : ""}`}
        aria-hidden
      />
      <span>
        {state}
        {asOf > 0 && !loading
          ? ` ${new Date(asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`
          : ""}
      </span>
      <button
        type="button"
        onClick={retry}
        className="lg-focus inline-flex size-8 items-center justify-center rounded-md hover:bg-[var(--hover)]"
        aria-label="Refresh data"
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
