"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { polygon } from "viem/chains";
import { FundControls } from "@/components/FundControls";
import { Pill } from "@/components/ui";
import { explainPerpsError } from "@/lib/perpsAccess";
import { fmtUsd, fmtUsdSigned, shortAddr, signedClass } from "@/lib/format";
import { ERC20_BALANCE_ABI, formatPusd, PUSD_TOKEN } from "@/lib/pusd";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { GapRow } from "@/lib/types";

type Pos = {
  symbol: string;
  size: number;
  pnl: number;
};

type BarState = {
  equity?: number;
  available?: number;
  used?: number;
  upnl?: number;
  daily?: number | null;
  positions: Pos[];
  orders: number;
  liquidation?: boolean;
  note?: string;
  href?: string;
  needsSignature?: boolean;
  funded?: boolean;
  polymarketWallet?: string;
  walletPusd?: string;
  exposure?: string;
};

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function PortfolioStrip() {
  const mount = usePrivyMount();
  if (mount !== "ready") return null;
  return <CommandBar />;
}

function CommandBar() {
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
  const [openPos, setOpenPos] = useState(false);
  const [state, setState] = useState<BarState>({ positions: [], orders: 0 });

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
      setState({ positions: [], orders: 0 });
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
          setState({ positions: [], orders: 0, needsSignature: true });
          return;
        }
        const { client, session } = opened;
        const [portfolio, walletPusd, openOrders, gapsJson] = await Promise.all([
          session.fetchPortfolio(),
          walletPusdFor(client.account.wallet),
          session.fetchOpenOrders().catch(() => []),
          fetch("/api/gaps?window=15m")
            .then((r) => r.json())
            .catch(() => ({ gaps: [] as GapRow[] })),
        ]);
        if (stop) return;
        const margin = portfolio.margin ?? {};
        const extra = margin as { availableOrderMargin?: string };
        const positions = (portfolio.positions ?? [])
          .filter((p) => Number(p.size) !== 0)
          .map((p) => ({
            symbol: p.symbol,
            size: num(p.size),
            pnl: num(p.unrealizedPnl),
          }));
        const equity = num(margin.totalAccountValue ?? portfolio.withdrawable);
        const used = num(margin.totalInitialMargin);
        const available = extra.availableOrderMargin
          ? num(extra.availableOrderMargin)
          : num(portfolio.withdrawable);
        const upnl = positions.reduce((s, p) => s + p.pnl, 0);
        let daily: number | null = null;
        try {
          const page = await session.listPnlHistory({
            interval: "1d" as never,
            start: Date.now() - 2 * 86_400_000,
          });
          const first = await page.firstPage();
          const pts = (first.items ?? []) as { pnl?: string }[];
          if (pts.length === 1) daily = num(pts[0]?.pnl);
          else if (pts.length >= 2) daily = num(pts[pts.length - 1]?.pnl) - num(pts[0]?.pnl);
        } catch {
          daily = null;
        }
        const gaps = ((gapsJson as { gaps?: GapRow[] }).gaps ?? []) as GapRow[];
        const bestGap = new Map<string, GapRow>();
        for (const g of gaps) {
          const prev = bestGap.get(g.symbol);
          if (!prev || g.score > prev.score) bestGap.set(g.symbol, g);
        }
        const exposure = positions
          .map((p) => {
            const hit = bestGap.get(p.symbol);
            if (!hit) return null;
            const title = hit.title.length > 28 ? `${hit.title.slice(0, 26)}…` : hit.title;
            return `${title} → ${p.symbol.replace("-USD", "")} ${p.size > 0 ? "Long" : "Short"}`;
          })
          .find(Boolean);
        setState({
          funded: true,
          polymarketWallet: client.account.wallet,
          walletPusd,
          equity,
          used,
          available,
          upnl,
          daily,
          positions,
          orders: (openOrders ?? []).length,
          liquidation: Boolean(portfolio.inLiquidation),
          exposure: exposure ?? undefined,
        });
      } catch (err) {
        if (!stop) {
          const access = explainPerpsError(err);
          setState({
            positions: [],
            orders: 0,
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
        positions: [],
        orders: 0,
        note: access.message,
        href: access.href,
        needsSignature: access.kind !== "invite",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !authenticated) return null;

  const walletLabel = address ? shortAddr(address) : "—";
  const sessionLabel = state.funded ? "Live" : state.needsSignature ? "Connect" : busy ? "…" : "Idle";

  return (
    <div className="sticky top-14 z-20 border-b border-[#1e2636] bg-[#0b0e14]/95 backdrop-blur">
      <div className="flex h-[52px] items-center gap-px overflow-x-auto px-2 text-[11px]">
        <Metric
          label="Wallet"
          value={<span className="font-mono text-zinc-200">{walletLabel}</span>}
        />
        <Metric
          label="Perps"
          value={
            <span className={state.funded ? "text-[#3ee0a8]" : "text-[#8b93a7]"}>{sessionLabel}</span>
          }
        />
        {state.needsSignature ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void approvePerps()}
            className="mx-2 shrink-0 rounded-md bg-[#3ee0a8] px-2.5 py-1 text-[11px] font-semibold text-[#07080c] disabled:opacity-40"
          >
            {busy ? "Waiting…" : "Connect Perps"}
          </button>
        ) : null}
        {state.funded ? (
          <>
            <Metric label="Equity" value={<span className="num text-zinc-100">{fmtUsd(state.equity)}</span>} />
            <Metric label="Available" value={<span className="num text-zinc-100">{fmtUsd(state.available)}</span>} />
            <Metric label="Used" value={<span className="num text-zinc-300">{fmtUsd(state.used)}</span>} />
            <Metric
              label="uPnL"
              value={
                <span className={`num ${signedClass(state.upnl ?? 0)}`}>{fmtUsdSigned(state.upnl)}</span>
              }
            />
            <Metric
              label="Daily"
              value={
                <span className={`num ${state.daily == null ? "text-[#8b93a7]" : signedClass(state.daily)}`}>
                  {state.daily == null ? "—" : fmtUsdSigned(state.daily)}
                </span>
              }
            />
            <button
              type="button"
              onClick={() => {
                setOpenPos((v) => !v);
                setOpenFund(false);
              }}
              className="flex h-full shrink-0 flex-col justify-center px-3 text-left hover:bg-white/[0.03]"
            >
              <span className="text-[9px] uppercase tracking-wide text-[#5c6478]">Positions</span>
              <span className="num text-zinc-100">
                {state.positions.length} · {state.orders} ord
              </span>
            </button>
            {state.exposure ? (
              <div className="hidden min-w-0 max-w-[240px] shrink px-3 lg:block">
                <div className="text-[9px] uppercase tracking-wide text-[#5c6478]">Event</div>
                <div className="truncate text-[#3ee0a8]">{state.exposure}</div>
              </div>
            ) : null}
            {state.liquidation ? <Pill tone="danger">Liq</Pill> : null}
            <div className="ml-auto flex shrink-0 items-center gap-1 px-2">
              <button
                type="button"
                onClick={() => {
                  setOpenFund((v) => !v);
                  setOpenPos(false);
                }}
                className="rounded-md border border-[#1e2636] px-2.5 py-1 text-[11px] text-zinc-200 hover:text-white"
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenFund((v) => !v);
                  setOpenPos(false);
                }}
                className="rounded-md border border-[#1e2636] px-2.5 py-1 text-[11px] text-zinc-200 hover:text-white"
              >
                Withdraw
              </button>
            </div>
          </>
        ) : (
          <div className="ml-auto" />
        )}
        {state.note ? <span className="truncate px-2 text-amber-200">{state.note}</span> : null}
        {state.href ? (
          <a href={state.href} target="_blank" rel="noreferrer" className="px-2 text-[#8bb4ff] hover:underline">
            Access
          </a>
        ) : null}
      </div>
      {openPos && state.funded ? (
        <div className="border-t border-[#1e2636] bg-[#0c1018] px-3 py-2">
          {state.positions.length === 0 ? (
            <p className="text-[11px] text-[#5c6478]">No open positions.</p>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-[#5c6478]">
                <tr>
                  <th className="py-1 font-medium">Symbol</th>
                  <th className="font-medium">Side</th>
                  <th className="font-medium">Size</th>
                  <th className="font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {state.positions.map((p) => (
                  <tr key={p.symbol} className="border-t border-[#1e2636]">
                    <td className="py-1 text-zinc-100">{p.symbol.replace("-USD", "")}</td>
                    <td className={p.size > 0 ? "text-emerald-300" : "text-rose-300"}>
                      {p.size > 0 ? "Long" : "Short"}
                    </td>
                    <td className="num text-zinc-300">{Math.abs(p.size)}</td>
                    <td className={`num ${signedClass(p.pnl)}`}>{fmtUsdSigned(p.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      {openFund && state.funded && walletClient ? (
        <div className="border-t border-[#1e2636] px-3 py-2">
          <FundControls
            walletClient={walletClient}
            publicClient={publicClient}
            polymarketWallet={state.polymarketWallet}
            walletPusd={state.walletPusd}
            onDone={() => setRetry((n) => n + 1)}
          />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex h-full shrink-0 flex-col justify-center border-r border-[#1e2636] px-3">
      <span className="text-[9px] uppercase tracking-wide text-[#5c6478]">{label}</span>
      <span className="leading-4">{value}</span>
    </div>
  );
}
