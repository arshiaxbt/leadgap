"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useWalletClient } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { polygon } from "viem/chains";
import { explainPerpsError } from "@/lib/perpsAccess";
import { fmtUsd, fmtUsdSigned, signedClass } from "@/lib/format";
import { usePrivyMount } from "@/lib/usePrivyMount";

type Summary = {
  equity?: number;
  upnl?: number;
  note?: string;
  href?: string;
  needsSignature?: boolean;
  funded?: boolean;
};

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function PortfolioStrip() {
  const mount = usePrivyMount();
  if (mount !== "ready") return null;
  return <AccountChip />;
}

function AccountChip() {
  const { authenticated, ready } = usePrivy();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;
  const signerReady = Boolean(walletClient?.account?.address);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Summary>({});

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
        const { session } = opened;
        const portfolio = await session.fetchPortfolio();
        if (stop) return;
        const margin = portfolio.margin ?? {};
        const positions = (portfolio.positions ?? []).filter((p) => Number(p.size) !== 0);
        setState({
          funded: true,
          equity: num(margin.totalAccountValue ?? portfolio.withdrawable),
          upnl: positions.reduce((s, p) => s + num(p.unrealizedPnl), 0),
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
  }, [address, authenticated, isConnected, ready, retry, signerReady]);

  useEffect(() => {
    if (!state.funded) return;
    const id = setInterval(() => setRetry((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [state.funded]);

  async function approvePerps() {
    const wc = walletClientRef.current;
    if (!wc?.account?.address) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      await openCachedPerpsSession(wc);
      setRetry((n) => n + 1);
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
    <div className="flex items-center gap-3 text-[11px]">
      {state.funded ? (
        <>
          <span className="text-[#7d8699]">
            Eq <span className="num text-zinc-100">{fmtUsd(state.equity)}</span>
          </span>
          <span className="text-[#7d8699]">
            PnL <span className={`num ${signedClass(state.upnl ?? 0)}`}>{fmtUsdSigned(state.upnl)}</span>
          </span>
        </>
      ) : null}
      {state.needsSignature ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void approvePerps()}
          className="rounded bg-[#3ee0a8] px-2 py-0.5 text-[11px] font-semibold text-[#07080c] disabled:opacity-40"
        >
          {busy ? "…" : "Connect Perps"}
        </button>
      ) : null}
      {state.note ? <span className="max-w-[180px] truncate text-amber-200">{state.note}</span> : null}
      {state.href ? (
        <a href={state.href} target="_blank" rel="noreferrer" className="text-[#8bb4ff] hover:underline">
          Access
        </a>
      ) : null}
      <Link href="/portfolio" className="text-[#7d8699] hover:text-white">
        Portfolio
      </Link>
    </div>
  );
}
