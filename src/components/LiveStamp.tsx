"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function LiveStamp({ className }: { className?: string }) {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      setNow(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]", className)}>
      <span
        className="size-1.5 shrink-0 rounded-[1px] bg-[var(--odds)] shadow-[0_0_6px_color-mix(in_srgb,var(--odds)_80%,transparent)]"
        aria-hidden
      />
      <span className="num tabular-nums">{now || "—"}</span>
    </span>
  );
}
