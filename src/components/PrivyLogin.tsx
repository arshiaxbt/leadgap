"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { forgetStoredPerpsSession } from "@/lib/perpsSession";
import { trackEvent } from "@/lib/track";
import { PolyProfileChip } from "@/components/PolyProfile";
import { shortAddr } from "@/lib/format";

export function PrivyLogin() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const loginAddr = user?.wallet?.address?.toLowerCase();
  const byLogin = loginAddr
    ? wallets.find((w) => w.address.toLowerCase() === loginAddr)
    : undefined;
  const injected = wallets.find((w) => w.walletClientType !== "privy");
  const address = byLogin?.address ?? injected?.address ?? wallets[0]?.address ?? user?.wallet?.address;
  const email = user?.email?.address;

  if (!ready) {
    return <span className="inline-block h-7 w-[9.25rem] rounded border border-transparent" aria-hidden />;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-3">
        <PolyProfileChip address={address} fallback={email ?? (address ? shortAddr(address) : "Signed in")} />
        <button
          type="button"
          onClick={() => {
            forgetStoredPerpsSession(address);
            void logout();
          }}
          className="border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--hover)]"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        trackEvent("connect_wallet");
        void login();
      }}
      className="whitespace-nowrap border border-[var(--line)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--hover)]"
    >
      Log in to Polymarket
    </button>
  );
}
