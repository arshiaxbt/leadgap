"use client";

export type LeadgapEvent =
  | "referral_click"
  | "referral_copy"
  | "view_gap"
  | "open_market"
  | "connect_wallet"
  | "open_ticket"
  | "submit_order"
  | "close_position";

export function trackEvent(
  name: LeadgapEvent,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (typeof window === "undefined") return;
  const detail = {
    name,
    placement: properties?.placement === "guide" ? "guide" : "workspace",
  };
  window.dispatchEvent(new CustomEvent("leadgap:analytics", { detail }));
  if (process.env.NEXT_PUBLIC_ENABLE_TELEMETRY === "true")
    navigator.sendBeacon?.(
      "/api/telemetry",
      new Blob([JSON.stringify(detail)], { type: "application/json" }),
    );
}
