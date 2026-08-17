import type { PrivyClientConfig } from "@privy-io/react-auth";
import { polygon } from "viem/chains";
import { APP_ACCENT, APP_LOGO_RASTER } from "@/lib/brand";

/** Privy embedded wallets (and PrivyProvider itself) only run on HTTPS or localhost. */
export function isSecureOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

export function getPrivyConfig(): PrivyClientConfig {
  return {
    defaultChain: polygon,
    supportedChains: [polygon],
    loginMethods: ["email", "google", "wallet"],
    appearance: {
      theme: "dark",
      accentColor: APP_ACCENT,
      landingHeader: "Log in to Leadgap",
      loginMessage: "Email, Google, or a wallet.",
      logo: APP_LOGO_RASTER,
      showWalletLoginFirst: false,
      walletList: [
        "detected_ethereum_wallets",
        "metamask",
        "coinbase_wallet",
        "rainbow",
        "wallet_connect",
        "phantom",
        "rabby_wallet",
      ],
    },
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets",
      },
    },
    ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      ? { walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID }
      : {}),
  };
}

export function privyAppId(): string | undefined {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || undefined;
}
