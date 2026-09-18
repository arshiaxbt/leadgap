"use client";
import { useEffect } from "react";
import { trackEvent } from "@/lib/track";
export function ReferralAnalytics() {
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.("a");
      if (!link) return;
      try {
        const url = new URL(link.href);
        if (
          ["polymarket.com", "www.polymarket.com"].includes(url.hostname) &&
          url.searchParams.get("via") === "arshia"
        )
          trackEvent("referral_click", {
            placement: location.pathname === "/about" ? "guide" : "workspace",
          });
      } catch {}
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return null;
}
