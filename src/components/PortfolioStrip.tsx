"use client";

import { useAccount, useWalletClient } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { polygon } from "viem/chains";
import { explainPerpsError } from "@/lib/perpsAccess";
import { resetPerpsSession } from "@/lib/perpsSession";
import { usePrivyMount } from "@/lib/usePrivyMount";

type PortfolioState = {
  equity?: string;
  available?: string;
  positions?: string;
  liquidation?: boolean;
  note: string;
  href?: string;
};

export function PortfolioStrip() {
  const mount = usePrivyMount();
  if (mount !== "ready") {
    return (
      <div className="border-b border-zinc-800 bg-[#101318] px-4 py-2 text-xs text-zinc-500">
        {mount === "insecure"
          ? "Privy login needs HTTPS or localhost (embedded wallets cannot run on plain HTTP IPs)."
          : "Log in to load Perps equity, available order margin, and positions."}
      </div>
    );
  }
  return <ConnectedPortfolio />;
}

function ConnectedPortfolio() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;
  const signerReady = Boolean(walletClient?.account?.address);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<PortfolioState>({
    note: "Log in to load Perps equity, available order margin, and positions.",
  });

  useEffect(() => {
    const wc = walletClientRef.current;
    if (!isConnected || !address || !wc?.account?.address) {
      resetPerpsSession();
      setState({
        note: "Log in to load Perps equity, available order margin, and positions.",
      });
      return;
    }
    let stop = false;
    (async () => {
      try {
        const { openCachedPerpsSession } = await import("@/lib/perpsSession");
        const { client, session } = await openCachedPerpsSession(wc);
        const portfolio = await session.fetchPortfolio();
        if (stop) return;
        const margin = portfolio.margin as {
          totalAccountValue?: string;
          availableOrderMargin?: string;
        };
        setState({
          equity: String(margin.totalAccountValue ?? portfolio.withdrawable),
          available: margin.availableOrderMargin
            ? String(margin.availableOrderMargin)
            : String(portfolio.withdrawable),
          positions: portfolio.positions
            .filter((p) => Number(p.size) !== 0)
            .slice(0, 4)
            .map((p) => `${p.symbol} ${p.size}`)
            .join(" · "),
          liquidation: portfolio.inLiquidation,
          note: portfolio.inLiquidation
            ? "Account is in liquidation scope — new risk-increasing orders are blocked."
            : `Polymarket wallet ${client.account.wallet.slice(0, 6)}…${client.account.wallet.slice(-4)} · builder arshia`,
        });
      } catch (err) {
        if (!stop) {
          const access = explainPerpsError(err);
          setState({
            note: access.message,
            href: access.href,
          });
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [address, isConnected, retry, signerReady]);

  return (
    <div className="border-b border-zinc-800 bg-[#101318] px-4 py-2 text-xs text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-zinc-500">Portfolio</span>
        {state.equity ? <span>Equity {state.equity} pUSD</span> : null}
        {state.available ? <span>Withdrawable / order margin {state.available} pUSD</span> : null}
        {state.positions ? <span>{state.positions}</span> : null}
        {state.liquidation ? <span className="text-rose-400">Liquidation</span> : null}
        <span className="text-zinc-500">{state.note}</span>
        {state.note.startsWith("The wallet must approve") ? (
          <button
            type="button"
            onClick={() => {
              resetPerpsSession();
              setRetry((n) => n + 1);
            }}
            className="text-zinc-300 underline"
          >
            Retry signature
          </button>
        ) : null}
        {state.href ? (
          <a href={state.href} target="_blank" rel="noreferrer" className="text-zinc-300 underline">
            polymarket.com/perps
          </a>
        ) : null}
      </div>
    </div>
  );
}
