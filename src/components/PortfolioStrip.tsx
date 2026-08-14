"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { polygon } from "viem/chains";
import { FundControls } from "@/components/FundControls";
import { Pill } from "@/components/ui";
import { explainPerpsError } from "@/lib/perpsAccess";
import { fmtUsd, shortAddr } from "@/lib/format";
import { ERC20_BALANCE_ABI, formatPusd, PUSD_TOKEN } from "@/lib/pusd";
import { usePrivyMount } from "@/lib/usePrivyMount";

type PortfolioState = {
  equity?: string;
  available?: string;
  positions?: string;
  liquidation?: boolean;
  note?: string;
  href?: string;
  needsSignature?: boolean;
  funded?: boolean;
  polymarketWallet?: string;
  walletPusd?: string;
};

function fromPortfolio(
  client: { account: { wallet: string } },
  portfolio: {
    withdrawable: string;
    inLiquidation?: boolean;
    margin?: { totalAccountValue?: string; availableOrderMargin?: string };
    positions: { symbol: string; size: string }[];
  },
  walletPusd?: string,
): PortfolioState {
  const margin = portfolio.margin ?? {};
  return {
    funded: true,
    polymarketWallet: client.account.wallet,
    walletPusd,
    equity: String(margin.totalAccountValue ?? portfolio.withdrawable),
    available: margin.availableOrderMargin
      ? String(margin.availableOrderMargin)
      : String(portfolio.withdrawable),
    positions: portfolio.positions
      .filter((p) => Number(p.size) !== 0)
      .slice(0, 3)
      .map((p) => `${p.symbol} ${p.size}`)
      .join("  "),
    liquidation: Boolean(portfolio.inLiquidation),
  };
}

export function PortfolioStrip() {
  const mount = usePrivyMount();
  if (mount !== "ready") return null;
  return <ConnectedPortfolio />;
}

function ConnectedPortfolio() {
  const { authenticated, ready } = usePrivy();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const publicClient = usePublicClient({ chainId: polygon.id });
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;
  const signerReady = Boolean(walletClient?.account?.address);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [openFund, setOpenFund] = useState(false);
  const [state, setState] = useState<PortfolioState>({});

  async function walletPusdFor(addr: string): Promise<string | undefined> {
    if (!publicClient) return undefined;
    try {
      const bal = await publicClient.readContract({
        address: PUSD_TOKEN,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [addr as `0x${string}`],
      });
      return formatPusd(bal);
    } catch {
      return undefined;
    }
  }

  useEffect(() => {
    if (!ready || !authenticated || !isConnected || !address) {
      setState({});
      return;
    }
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    let stop = false;
    setBusy(true);
    (async () => {
      try {
        const { resumePerpsSession } = await import("@/lib/perpsSession");
        const opened = await resumePerpsSession(wc);
        if (stop) return;
        if (!opened) {
          setState({ needsSignature: true });
          return;
        }
        const { client, session } = opened;
        const [portfolio, walletPusd] = await Promise.all([
          session.fetchPortfolio(),
          walletPusdFor(client.account.wallet),
        ]);
        if (stop) return;
        setState(fromPortfolio(client, portfolio, walletPusd));
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
  }, [address, authenticated, isConnected, ready, retry, signerReady]);

  async function approvePerps() {
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { client, session } = await openCachedPerpsSession(wc);
      const [portfolio, walletPusd] = await Promise.all([
        session.fetchPortfolio(),
        walletPusdFor(client.account.wallet),
      ]);
      setState(fromPortfolio(client, portfolio, walletPusd));
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

  if (!ready || !authenticated) return null;

  return (
    <div className="border-b border-[#1e2636] bg-[#0c1018]/90">
      <div className="flex w-full flex-col gap-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          {busy && !state.funded && !state.needsSignature ? (
            <span className="text-[#8b93a7]">Loading account…</span>
          ) : null}
          {state.needsSignature ? (
            <>
              <span className="text-[#8b93a7]">Connect Perps to trade and see equity.</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void approvePerps()}
                className="rounded-md bg-[#3ee0a8] px-2.5 py-1 font-medium text-[#07080c] disabled:opacity-40"
              >
                {busy ? "Waiting for wallet…" : "Connect Perps"}
              </button>
            </>
          ) : null}
          {state.funded ? (
            <>
              <span className="text-[#8b93a7]">
                Equity <span className="num text-zinc-100">{fmtUsd(state.equity)}</span>
              </span>
              <span className="text-[#8b93a7]">
                Free <span className="num text-zinc-100">{fmtUsd(state.available)}</span>
              </span>
              {state.positions ? <span className="num text-zinc-300">{state.positions}</span> : null}
              {state.liquidation ? <Pill tone="danger">Liquidation</Pill> : null}
              {state.polymarketWallet ? (
                <span className="hidden font-mono text-[#5c6478] sm:inline">
                  {shortAddr(state.polymarketWallet)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setOpenFund((v) => !v)}
                className="ml-auto text-[#8b93a7] hover:text-white"
              >
                {openFund ? "Close" : "Transfer"}
              </button>
            </>
          ) : null}
          {state.note ? <span className="text-amber-200">{state.note}</span> : null}
          {state.href ? (
            <a href={state.href} target="_blank" rel="noreferrer" className="text-[#8bb4ff] hover:underline">
              Request access
            </a>
          ) : null}
        </div>
        {openFund && state.funded && walletClient ? (
          <FundControls
            walletClient={walletClient}
            publicClient={publicClient}
            polymarketWallet={state.polymarketWallet}
            walletPusd={state.walletPusd}
            onDone={() => setRetry((n) => n + 1)}
          />
        ) : null}
      </div>
    </div>
  );
}
