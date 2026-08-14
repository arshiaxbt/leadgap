"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { resetPerpsSession } from "@/lib/perpsSession";
import { trackEvent } from "@/lib/track";
import { PolyProfileChip } from "@/components/PolyProfile";
import { shortAddr } from "@/lib/format";

export function PrivyLogin() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const injected = wallets.find((w) => w.walletClientType !== "privy");
  const address = injected?.address ?? wallets[0]?.address ?? user?.wallet?.address;
  const email = user?.email?.address;

  if (!ready) {
    return <span className="text-xs text-[#8b93a7]">Connecting…</span>;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-3">
        <PolyProfileChip address={address} fallback={email ?? (address ? shortAddr(address) : "Signed in")} />
        <button
          type="button"
          onClick={() => {
            resetPerpsSession();
            void logout();
          }}
          className="rounded-lg border border-[#1e2636] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5"
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
      className="rounded border border-[#1a2030] px-2.5 py-1 text-[12px] text-zinc-200 hover:bg-white/5"
    >
      Log in
    </button>
  );
}
