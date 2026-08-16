"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { WagmiProvider, useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { preferredTradingWallet } from "@/lib/activeWallet";
import { forgetStoredPerpsSession } from "@/lib/perpsSession";
import { getPrivyConfig, isSecureOrigin, privyAppId } from "@/lib/privy";
import { walletConfig } from "@/lib/wagmi";

export function PrivyTree({ children }: { children: ReactNode }) {
  const appId = privyAppId();
  if (!appId || !isSecureOrigin()) return children;

  return (
    <PrivyProvider appId={appId} config={getPrivyConfig()}>
      <WagmiProvider config={walletConfig}>
        <ClearSessionOnLogout />
        <SyncActiveWallet />
        {children}
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
