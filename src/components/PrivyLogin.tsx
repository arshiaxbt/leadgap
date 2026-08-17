"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { preferredTradingWallet } from "@/lib/activeWallet";
import { forgetStoredPerpsSession } from "@/lib/perpsSession";
import { trackEvent } from "@/lib/track";
import { PolyProfileChip } from "@/components/PolyProfile";
import { PortfolioStrip } from "@/components/PortfolioStrip";
import { shortAddr } from "@/lib/format";

export function PrivyLogin() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const preferred = preferredTradingWallet(wallets, user?.wallet?.address);
  const address = preferred?.address ?? user?.wallet?.address;
  const email = user?.email?.address;

  if (!ready) {
    return <span className="inline-block h-7 w-[11.5rem] rounded border border-transparent" aria-hidden />;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-2">
        <PortfolioStrip />
        <PolyProfileChip address={address} fallback={email ?? (address ? shortAddr(address) : "Signed in")} />
        <button
          type="button"
          onClick={() => {
            forgetStoredPerpsSession();
            void logout();
          }}
          className="lg-focus border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--hover)]"
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
      className="lg-focus whitespace-nowrap border border-[var(--line)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--hover)]"
    >
      Log in to Polymarket
    </button>
  );
}
