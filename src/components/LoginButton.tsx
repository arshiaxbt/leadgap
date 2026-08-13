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

  if (!appId || mount === "off") {
    return (
      <span className="max-w-[14rem] text-right text-xs text-amber-300">
        Add NEXT_PUBLIC_PRIVY_APP_ID to enable Polymarket login
      </span>
    );
  }

  if (mount === "wait") {
    return <span className="text-xs text-zinc-500">Login…</span>;
  }

  if (mount === "insecure") {
    return (
      <span className="max-w-[16rem] text-right text-xs text-amber-300">
        Open via HTTPS or localhost to log in
      </span>
    );
  }

  return <PrivyLogin />;
}
