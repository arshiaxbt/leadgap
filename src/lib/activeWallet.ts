export type WalletLike = {
  address: string;
  walletClientType: string;
};

/** Prefer the Privy login wallet, then an embedded wallet. Never a random injected account. */
export function preferredTradingWallet<T extends WalletLike>(
  wallets: T[],
  loginAddress?: string | null,
): T | undefined {
  const loginAddr = loginAddress?.toLowerCase();
  const byLogin = loginAddr
    ? wallets.find((wallet) => wallet.address.toLowerCase() === loginAddr)
    : undefined;
  if (byLogin) return byLogin;
  return wallets.find((wallet) => wallet.walletClientType === "privy");
}
