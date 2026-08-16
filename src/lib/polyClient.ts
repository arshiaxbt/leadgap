import {
  createSecureClient,
  remoteBuilderSigning,
  type SecureClient,
} from "@polymarket/client";
import { signerFrom } from "@polymarket/client/viem";
import type { WalletClient } from "viem";

export type StoredApiKeyCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

/**
 * Same account model polymarket.com uses after Privy login:
 * the login signer (embedded or injected) authenticates, and the SDK
 * uses the deterministic Polymarket Deposit Wallet as the funder when
 * builder HMAC keys are available for gasless deploy.
 */
export async function createTradingClient(
  walletClient: WalletClient,
  options?: { credentials?: StoredApiKeyCreds; wallet?: string },
): Promise<SecureClient> {
  const status = (await fetch("/api/builder/status").then((r) => r.json())) as {
    hasKeys?: boolean;
  };
  const address = walletClient.account?.address;
  if (!address) {
    throw new Error("Wallet client is missing an account.");
  }
  const funder = options?.wallet ?? (status.hasKeys ? undefined : address);
  const shared = {
    signer: signerFrom(walletClient),
    ...(funder ? { wallet: funder } : {}),
    ...(status.hasKeys
      ? {
          apiKey: remoteBuilderSigning({
            url: "/api/builder/sign",
            headers: async () => {
              const { getAccessToken } = await import("@privy-io/react-auth");
              const token = await getAccessToken();
              if (!token) throw new Error("Log in to trade.");
              return { Authorization: `Bearer ${token}` };
            },
          }),
        }
      : {}),
  };
  if (options?.credentials) {
    return createSecureClient({
      ...shared,
      credentials: options.credentials as never,
    });
  }
  return createSecureClient(shared);
}
