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
    return <span className="inline-block h-7 w-[3.75rem] rounded border border-transparent" aria-hidden />;
  }
  if (mount === "insecure") {
    return <span className="text-xs text-amber-200">HTTPS required to log in</span>;
  }
  return <PrivyLogin />;
}
