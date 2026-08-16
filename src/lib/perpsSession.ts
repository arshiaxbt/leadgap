"use client";

import type { SecureClient } from "@polymarket/client";
import { polygon } from "viem/chains";
import type { WalletClient } from "viem";
import type { StoredApiKeyCreds } from "./polyClient";

type PerpsCreds = {
  proxy: string;
  privateKey: string;
  secret: string;
  expiresAt: number;
};

type StoredSession = {
  address: string;
  wallet?: string;
  apiKeys?: StoredApiKeyCreds;
  perps?: PerpsCreds;
};

export type OpenedPerpsSession = {
  address: string;
  client: SecureClient;
  session: Awaited<ReturnType<SecureClient["openPerpsSession"]>>;
};

const STORAGE_KEY = "leadgap:perps-session:v2";
const LEGACY_STORAGE_KEY = "leadgap:perps-session:v1";
const EXPIRY_BUFFER_MS = 60_000;

let opened: OpenedPerpsSession | null = null;
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function signerAddress(walletClient: WalletClient): string | undefined {
  const account = walletClient.account;
  const raw = typeof account === "string" ? account : account?.address;
  return raw?.toLowerCase();
}

function dropLegacyStore() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function readStore(): Record<string, StoredSession> {
  if (typeof window === "undefined") return {};
  dropLegacyStore();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredSession>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredSession>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function saveStored(row: StoredSession) {
  const store = readStore();
  store[row.address] = row;
  writeStore(store);
}

function clearStored(address?: string) {
  if (!address) {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      dropLegacyStore();
    }
    return;
  }
  const store = readStore();
  delete store[address];
  writeStore(store);
}

function loadStored(address: string): StoredSession | null {
  const row = readStore()[address];
  if (!row) return null;
  if (row.perps && row.perps.expiresAt < Date.now() + EXPIRY_BUFFER_MS) {
    const next: StoredSession = { ...row, perps: undefined };
    saveStored(next);
    return next.apiKeys ? next : null;
  }
  return row;
}

function persistFromOpened(openedSession: OpenedPerpsSession) {
  const creds = openedSession.client.credentials;
  const perps = openedSession.session.credentials;
  saveStored({
    address: openedSession.address,
    wallet: openedSession.client.account.wallet
      ? String(openedSession.client.account.wallet)
      : undefined,
    apiKeys:
      creds?.key && creds.secret && creds.passphrase
        ? { key: String(creds.key), secret: creds.secret, passphrase: creds.passphrase }
        : undefined,
    perps: perps
      ? {
          proxy: String(perps.proxy),
          privateKey: String(perps.privateKey),
          secret: String(perps.secret),
          expiresAt: Number(perps.expiresAt),
        }
      : undefined,
  });
}

/** Drops the in-memory client. Stored credentials stay so refresh can resume without CreateProxy. */
export function resetPerpsSession() {
  opened = null;
}

/** Wipe delegated credentials. Omit address to clear every stored session in this tab. */
export function forgetStoredPerpsSession(address?: string) {
  clearStored(address?.toLowerCase());
  opened = null;
}

async function ensurePolygon(walletClient: WalletClient) {
  const chainId =
    walletClient.chain?.id ?? (await walletClient.getChainId().catch(() => undefined));
  if (chainId === polygon.id) return;
  try {
    await walletClient.switchChain({ id: polygon.id });
  } catch {
    throw new Error(
      "Switch this wallet to Polygon (chain 137), then approve the Perps signature once.",
    );
  }
}

async function tryResume(
  walletClient: WalletClient,
  address: string,
): Promise<OpenedPerpsSession | null> {
  const stored = loadStored(address);
  if (!stored?.perps) return null;
  const { createTradingClient } = await import("./polyClient");
  try {
    const client = await createTradingClient(walletClient, {
      credentials: stored.apiKeys,
      wallet: stored.wallet,
    });
    const session = await client.openPerpsSession({
      credentials: stored.perps as never,
    });
    const next = { address, client, session };
    persistFromOpened(next);
    opened = next;
    return next;
  } catch {
    clearStored(address);
    return null;
  }
}

async function createSession(
  walletClient: WalletClient,
  address: string,
): Promise<OpenedPerpsSession> {
  await ensurePolygon(walletClient);
  const stored = loadStored(address);
  const { createTradingClient } = await import("./polyClient");
  const client = await createTradingClient(walletClient, {
    credentials: stored?.apiKeys,
    wallet: stored?.wallet,
  });
  const session = await client.openPerpsSession();
  const next = { address, client, session };
  persistFromOpened(next);
  opened = next;
  return next;
}

/**
 * Resume a stored Perps session with no wallet popup.
 * Returns null when a CreateProxy signature would be required.
 */
export function resumePerpsSession(
  walletClient: WalletClient,
): Promise<OpenedPerpsSession | null> {
  return enqueue(async () => {
    const address = signerAddress(walletClient);
    if (!address) return null;
    if (opened?.address === address) return opened;
    if (opened && opened.address !== address) opened = null;
    return tryResume(walletClient, address);
  });
}

/**
 * Opens a Perps session, creating delegated credentials (CreateProxy) only if none are stored.
 */
export function openCachedPerpsSession(
  walletClient: WalletClient,
): Promise<OpenedPerpsSession> {
  return enqueue(async () => {
    const address = signerAddress(walletClient);
    if (!address) {
      throw new Error("Wallet is connected but the signer address is not ready yet.");
    }
    if (opened?.address === address) return opened;
    if (opened && opened.address !== address) opened = null;
    const resumed = await tryResume(walletClient, address);
    if (resumed) return resumed;
    return createSession(walletClient, address);
  });
}
