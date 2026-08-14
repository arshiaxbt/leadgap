"use client";

import { useState } from "react";
import type { PublicClient, WalletClient } from "viem";
import { explainPerpsError } from "@/lib/perpsAccess";
import {
  assertMinPusd,
  ERC20_BALANCE_ABI,
  formatPusd,
  MIN_PERPS_DEPOSIT,
  parsePusd,
  PUSD_TOKEN,
} from "@/lib/pusd";

export function FundControls({
  walletClient,
  publicClient,
  polymarketWallet,
  walletPusd,
  onDone,
}: {
  walletClient: WalletClient;
  publicClient?: PublicClient;
  polymarketWallet?: string;
  walletPusd?: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(MIN_PERPS_DEPOSIT));
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function run(kind: "deposit" | "withdraw") {
    setBusy(kind);
    setStatus(null);
    try {
      const units = parsePusd(amount);
      assertMinPusd(units, kind);
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { client } = await openCachedPerpsSession(walletClient);
      if (kind === "deposit") {
        if (publicClient && polymarketWallet) {
          const bal = await publicClient.readContract({
            address: PUSD_TOKEN,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [polymarketWallet as `0x${string}`],
          });
          if (bal < units) {
            throw new Error(
              `Polymarket wallet has ${formatPusd(bal)} pUSD. Fund it on polymarket.com first, then deposit at least ${MIN_PERPS_DEPOSIT} pUSD here.`,
            );
          }
        }
        await client.setupTradingApprovals();
        const handle = await client.depositToPerps({
          amount: units,
          metadata: "Leadgap Perps deposit",
        });
        await handle.wait();
        setStatus(`Deposit of ${formatPusd(units)} pUSD submitted. Equity can take a moment to credit.`);
      } else {
        const id = await client.withdrawFromPerps({ amount: units });
        setStatus(`Withdraw ${formatPusd(units)} pUSD queued (${String(id)}).`);
      }
      onDone();
    } catch (err) {
      const access = explainPerpsError(err);
      setStatus(access.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-zinc-500">
        Amount
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-100"
        />
        pUSD
      </label>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void run("deposit")}
        className="rounded border border-zinc-600 px-2 py-0.5 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
      >
        {busy === "deposit" ? "Depositing…" : "Deposit"}
      </button>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void run("withdraw")}
        className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
      >
        {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
      </button>
      {walletPusd != null ? <span className="text-zinc-500">Wallet {walletPusd} pUSD</span> : null}
      <a
        href="https://polymarket.com"
        target="_blank"
        rel="noreferrer"
        className="text-zinc-500 underline"
      >
        Fund wallet
      </a>
      {status ? <span className="text-amber-300">{status}</span> : null}
    </div>
  );
}
