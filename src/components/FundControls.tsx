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
import { TextInput } from "@/components/ui";

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
              `Wallet has ${formatPusd(bal)} pUSD. Fund it on Polymarket first (min ${MIN_PERPS_DEPOSIT} pUSD).`,
            );
          }
        }
        await client.setupTradingApprovals();
        const handle = await client.depositToPerps({
          amount: units,
          metadata: "Leadgap Perps deposit",
        });
        await handle.wait();
        setStatus(`Deposited ${formatPusd(units)} pUSD. Equity may take a moment.`);
      } else {
        await client.withdrawFromPerps({ amount: units });
        setStatus(`Withdrew ${formatPusd(units)} pUSD.`);
      }
      onDone();
    } catch (err) {
      setStatus(explainPerpsError(err).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-24">
        <TextInput
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label="pUSD amount"
        />
      </div>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void run("deposit")}
        className="border border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] px-3 py-1.5 text-xs font-medium text-[var(--signal)] disabled:opacity-40"
      >
        {busy === "deposit" ? "Depositing…" : "Deposit"}
      </button>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void run("withdraw")}
        className="border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-40"
      >
        {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
      </button>
      {walletPusd != null ? <span className="text-xs text-[var(--muted)]">Wallet {walletPusd} pUSD</span> : null}
      <a
        href="https://polymarket.com"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        Fund on Polymarket
      </a>
      {status ? <span className="text-xs text-[var(--warn)]">{status}</span> : null}
    </div>
  );
}
