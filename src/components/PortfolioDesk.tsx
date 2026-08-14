"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { FundControls } from "@/components/FundControls";
import { PolyProfileCard } from "@/components/PolyProfile";
import { Pill } from "@/components/ui";
import { explainPerpsError } from "@/lib/perpsAccess";
import { fmtPx, fmtUsd, fmtUsdSigned, signedClass } from "@/lib/format";
import { ERC20_BALANCE_ABI, formatPusd, PUSD_TOKEN } from "@/lib/pusd";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { GapRow, PerpsTicker } from "@/lib/types";

type Pos = {
  instrumentId: number;
  symbol: string;
  size: number;
  entry: number;
  leverage: number;
  pnl: number;
  liq: number;
};

type Order = {
  id: number;
  side: string;
  price: string;
  quantity: string;
  status: string;
  symbol?: string;
};

type Fill = {
  side: string;
  quantity: string;
  price: string;
  symbol?: string;
  time?: number;
};

type DeskState = {
  equity: number;
  available: number;
  used: number;
  maint: number;
  upnl: number;
  realized: number | null;
  positions: Pos[];
  orders: Order[];
  fills: Fill[];
  liquidation: boolean;
  funded: boolean;
  needsSignature: boolean;
  note: string;
  href?: string;
  polymarketWallet?: string;
  walletPusd?: string;
};

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const EMPTY: DeskState = {
  equity: 0,
  available: 0,
  used: 0,
  maint: 0,
  upnl: 0,
  realized: null,
  positions: [],
  orders: [],
  fills: [],
  liquidation: false,
  funded: false,
  needsSignature: false,
  note: "",
};

export function PortfolioDesk() {
  const mount = usePrivyMount();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const publicClient = usePublicClient({ chainId: polygon.id });
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;
  const signerReady = Boolean(walletClient?.account?.address);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Record<string, PerpsTicker>>({});
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [state, setState] = useState<DeskState>(EMPTY);

  const refresh = useCallback(async () => {
    const wc = walletClientRef.current;
    if (mount !== "ready" || !isConnected || !wc?.account?.address) {
      setState({ ...EMPTY, note: "Log in to load portfolio." });
      return;
    }
    try {
      const { resumePerpsSession } = await import("@/lib/perpsSession");
      const opened = await resumePerpsSession(wc);
      if (!opened) {
        setState({ ...EMPTY, needsSignature: true, note: "Connect Perps to load portfolio." });
        return;
      }
      const { client, session } = opened;
      const [portfolio, openOrders, walletPusd] = await Promise.all([
        session.fetchPortfolio(),
        session.fetchOpenOrders().catch(() => []),
        publicClient
          ? publicClient
              .readContract({
                address: PUSD_TOKEN,
                abi: ERC20_BALANCE_ABI,
                functionName: "balanceOf",
                args: [client.account.wallet as `0x${string}`],
              })
              .then((bal) => formatPusd(bal))
              .catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      const margin = portfolio.margin ?? {};
      const extra = margin as { availableOrderMargin?: string };
      const positions = (portfolio.positions ?? [])
        .filter((p) => Number(p.size) !== 0)
        .map((p) => ({
          instrumentId: Number(p.instrumentId),
          symbol: p.symbol,
          size: num(p.size),
          entry: num(p.entryPrice),
          leverage: Number(p.leverage) || 0,
          pnl: num(p.unrealizedPnl),
          liq: num(p.liquidationPrice),
        }));
      let realized: number | null = null;
      try {
        const page = await session.listPnlHistory({
          interval: "1d" as never,
          start: Date.now() - 30 * 86_400_000,
        });
        const first = await page.firstPage();
        const pts = (first.items ?? []) as { pnl?: string }[];
        if (pts.length) realized = num(pts[pts.length - 1]?.pnl);
      } catch {
        realized = null;
      }
      let fills: Fill[] = [];
      try {
        const page = await session.listFills().firstPage();
        fills = (page.items ?? []).slice(0, 40).map((f) => ({
          side: String(f.side),
          quantity: String(f.quantity),
          price: String(f.price),
          symbol: "symbol" in f ? String((f as { symbol?: string }).symbol ?? "") : "",
          time: "timestamp" in f ? Number((f as { timestamp?: number }).timestamp) : undefined,
        }));
      } catch {
        fills = [];
      }
      setState({
        funded: true,
        needsSignature: false,
        note: "",
        equity: num(margin.totalAccountValue ?? portfolio.withdrawable),
        used: num(margin.totalInitialMargin),
        maint: num(margin.totalMaintenanceMargin),
        available: extra.availableOrderMargin
          ? num(extra.availableOrderMargin)
          : num(portfolio.withdrawable),
        upnl: positions.reduce((s, p) => s + p.pnl, 0),
        realized,
        positions,
        orders: (openOrders ?? []).map((o) => ({
          id: Number(o.id),
          side: String(o.side),
          price: String(o.price),
          quantity: String(o.quantity),
          status: String(o.status),
          symbol: "symbol" in o ? String((o as { symbol?: string }).symbol ?? "") : "",
        })),
        fills,
        liquidation: Boolean(portfolio.inLiquidation),
        polymarketWallet: client.account.wallet,
        walletPusd,
      });
    } catch (err) {
      const access = explainPerpsError(err);
      setState({
        ...EMPTY,
        note: access.message,
        href: access.href,
        needsSignature: access.kind !== "invite",
      });
    }
  }, [isConnected, mount, publicClient]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh, retry, signerReady]);

  useEffect(() => {
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d: { tickers?: Record<string, PerpsTicker> }) => setMarks(d.tickers ?? {}))
      .catch(() => undefined);
    fetch("/api/gaps?window=15m")
      .then((r) => r.json())
      .then((d: { gaps?: GapRow[] }) => setGaps(d.gaps ?? []))
      .catch(() => undefined);
  }, [state.positions.length]);

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
      setState((s) => ({ ...s, note: access.message, href: access.href }));
    } finally {
      setBusy(false);
    }
  }

  async function closePosition(row: Pos) {
    const wc = walletClientRef.current;
    if (!wc) return;
    setBusy(true);
    try {
      const { OrderSide, PerpsTimeInForce } = await import("@polymarket/client");
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(wc);
      const long = row.size > 0;
      await session.placeOrder({
        instrumentId: row.instrumentId,
        side: long ? OrderSide.SELL : OrderSide.BUY,
        quantity: String(Math.abs(row.size)),
        timeInForce: PerpsTimeInForce.IOC,
        reduceOnly: true,
        builderCode: BUILDER_CODE,
      } as never);
      await refresh();
    } catch (err) {
      setState((s) => ({ ...s, note: explainPerpsError(err).message }));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    const wc = walletClientRef.current;
    if (!wc) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(wc);
      await session.cancelOrder({ orderId: id as never });
      await refresh();
    } catch (err) {
      setState((s) => ({ ...s, note: explainPerpsError(err).message }));
    } finally {
      setBusy(false);
    }
  }

  const ratio = state.equity > 0 ? state.maint / state.equity : 0;
  const usedPct = state.equity > 0 ? state.used / state.equity : 0;
  const exposures = state.positions.map((p) => {
    const gap = gaps.find((g) => g.symbol === p.symbol);
    const side = p.size > 0 ? "Long" : "Short";
    return {
      symbol: p.symbol,
      side,
      title: gap?.title ?? "No mapped catalyst",
      eventId: gap?.eventId,
      score: gap?.score ?? 0,
      aligned: gap ? (p.size > 0 && gap.bias === "long") || (p.size < 0 && gap.bias === "short") : false,
    };
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Portfolio</h1>
          <p className="text-[12px] text-[#8b93a7]">Equity, risk, and event exposure on Polymarket Perps.</p>
        </div>
        <Link href="/markets" className="text-sm text-[#8b93a7] hover:text-white">
          Back to markets
        </Link>
      </div>

      {address || state.polymarketWallet ? (
        <PolyProfileCard eoa={address} polymarketWallet={state.polymarketWallet} />
      ) : null}

      {state.needsSignature ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void approvePerps()}
          className="rounded-md bg-[#3ee0a8] px-3 py-1.5 text-sm font-semibold text-[#07080c] disabled:opacity-40"
        >
          {busy ? "Waiting…" : "Connect Perps"}
        </button>
      ) : null}
      {state.note ? <p className="text-sm text-amber-200">{state.note}</p> : null}
      {state.href ? (
        <a href={state.href} target="_blank" rel="noreferrer" className="text-sm text-[#8bb4ff] hover:underline">
          Request Perps access
        </a>
      ) : null}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#1e2636] bg-[#1e2636] sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Equity" value={fmtUsd(state.equity)} />
        <Stat label="PnL" value={fmtUsdSigned(state.upnl)} tone={signedClass(state.upnl)} />
        <Stat label="Margin" value={fmtUsd(state.used)} />
        <Stat label="Available" value={fmtUsd(state.available)} />
        <Stat
          label="Realized"
          value={state.realized == null ? "—" : fmtUsdSigned(state.realized)}
          tone={state.realized == null ? "text-[#8b93a7]" : signedClass(state.realized)}
        />
        <div className="bg-[#10141c] px-4 py-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[#5c6478]">
            <span>Risk</span>
            {state.liquidation ? <Pill tone="danger">Liq</Pill> : null}
          </div>
          <div className={`mt-1 num text-lg ${ratio > 0.8 ? "text-rose-300" : "text-zinc-100"}`}>
            {(usedPct * 100).toFixed(1)}%
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full ${ratio > 0.8 ? "bg-rose-400" : "bg-[#3ee0a8]"}`}
              style={{ width: `${Math.min(100, usedPct * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-[#5c6478]">Maint {fmtUsd(state.maint)}</p>
        </div>
      </div>

      {state.funded && walletClient ? (
        <div className="rounded-xl border border-[#1e2636] bg-[#10141c] px-4 py-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-[#5c6478]">Deposit / Withdraw</p>
          <FundControls
            walletClient={walletClient}
            publicClient={publicClient}
            polymarketWallet={state.polymarketWallet}
            walletPusd={state.walletPusd}
            onDone={() => setRetry((n) => n + 1)}
          />
        </div>
      ) : null}

      <Section title="Event exposure">
        {exposures.length === 0 ? (
          <Empty text="No open positions mapped to events." />
        ) : (
          <ul className="space-y-1.5">
            {exposures.map((row) => (
              <li key={`${row.symbol}-${row.side}`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-zinc-200">
                  {row.title}
                  <span className="text-[#5c6478]"> → </span>
                  <Link
                    href={row.eventId ? `/markets/${row.symbol}?event=${row.eventId}` : `/markets/${row.symbol}`}
                    className={row.side === "Long" ? "text-emerald-300 hover:underline" : "text-rose-300 hover:underline"}
                  >
                    {row.symbol.replace("-USD", "")} {row.side}
                  </Link>
                </span>
                {row.score > 0 ? (
                  <span className="num text-[11px] text-[#8b93a7]">
                    score {Math.round(row.score)}
                    {row.aligned ? " · with signal" : " · vs signal"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Open positions">
        {state.positions.length === 0 ? (
          <Empty text="No open positions." />
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-[#5c6478]">
              <tr>
                <th className="py-2 font-medium">Symbol</th>
                <th className="font-medium">Side</th>
                <th className="font-medium">Size</th>
                <th className="font-medium">Entry</th>
                <th className="font-medium">Mark</th>
                <th className="font-medium">PnL</th>
                <th className="font-medium">Liq</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.positions.map((p) => {
                const mark = marks[p.symbol]?.markPrice;
                return (
                  <tr key={`${p.instrumentId}-${p.symbol}`} className="border-t border-[#1e2636]">
                    <td className="py-2">
                      <Link href={`/markets/${p.symbol}`} className="text-zinc-100 hover:underline">
                        {p.symbol.replace("-USD", "")}
                      </Link>
                    </td>
                    <td className={p.size > 0 ? "text-emerald-300" : "text-rose-300"}>
                      {p.size > 0 ? "Long" : "Short"}
                    </td>
                    <td className="num text-zinc-200">{Math.abs(p.size)}</td>
                    <td className="num text-zinc-300">{fmtPx(p.entry)}</td>
                    <td className="num text-zinc-300">{mark != null ? fmtPx(mark) : "—"}</td>
                    <td className={`num ${signedClass(p.pnl)}`}>{fmtUsdSigned(p.pnl)}</td>
                    <td className="num text-zinc-400">{fmtPx(p.liq)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void closePosition(p)}
                        className="text-xs text-[#8bb4ff] hover:underline disabled:opacity-40"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Open orders">
        {state.orders.length === 0 ? (
          <Empty text="No open orders." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-[#5c6478]">
              <tr>
                <th className="py-2 font-medium">Side</th>
                <th className="font-medium">Size</th>
                <th className="font-medium">Price</th>
                <th className="font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.orders.map((o) => (
                <tr key={o.id} className="border-t border-[#1e2636]">
                  <td className="py-2 capitalize text-zinc-200">{o.side}</td>
                  <td className="num">{o.quantity}</td>
                  <td className="num">{o.price}</td>
                  <td className="text-[#8b93a7]">{o.status}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void cancel(o.id)}
                      className="text-xs text-[#8bb4ff] hover:underline disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Trade history">
        {state.fills.length === 0 ? (
          <Empty text="No fills yet." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-[#5c6478]">
              <tr>
                <th className="py-2 font-medium">Side</th>
                <th className="font-medium">Size</th>
                <th className="font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {state.fills.map((f, i) => (
                <tr key={`${f.side}-${f.price}-${i}`} className="border-t border-[#1e2636]">
                  <td className="py-2 capitalize text-zinc-200">{f.side}</td>
                  <td className="num">{f.quantity}</td>
                  <td className="num">{f.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, tone = "text-zinc-100" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-[#10141c] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-[#5c6478]">{label}</div>
      <div className={`mt-1 num text-lg ${tone}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-[#1e2636] bg-[#10141c] px-4 py-3">
      <h2 className="mb-2 text-[11px] uppercase tracking-wide text-[#5c6478]">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-[#5c6478]">{text}</p>;
}
