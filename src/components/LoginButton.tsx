"use client";

import dynamic from "next/dynamic";
import { privyAppId } from "@/lib/privy";
import { usePrivyMount } from "@/lib/usePrivyMount";

const PrivyLogin = dynamic(() => import("./PrivyLogin").then((m) => m.PrivyLogin), {
  ssr: false,
});

export function LoginButton() {
  const appId = privyAppId();
  const mount = usePrivyMount();

  if (!appId || mount === "off") return null;
  if (mount === "wait") {
    return <span className="inline-block h-7 w-[9.25rem] rounded border border-transparent" aria-hidden />;
  }
  if (mount === "insecure") {
    return <span className="text-xs text-[var(--warn)]">HTTPS required to log in</span>;
  }
  return <PrivyLogin />;
}
