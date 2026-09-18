"use client";
import { useSyncExternalStore } from "react";
import { isSecureOrigin, privyAppId } from "@/lib/privy";
export type PrivyMount = "off" | "wait" | "insecure" | "ready";
const subscribe = () => () => {};
const snapshot = (): PrivyMount =>
  !privyAppId() ? "off" : isSecureOrigin() ? "ready" : "insecure";
const serverSnapshot = (): PrivyMount => (privyAppId() ? "wait" : "off");
export function usePrivyMount(): PrivyMount {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
