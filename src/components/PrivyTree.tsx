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
 * Privy needs a browser-secure origin, which the server cannot know. Deciding
 * that during render changed the tree's shape between server and client, so
 * the whole app was excluded from server rendering to hide the mismatch.
 * Gate on the mount state instead: it reports "wait" on the server and "ready"
 * in the browser, both of which render the same tree, so the shape only
 * differs for "off"/"insecure" — settled by env before a render happens.
 */
export function PrivyTree({ children }: { children: ReactNode }) {
  const appId = privyAppId();
  const mount = usePrivyMount();
  if (!appId || mount === "off" || mount === "insecure") return children;

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
