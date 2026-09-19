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
    return <span className="inline-block h-8 w-16 rounded border border-transparent" aria-hidden />;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="hidden xl:block">
          <PortfolioStrip />
        </div>
        <div className="hidden sm:block">
          <PolyProfileChip address={address} fallback={email ?? (address ? shortAddr(address) : "Signed in")} />
        </div>
        <button
          type="button"
          onClick={() => {
            forgetStoredPerpsSession();
            void logout();
          }}
          className="lg-focus inline-flex h-8 items-center rounded-[7px] border border-line-strong px-3 text-[13px] text-subtle transition-colors hover:text-text"
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
      aria-label="Log in to Polymarket"
      className="lg-focus inline-flex h-8 items-center whitespace-nowrap rounded-[7px] border border-line-strong px-3 text-[13px] text-subtle transition-colors hover:text-text"
    >
      Log in
    </button>
  );
}
