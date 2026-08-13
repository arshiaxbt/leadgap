import {
  createSecureClient,
  remoteBuilderSigning,
  type SecureClient,
} from "@polymarket/client";
import { signerFrom } from "@polymarket/client/viem";
import type { WalletClient } from "viem";

/**
 * Same account model polymarket.com uses after Privy login:
 * the login signer (embedded or injected) authenticates, and the SDK
 * uses the deterministic Polymarket Deposit Wallet as the funder when
 * builder HMAC keys are available for gasless deploy.
 */
export async function createTradingClient(
  walletClient: WalletClient,
): Promise<SecureClient> {
  const status = (await fetch("/api/builder/status").then((r) => r.json())) as {
    hasKeys?: boolean;
  };
  const address = walletClient.account?.address;
  return createSecureClient({
    signer: signerFrom(walletClient),
    ...(status.hasKeys
      ? { apiKey: remoteBuilderSigning({ url: "/api/builder/sign" }) }
      : address
        ? { wallet: address }
        : {}),
  });
}
