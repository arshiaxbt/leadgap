"use client";

import { useAccount, useWalletClient } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { polygon } from "viem/chains";
import { explainPerpsError } from "@/lib/perpsAccess";
import { forgetStoredPerpsSession } from "@/lib/perpsSession";
import { usePrivyMount } from "@/lib/usePrivyMount";

type PortfolioState = {
  equity?: string;
  available?: string;
  positions?: string;
  liquidation?: boolean;
  note: string;
  href?: string;
  needsSignature?: boolean;
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
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<PortfolioState>({
    note: "Log in with Privy (email, Google, or wallet). That login is separate from the Polymarket Perps signature.",
  });

  useEffect(() => {
    if (!isConnected || !address) {
      setState({
        note: "Log in with Privy (email, Google, or wallet). That login is separate from the Polymarket Perps signature.",
      });
      return;
    }
    const wc = walletClientRef.current;
    if (!wc?.account?.address) {
      setState({
        note: "Wallet connected. Waiting for the Polygon signer before loading Perps.",
      });
      return;
    }
    let stop = false;
    setBusy(true);
    (async () => {
      try {
        const { resumePerpsSession } = await import("@/lib/perpsSession");
        const opened = await resumePerpsSession(wc);
        if (stop) return;
        if (!opened) {
          setState({
            needsSignature: true,
            note: "Privy login is done. Perps still needs one Polygon CreateProxy signature — it is not the wallet-login prompt, and it should only appear when you click Approve.",
          });
          return;
        }
        const { client, session } = opened;
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
            needsSignature: access.kind !== "invite",
          });
        }
      } finally {
        if (!stop) setBusy(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [address, isConnected, retry, signerReady]);

  async function approvePerps() {
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { client, session } = await openCachedPerpsSession(wc);
      const portfolio = await session.fetchPortfolio();
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
      const access = explainPerpsError(err);
      setState({
        note: access.message,
        href: access.href,
        needsSignature: access.kind !== "invite",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-zinc-800 bg-[#101318] px-4 py-2 text-xs text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-zinc-500">Portfolio</span>
        {state.equity ? <span>Equity {state.equity} pUSD</span> : null}
        {state.available ? <span>Withdrawable / order margin {state.available} pUSD</span> : null}
        {state.positions ? <span>{state.positions}</span> : null}
        {state.liquidation ? <span className="text-rose-400">Liquidation</span> : null}
        <span className="text-zinc-500">{busy && !state.equity ? "Loading Perps…" : state.note}</span>
        {state.needsSignature ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void approvePerps()}
            className="text-zinc-300 underline disabled:opacity-40"
          >
            {busy ? "Waiting for wallet…" : "Approve Perps session"}
          </button>
        ) : null}
        {state.needsSignature ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              forgetStoredPerpsSession(address);
              setRetry((n) => n + 1);
            }}
            className="text-zinc-500 underline disabled:opacity-40"
          >
            Reset stored session
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
