"use client";

import type { SecureClient } from "@polymarket/client";
import { polygon } from "viem/chains";
import type { WalletClient } from "viem";

type Opened = {
  address: string;
  client: SecureClient;
  session: Awaited<ReturnType<SecureClient["openPerpsSession"]>>;
};

let inflight: Promise<Opened> | null = null;
let inflightAddress: string | null = null;
let opened: Opened | null = null;

function signerAddress(walletClient: WalletClient): string | undefined {
  const account = walletClient.account;
  const raw = typeof account === "string" ? account : account?.address;
  return raw?.toLowerCase();
}

export function resetPerpsSession() {
  inflight = null;
  inflightAddress = null;
  opened = null;
}

/**
 * Opens a Perps session at most once per connected address.
 * createSecureClient and openPerpsSession each need a wallet signature;
 * without this cache, React re-renders fire overlapping prompts forever.
 */
export async function openCachedPerpsSession(walletClient: WalletClient): Promise<Opened> {
  const address = signerAddress(walletClient);
  if (!address) {
    throw new Error("Wallet is connected but the signer address is not ready yet.");
  }
  if (opened?.address === address) return opened;
  if (opened && opened.address !== address) opened = null;
  if (inflight && inflightAddress === address) return inflight;
  if (inflight && inflightAddress !== address) {
    inflight = null;
    inflightAddress = null;
  }

  inflightAddress = address;
  inflight = (async () => {
    const chainId =
      walletClient.chain?.id ??
      (await walletClient.getChainId().catch(() => undefined));
    if (chainId !== polygon.id) {
      try {
        await walletClient.switchChain({ id: polygon.id });
      } catch {
        throw new Error(
          "Switch this wallet to Polygon (chain 137), then approve the signature once.",
        );
      }
    }
    const { createTradingClient } = await import("./polyClient");
    const client = await createTradingClient(walletClient);
    const session = await client.openPerpsSession();
    opened = { address, client, session };
    return opened;
  })().catch((err) => {
    if (inflightAddress === address) {
      inflight = null;
      inflightAddress = null;
    }
    throw err;
  });
  return inflight;
}
