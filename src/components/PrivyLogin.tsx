"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function PrivyLogin() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const address = embedded?.address ?? wallets[0]?.address ?? user?.wallet?.address;
  const email = user?.email?.address;

  if (!ready) {
    return <span className="text-xs text-zinc-500">Login…</span>;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-zinc-400 sm:inline">
          {email ?? (address ? short(address) : "Signed in")}
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void login()}
      className="rounded bg-[#1652f0] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d6ff5]"
    >
      Log in
    </button>
  );
}
