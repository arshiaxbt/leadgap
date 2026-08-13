"use client";

import { PrivyProvider, useWallets } from "@privy-io/react-auth";
import { WagmiProvider, useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, type ReactNode } from "react";
import { getPrivyConfig, isSecureOrigin, privyAppId } from "@/lib/privy";
import { walletConfig } from "@/lib/wagmi";

export function PrivyTree({ children }: { children: ReactNode }) {
  const appId = privyAppId();
  if (!appId || !isSecureOrigin()) {
    return children;
  }

  return (
    <PrivyProvider appId={appId} config={getPrivyConfig()}>
      <WagmiProvider config={walletConfig}>
        <SyncActiveWallet />
        {children}
      </WagmiProvider>
    </PrivyProvider>
  );
}

function SyncActiveWallet() {
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  useEffect(() => {
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    const preferred = embedded ?? wallets[0];
    if (preferred) void setActiveWallet(preferred);
  }, [setActiveWallet, wallets]);

  return null;
}
