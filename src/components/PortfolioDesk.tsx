"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/DataTable";
import { FundControls } from "@/components/FundControls";
import { PolyProfileCard } from "@/components/PolyProfile";
import { PerpsAccessAlert } from "@/components/PerpsAccessAlert";
import { Button } from "@/components/ui/button";
import { BUILDER_CODE } from "@/lib/builder";
import { assertCanTrade } from "@/lib/geo";
import { notifyErr, notifyOk } from "@/lib/notify";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { formatCloseQty, fmtPx, fmtStamp, fmtUsd, fmtUsdSigned, marketBase, orderTypeLabel, sideLabel, sideTone, signedClass } from "@/lib/format";
import { ERC20_BALANCE_ABI, formatPusd, PUSD_TOKEN } from "@/lib/pusd";
import { usePrivyMount } from "@/lib/usePrivyMount";
import { trackEvent } from "@/lib/track";
import type { GapRow, PerpsInstrument, PerpsTicker } from "@/lib/types";
import { cn } from "@/lib/utils";

type Pos = {
  instrumentId: number;
  symbol: string;
  size: number;
  sizeRaw: string;
  entry: number;
  leverage: number;
  pnl: number;
  liq: number;
  margin: number;
  funding: number;
  tp: string;
  sl: string;
};

type Order = {
  id: number;
  instrumentId: number;
  side: string;
  price: string;
  quantity: string;
  filled: string;
  status: string;
  timeInForce?: string;
  reduceOnly?: boolean;
  tpSlKind?: string;
  triggerPrice?: string;
  created?: number;
};

type Fill = {
  instrumentId: number;
  side: string;
  quantity: string;
  price: string;
  fee?: string;
  pnl?: string;
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
  access?: PerpsAccess | null;
  href?: string;
  polymarketWallet?: string;
  walletPusd?: string;
};

type Tab = "positions" | "orders" | "fills" | "exposure";

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
  if (mount !== "ready") return <LoggedOutPanel mount={mount} />;
  return <PortfolioDeskSession />;
}

function LoggedOutPanel({
  mount,
  onLogin,
}: {
  mount: ReturnType<typeof usePrivyMount>;
  onLogin?: () => void;
}) {
  const insecure = mount === "insecure";
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
      <div className="max-w-md">
        <h1 className="text-[22px] font-medium text-[var(--text)]">Portfolio</h1>
        <p className="mt-2 text-[13px] leading-5 text-[var(--muted)]">
          Equity, open positions, orders, and event exposure for the same Polymarket account you trade with.
        </p>
        {insecure ? (
          <p className="mt-4 text-[13px] text-[var(--warn)]">Open Leadgap over HTTPS to log in and trade.</p>
        ) : onLogin ? (
          <Button type="button" className="mt-5 h-10 rounded-[6px]" onClick={() => onLogin()}>
            Log in to Polymarket
          </Button>
        ) : (
          <p className="mt-4 text-[13px] text-[var(--muted)]">Log in from the header to load this page.</p>
        )}
      </div>
    </div>
  );
}

function PortfolioDeskSession() {
  const mount = "ready" as const;
  const { address, isConnected } = useAccount();
  const { login } = usePrivy();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const publicClient = usePublicClient({ chainId: polygon.id });
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;
  const signerReady = Boolean(walletClient?.account?.address);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("positions");
  const [marks, setMarks] = useState<Record<string, PerpsTicker>>({});
  const [qtyDecimals, setQtyDecimals] = useState<Record<number, number>>({});
  const [names, setNames] = useState<Record<number, string>>({});
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
      const tpSl: Record<number, { tp: string; sl: string }> = {};
      for (const o of openOrders ?? []) {
        const id = Number(o.instrumentId);
        const kind = o.tpSl?.kind;
        const trigger = o.tpSl?.triggerPrice;
        if (!kind || trigger == null || !Number.isFinite(id)) continue;
        const cur = tpSl[id] ?? { tp: "", sl: "" };
        if (kind === "tp") cur.tp = String(trigger);
        if (kind === "sl") cur.sl = String(trigger);
        tpSl[id] = cur;
      }
      const positions = (portfolio.positions ?? [])
        .filter((p) => Number(p.size) !== 0)
        .map((p) => {
          const id = Number(p.instrumentId);
          return {
            instrumentId: id,
            symbol: p.symbol,
            size: num(p.size),
            sizeRaw: String(p.size),
            entry: num(p.entryPrice),
            leverage: Number(p.leverage) || 0,
            pnl: num(p.unrealizedPnl),
            liq: num(p.liquidationPrice),
            margin: num(p.initialMargin),
            funding: num(p.cumulativeFunding),
            tp: tpSl[id]?.tp ?? "",
            sl: tpSl[id]?.sl ?? "",
          };
        });
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
          instrumentId: Number(f.instrumentId),
          side: String(f.side),
          quantity: String(f.quantity),
          price: String(f.price),
          fee: "fee" in f ? String((f as { fee?: string }).fee ?? "") : "",
          pnl: "pnl" in f ? String((f as { pnl?: string }).pnl ?? "") : "",
          time: Number(f.timestamp) || undefined,
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
        available: extra.availableOrderMargin ? num(extra.availableOrderMargin) : num(portfolio.withdrawable),
        upnl: positions.reduce((s, p) => s + p.pnl, 0),
        realized,
        positions,
        orders: (openOrders ?? []).map((o) => ({
          id: Number(o.id),
          instrumentId: Number(o.instrumentId),
          side: String(o.side),
          price: String(o.price),
          quantity: String(o.quantity),
          filled: String(o.filledQuantity ?? ""),
          status: String(o.status),
          timeInForce: o.timeInForce != null ? String(o.timeInForce) : undefined,
          reduceOnly: Boolean(o.reduceOnly),
          tpSlKind: o.tpSl?.kind,
          triggerPrice: o.tpSl?.triggerPrice != null ? String(o.tpSl.triggerPrice) : undefined,
          created: Number(o.createdTimestamp) || undefined,
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
        access: access.kind === "invite" ? access : null,
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
      .then((d: { tickers?: Record<string, PerpsTicker>; instruments?: PerpsInstrument[] }) => {
        setMarks(d.tickers ?? {});
        const next: Record<number, number> = {};
        const symbols: Record<number, string> = {};
        for (const inst of d.instruments ?? []) {
          next[inst.instrumentId] = inst.quantityDecimals;
          symbols[inst.instrumentId] = inst.symbol;
        }
        setQtyDecimals(next);
        setNames(symbols);
      })
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
      setState((s) => ({
        ...s,
        note: access.message,
        access: access.kind === "invite" ? access : null,
        href: access.href,
      }));
      notifyErr(access.message);
    } finally {
      setBusy(false);
    }
  }

  async function closePosition(row: Pos) {
    const wc = walletClientRef.current;
    if (!wc) return;
    setBusy(true);
    try {
      await assertCanTrade();
      const { OrderSide, PerpsTimeInForce } = await import("@polymarket/client");
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(wc);
      const long = row.size > 0;
      await session.placeOrder({
        instrumentId: row.instrumentId,
        side: long ? OrderSide.SELL : OrderSide.BUY,
        quantity: formatCloseQty(row.sizeRaw, qtyDecimals[row.instrumentId]),
        timeInForce: PerpsTimeInForce.IOC,
        reduceOnly: true,
        builderCode: BUILDER_CODE,
      } as never);
      trackEvent("close_position", { symbol: row.symbol });
      await refresh();
      notifyOk("Position closed.");
    } catch (err) {
      const message = explainPerpsError(err).message;
      setState((s) => ({ ...s, note: message }));
      notifyErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    const wc = walletClientRef.current;
    if (!wc) return;
    setBusy(true);
    try {
      await assertCanTrade();
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(wc);
      await session.cancelOrder({ orderId: id as never });
      await refresh();
      notifyOk("Order canceled.");
    } catch (err) {
      const message = explainPerpsError(err).message;
      setState((s) => ({ ...s, note: message }));
      notifyErr(message);
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) return <LoggedOutPanel mount="ready" onLogin={login} />;

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

  const tabs: { id: Tab; label: string }[] = [
    { id: "positions", label: "Positions" },
    { id: "orders", label: `Orders (${state.orders.length})` },
    { id: "fills", label: `Fills (${state.fills.length})` },
    { id: "exposure", label: "Event exposure" },
  ];

  const rail = (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-[var(--line)] px-4 py-4 lg:w-[280px] lg:border-l">
      {address || state.polymarketWallet ? (
        <PolyProfileCard eoa={address} polymarketWallet={state.polymarketWallet} />
      ) : null}
      <div>
        <p className="text-[11px] text-[var(--dim)]">Fund</p>
        <div className="mt-1">
          <FundControls />
        </div>
        {state.walletPusd ? (
          <p className="mt-1 num text-[12px] text-[var(--muted)]">{state.walletPusd} on Polymarket</p>
        ) : null}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-[var(--line)] px-4 py-3">
        <Kpi label="Equity" value={fmtUsd(state.equity)} />
        <Kpi label="uPnL" value={fmtUsdSigned(state.upnl)} className={signedClass(state.upnl)} />
        <Kpi label="Margin" value={fmtUsd(state.used)} />
        <Kpi label="Available" value={fmtUsd(state.available)} />
        <Kpi
          label="Realized"
          value={state.realized == null ? "—" : fmtUsdSigned(state.realized)}
          className={state.realized == null ? "text-[var(--muted)]" : signedClass(state.realized)}
        />
        <div className="min-w-[7rem]">
          <p className="text-[11px] text-[var(--dim)]">
            Risk
            {state.liquidation ? <span className="ml-1.5 text-[var(--short)]">Liq</span> : null}
          </p>
          <p className={cn("num text-[15px]", ratio > 0.8 ? "text-[var(--short)]" : "text-[var(--text)]")}>
            {(usedPct * 100).toFixed(1)}%
          </p>
          <p className="text-[11px] text-[var(--dim)]">Maint {fmtUsd(state.maint)}</p>
        </div>
      </div>

      {state.access ? (
        <PerpsAccessAlert access={state.access} />
      ) : state.needsSignature || state.note || state.href ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2 text-[13px]">
          {state.needsSignature ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void approvePerps()}>
              {busy ? "Waiting…" : "Connect Perps"}
            </Button>
          ) : null}
          {state.note ? <p className="text-[var(--warn)]">{state.note}</p> : null}
          {state.href ? (
            <a href={state.href} target="_blank" rel="noreferrer" className="text-[var(--text)] hover:underline">
              Request Perps access
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--line)] px-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "shrink-0 border-b-2 px-2 py-1.5 text-[12px] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--odds)_40%,transparent)]",
                  tab === item.id
                    ? "border-[var(--text)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {tab === "positions" ? (
              state.positions.length === 0 ? (
                <Empty text="No open positions" href="/markets" action="Open Markets" />
              ) : (
                <DataTable containerClassName="min-h-0">
                  <DataTableHeader>
                    <tr>
                      <DataTableHead>Market</DataTableHead>
                      <DataTableHead align="right">Size</DataTableHead>
                      <DataTableHead align="right">Entry</DataTableHead>
                      <DataTableHead align="right">Mark</DataTableHead>
                      <DataTableHead align="right">PnL</DataTableHead>
                      <DataTableHead align="right">Liq</DataTableHead>
                      <DataTableHead align="right">Margin</DataTableHead>
                      <DataTableHead align="right">Funding</DataTableHead>
                      <DataTableHead align="right">TP</DataTableHead>
                      <DataTableHead align="right">SL</DataTableHead>
                      <DataTableHead />
                    </tr>
                  </DataTableHeader>
                  <DataTableBody>
                    {state.positions.map((p) => {
                      const mark = marks[p.symbol]?.markPrice;
                      return (
                        <DataTableRow key={`${p.instrumentId}-${p.symbol}`}>
                          <DataTableCell>
                            <Link href={`/markets/${p.symbol}`} className="text-[var(--text)] hover:underline">
                              {p.symbol.replace("-USD", "")}
                            </Link>
                          </DataTableCell>
                          <DataTableCell numeric className={p.size > 0 ? "text-[var(--long)]" : "text-[var(--short)]"}>
                            {p.size}
                          </DataTableCell>
                          <DataTableCell numeric>{fmtPx(p.entry)}</DataTableCell>
                          <DataTableCell numeric>{mark != null ? fmtPx(mark) : "—"}</DataTableCell>
                          <DataTableCell numeric className={signedClass(p.pnl)}>
                            {fmtUsdSigned(p.pnl)}
                          </DataTableCell>
                          <DataTableCell numeric>{fmtPx(p.liq)}</DataTableCell>
                          <DataTableCell numeric>{fmtUsd(p.margin)}</DataTableCell>
                          <DataTableCell numeric className={signedClass(p.funding)}>
                            {fmtUsdSigned(p.funding)}
                          </DataTableCell>
                          <DataTableCell numeric>{p.tp ? fmtPx(Number(p.tp)) : "—"}</DataTableCell>
                          <DataTableCell numeric>{p.sl ? fmtPx(Number(p.sl)) : "—"}</DataTableCell>
                          <DataTableCell align="right">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void closePosition(p)}
                              className="text-[12px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                            >
                              Close
                            </button>
                          </DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </DataTableBody>
                </DataTable>
              )
            ) : null}
            {tab === "orders" ? (
              state.orders.length === 0 ? (
                <Empty text="No open orders" />
              ) : (
                <DataTable>
                  <DataTableHeader>
                    <tr>
                      <DataTableHead>Market</DataTableHead>
                      <DataTableHead>Side</DataTableHead>
                      <DataTableHead>Type</DataTableHead>
                      <DataTableHead align="right">Size</DataTableHead>
                      <DataTableHead align="right">Filled</DataTableHead>
                      <DataTableHead align="right">Price</DataTableHead>
                      <DataTableHead>Status</DataTableHead>
                      <DataTableHead align="right">Time</DataTableHead>
                      <DataTableHead />
                    </tr>
                  </DataTableHeader>
                  <DataTableBody>
                    {state.orders.map((o) => {
                      const px = o.triggerPrice || o.price;
                      const href = names[o.instrumentId] ? `/markets/${names[o.instrumentId]}` : undefined;
                      return (
                        <DataTableRow key={o.id}>
                          <DataTableCell>
                            {href ? (
                              <Link href={href} className="text-[var(--text)] hover:underline">
                                {marketBase(names[o.instrumentId])}
                              </Link>
                            ) : (
                              marketBase(names[o.instrumentId])
                            )}
                          </DataTableCell>
                          <DataTableCell className={sideTone(o.side)}>{sideLabel(o.side)}</DataTableCell>
                          <DataTableCell>{orderTypeLabel(o)}</DataTableCell>
                          <DataTableCell numeric>{o.quantity}</DataTableCell>
                          <DataTableCell numeric>{o.filled || "—"}</DataTableCell>
                          <DataTableCell numeric>{fmtPx(Number(px))}</DataTableCell>
                          <DataTableCell className="capitalize">{o.status.toLowerCase()}</DataTableCell>
                          <DataTableCell numeric className="text-[var(--dim)]">
                            {fmtStamp(o.created)}
                          </DataTableCell>
                          <DataTableCell align="right">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void cancel(o.id)}
                              className="text-[12px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </DataTableBody>
                </DataTable>
              )
            ) : null}
            {tab === "fills" ? (
              state.fills.length === 0 ? (
                <Empty text="No fills yet" />
              ) : (
                <DataTable>
                  <DataTableHeader>
                    <tr>
                      <DataTableHead>Time</DataTableHead>
                      <DataTableHead>Market</DataTableHead>
                      <DataTableHead>Side</DataTableHead>
                      <DataTableHead align="right">Size</DataTableHead>
                      <DataTableHead align="right">Price</DataTableHead>
                      <DataTableHead align="right">Fee</DataTableHead>
                      <DataTableHead align="right">PnL</DataTableHead>
                    </tr>
                  </DataTableHeader>
                  <DataTableBody>
                    {state.fills.map((f, i) => {
                      const href = names[f.instrumentId] ? `/markets/${names[f.instrumentId]}` : undefined;
                      return (
                        <DataTableRow key={`${f.instrumentId}-${f.time ?? i}-${i}`}>
                          <DataTableCell numeric className="text-[var(--dim)]">
                            {fmtStamp(f.time)}
                          </DataTableCell>
                          <DataTableCell>
                            {href ? (
                              <Link href={href} className="text-[var(--text)] hover:underline">
                                {marketBase(names[f.instrumentId])}
                              </Link>
                            ) : (
                              marketBase(names[f.instrumentId])
                            )}
                          </DataTableCell>
                          <DataTableCell className={sideTone(f.side)}>{sideLabel(f.side)}</DataTableCell>
                          <DataTableCell numeric>{f.quantity}</DataTableCell>
                          <DataTableCell numeric>{fmtPx(Number(f.price))}</DataTableCell>
                          <DataTableCell numeric className="text-[var(--dim)]">
                            {f.fee ? fmtUsd(f.fee) : "—"}
                          </DataTableCell>
                          <DataTableCell numeric className={f.pnl ? signedClass(Number(f.pnl)) : "text-[var(--dim)]"}>
                            {f.pnl ? fmtUsdSigned(f.pnl) : "—"}
                          </DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </DataTableBody>
                </DataTable>
              )
            ) : null}
            {tab === "exposure" ? (
              exposures.length === 0 ? (
                <Empty text="No open positions mapped to events" href="/markets" action="Open Markets" />
              ) : (
                <ul className="divide-y divide-[var(--line)] px-4 py-1">
                  {exposures.map((row) => (
                    <li key={`${row.symbol}-${row.side}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[13px]">
                      <span className="min-w-0 text-[var(--text)]">
                        {row.title}
                        <span className="text-[var(--dim)]"> → </span>
                        <Link
                          href={row.eventId ? `/markets/${row.symbol}?event=${row.eventId}` : `/markets/${row.symbol}`}
                          className={row.side === "Long" ? "text-[var(--long)] hover:underline" : "text-[var(--short)] hover:underline"}
                        >
                          {row.symbol.replace("-USD", "")} {row.side}
                        </Link>
                      </span>
                      {row.score > 0 ? (
                        <span className="num shrink-0 text-[12px] text-[var(--muted)]">
                          score {Math.round(row.score)}
                          {row.aligned ? " · with signal" : " · vs signal"}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </div>
        {rail}
      </div>
    </div>
  );
}

function Kpi({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--dim)]">{label}</p>
      <p className={cn("num text-[15px] text-[var(--text)]", className)}>{value}</p>
    </div>
  );
}

function Empty({ text, href, action }: { text: string; href?: string; action?: string }) {
  return (
    <div className="px-4 py-8 text-[13px] text-[var(--muted)]">
      <p>{text}</p>
      {href && action ? (
        <Link
          href={href}
          className="lg-focus mt-2 inline-block text-[var(--text)] underline underline-offset-2"
        >
          {action}
        </Link>
      ) : null}
    </div>
  );
}
