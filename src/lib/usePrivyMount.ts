"use client";

import { useEffect, useState } from "react";
import { isSecureOrigin, privyAppId } from "@/lib/privy";

export type PrivyMount = "off" | "wait" | "insecure" | "ready";

export function usePrivyMount(): PrivyMount {
  const [state, setState] = useState<PrivyMount>(privyAppId() ? "wait" : "off");

  useEffect(() => {
    if (!privyAppId()) {
      setState("off");
      return;
    }
    setState(isSecureOrigin() ? "ready" : "insecure");
  }, []);

  return state;
}
