"use client";

import { track } from "@vercel/analytics";

export type LeadgapEvent =
  | "view_gap"
  | "open_market"
  | "connect_wallet"
  | "open_ticket"
  | "submit_order"
  | "close_position";

export function trackEvent(name: LeadgapEvent, properties?: Record<string, string | number | boolean | null>): void {
  if (typeof window === "undefined") return;
  track(name, properties);
}
