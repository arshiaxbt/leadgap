"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { WagmiProvider, useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { PortfolioStripProvider } from "@/components/PortfolioStrip";
import { ResearchProvider } from "@/components/ResearchProvider";
import { preferredTradingWallet } from "@/lib/activeWallet";
import { usePrivyMount } from "@/lib/usePrivyMount";
import { forgetStoredPerpsSession } from "@/lib/perpsSession";
import { getPrivyConfig, privyAppId } from "@/lib/privy";
import { walletConfig } from "@/lib/wagmi";

/**
 * The wallet stack mounts in the browser only. Privy needs a secure origin,
 * which the server cannot know, and rendering it during a build prerender
 * fails outright. Children render either way, so pages still ship their
 * content as HTML; the provider appears once "ready" replaces the "wait"
 * server snapshot. Providers emit no DOM, so the markup the browser hydrates
 * is identical either way.
 */
export function PrivyTree({ children }: { children: ReactNode }) {
  const appId = privyAppId();
  const mount = usePrivyMount();
  if (!appId || mount !== "ready") return children;

  return (
    <PrivyProvider appId={appId} config={getPrivyConfig()}>
      <WagmiProvider config={walletConfig}>
        <ClearSessionOnLogout />
        <SyncActiveWallet />
        <PortfolioStripProvider>
          <ResearchProvider>{children}</ResearchProvider>
        </PortfolioStripProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}

function ClearSessionOnLogout() {
  const { ready, authenticated } = usePrivy();
  useEffect(() => {
    if (!ready || authenticated) return;
    forgetStoredPerpsSession();
  }, [authenticated, ready]);
  return null;
}

function SyncActiveWallet() {
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { user } = usePrivy();
  const { address } = useAccount();

  useEffect(() => {
    if (!wallets.length) return;
    const preferred = preferredTradingWallet(wallets, user?.wallet?.address);
    if (!preferred) return;
    if (address && preferred.address.toLowerCase() === address.toLowerCase()) return;
    void setActiveWallet(preferred);
  }, [address, setActiveWallet, user?.wallet?.address, wallets]);

  return null;
}
