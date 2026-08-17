"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { assertCanTrade } from "@/lib/geo";
import { notifyErr, notifyOk } from "@/lib/notify";
import { PerpsAccessAlert } from "@/components/PerpsAccessAlert";
import { usePerpsStrip } from "@/components/PortfolioStrip";
import {
  formatCloseQty,
  fmtFunding,
  fmtPx,
  fmtStamp,
  fmtUsd,
  fmtUsdSigned,
  marketBase,
  orderTypeLabel,
  sideLabel,
  sideTone,
  signedClass,
} from "@/lib/format";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { TicketPreview } from "@/components/OrderTicket";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

type Tab = "positions" | "orders" | "fills";

type PositionRow = {
  instrumentId: number;
  symbol: string;
  size: string;
  entryPrice: string;
  leverage: number;
  unrealizedPnl: string;
  liquidationPrice: string;
  margin: string;
  funding: string;
  tp: string;
  sl: string;
};

type OrderRow = {
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

type FillRow = {
  instrumentId: number;
  side: string;
  quantity: string;
  price: string;
  fee?: string;
  pnl?: string;
  time?: number;
};

export function Blotter({
  instrumentId,
  symbol,
  preview,
  ticker,
  priceDecimals = 2,
}: {
  instrumentId: number;
  symbol: string;
  preview?: TicketPreview | null;
  ticker?: PerpsTicker;
  priceDecimals?: number;
}) {
  const mount = usePrivyMount();
  if (mount !== "ready") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
        <div className="flex items-center gap-1 border-b border-[var(--line)] px-2">
          <span className="px-2 py-1.5 text-[12px] text-[var(--muted)]">Positions</span>
          <Link href="/portfolio" className="ml-auto px-2 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)]">
            Portfolio
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-center px-4 py-6 text-[12px]">
          <p className="text-[var(--text)]">No open positions</p>
          <p className="mt-1 text-[var(--muted)]">
            {mount === "insecure" ? "HTTPS required to log in." : "Log in to see positions and orders."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <BlotterSession
      instrumentId={instrumentId}
      symbol={symbol}
      preview={preview}
      ticker={ticker}
      priceDecimals={priceDecimals}
    />
  );
}

function BlotterSession({
  instrumentId,
  symbol,
  preview,
  ticker,
  priceDecimals,
}: {
  instrumentId: number;
  symbol: string;
  preview?: TicketPreview | null;
  ticker?: PerpsTicker;
  priceDecimals: number;
}) {
  const mount = "ready" as const;
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const [tab, setTab] = useState<Tab>("positions");
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fills, setFills] = useState<FillRow[]>([]);
  const [note, setNote] = useState("Log in to see positions and orders.");
  const [access, setAccess] = useState<PerpsAccess | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [tpDraft, setTpDraft] = useState("");
  const [slDraft, setSlDraft] = useState("");
  const strip = usePerpsStrip();
  const stripInvite = strip?.state.access?.kind === "invite" ? strip.state.access : null;

  const refresh = useCallback(async () => {
    if (mount !== "ready" || !isConnected || !walletClient) {
      setNote("Log in to see positions and orders.");
      setAccess(null);
      setPositions([]);
      setOrders([]);
      setFills([]);
      return;
    }
    if (stripInvite) {
      setAccess(stripInvite);
      setNote(stripInvite.message);
      setPositions([]);
      setOrders([]);
      setFills([]);
      return;
    }
    try {
      const { resumePerpsSession } = await import("@/lib/perpsSession");
      const opened = await resumePerpsSession(walletClient);
      if (!opened) {
        setNote("Connect Perps to load the blotter.");
        setAccess(null);
        return;
      }
      const { session } = opened;
      const portfolio = await session.fetchPortfolio();
      const open = await session.fetchOpenOrders().catch(() => []);
      const tpSl: Record<number, { tp: string; sl: string }> = {};
      for (const o of open ?? []) {
        const id = Number(o.instrumentId);
        const kind = o.tpSl?.kind;
        const trigger = o.tpSl?.triggerPrice;
        if (!kind || trigger == null || !Number.isFinite(id)) continue;
        const cur = tpSl[id] ?? { tp: "", sl: "" };
        if (kind === "tp") cur.tp = String(trigger);
        if (kind === "sl") cur.sl = String(trigger);
        tpSl[id] = cur;
      }
      setPositions(
        (portfolio.positions ?? [])
          .filter((p) => Number(p.size) !== 0)
          .map((p) => {
            const id = Number(p.instrumentId ?? instrumentId);
            return {
              instrumentId: id,
              symbol: p.symbol,
              size: String(p.size),
              entryPrice: String(p.entryPrice),
              leverage: Number(p.leverage),
              unrealizedPnl: String(p.unrealizedPnl),
              liquidationPrice: String(p.liquidationPrice),
              margin: String(p.initialMargin ?? ""),
              funding: String(p.cumulativeFunding ?? ""),
              tp: tpSl[id]?.tp ?? "",
              sl: tpSl[id]?.sl ?? "",
            };
          }),
      );
      setOrders(
        (open ?? []).map((o) => ({
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
      );
      try {
        const page = await session.listFills().firstPage();
        const items = page.items ?? [];
        setFills(
          items.slice(0, 24).map((f) => ({
            instrumentId: Number(f.instrumentId),
            side: String(f.side),
            quantity: String(f.quantity),
            price: String(f.price),
            fee: "fee" in f ? String((f as { fee?: string }).fee ?? "") : "",
            pnl: "pnl" in f ? String((f as { pnl?: string }).pnl ?? "") : "",
            time: Number(f.timestamp) || undefined,
          })),
        );
      } catch {
        setFills([]);
      }
      setNote("");
      setAccess(null);
    } catch (err) {
      const next = explainPerpsError(err);
      setAccess(next.kind === "invite" ? next : null);
      setNote(next.message);
    }
  }, [instrumentId, isConnected, mount, stripInvite, walletClient]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d: { instruments?: PerpsInstrument[] }) => {
        const next: Record<number, string> = { [instrumentId]: symbol };
        for (const inst of d.instruments ?? []) next[inst.instrumentId] = inst.symbol;
        setNames(next);
      })
      .catch(() => setNames({ [instrumentId]: symbol }));
  }, [instrumentId, symbol]);

  async function closePosition(row: PositionRow) {
    if (!walletClient) return;
    setBusy(true);
    try {
      await assertCanTrade();
      const { OrderSide, PerpsTimeInForce } = await import("@polymarket/client");
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      const long = Number(row.size) > 0;
      await session.placeOrder({
        instrumentId: row.instrumentId,
        side: long ? OrderSide.SELL : OrderSide.BUY,
        quantity: formatCloseQty(row.size),
        timeInForce: PerpsTimeInForce.IOC,
        reduceOnly: true,
        builderCode: BUILDER_CODE,
      } as never);
      await refresh();
      notifyOk("Position closed.");
    } catch (err) {
      const next = explainPerpsError(err);
      setAccess(next.kind === "invite" ? next : null);
      const message = next.message;
      setNote(message);
      notifyErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    if (!walletClient) return;
    setBusy(true);
    try {
      await assertCanTrade();
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      await session.cancelOrder({ orderId: id as never });
      await refresh();
      notifyOk("Order canceled.");
    } catch (err) {
      const next = explainPerpsError(err);
      setAccess(next.kind === "invite" ? next : null);
      const message = next.message;
      setNote(message);
      notifyErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function setPositionTpSl(row: PositionRow) {
    if (!walletClient) return;
    if (!tpDraft && !slDraft) return;
    setBusy(true);
    try {
      await assertCanTrade();
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      if (tpDraft && slDraft) {
        await session.placePositionTpSl({
          instrumentId: row.instrumentId,
          takeProfit: { triggerPrice: tpDraft },
          stopLoss: { triggerPrice: slDraft },
        });
      } else if (tpDraft) {
        await session.placePositionTpSl({
          instrumentId: row.instrumentId,
          takeProfit: { triggerPrice: tpDraft },
        });
      } else {
        await session.placePositionTpSl({
          instrumentId: row.instrumentId,
          stopLoss: { triggerPrice: slDraft },
        });
      }
      await refresh();
      setEditId(null);
      notifyOk("TP/SL updated.");
    } catch (err) {
      const next = explainPerpsError(err);
      setAccess(next.kind === "invite" ? next : null);
      const message = next.message;
      setNote(message);
      notifyErr(message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: PositionRow) {
    setEditId(row.instrumentId);
    setTpDraft(row.tp);
    setSlDraft(row.sl);
  }

  const field = "lg-input num w-[3.25rem] px-1 py-0.5 text-[10px]";

  function marketFor(id: number): string {
    return marketBase(names[id] ?? (id === instrumentId ? symbol : null));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "positions", label: "Positions" },
    { id: "orders", label: `Orders (${orders.length})` },
    { id: "fills", label: `Fills (${fills.length})` },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--line)] px-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`lg-focus border-b-2 px-2 py-1.5 text-[12px] ${
              tab === item.id
                ? "border-[var(--text)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {item.label}
          </button>
        ))}
        <Link href="/portfolio" className="lg-focus px-2 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)]">
          Portfolio
        </Link>
        {note && !access ? <span className="ml-auto truncate text-[12px] text-[var(--dim)]">{note}</span> : null}
      </div>
      {access ? <PerpsAccessAlert access={access} /> : null}
      <div className="min-h-0 flex-1 overflow-auto px-2 py-1 text-[11px]">
        {tab === "positions" ? (
          <table className="lg-table w-full min-w-[720px] text-left">
            <thead>
              <tr>
                <th className="py-1">Market</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>PnL</th>
                <th>Liq</th>
                <th>Margin</th>
                <th>Funding</th>
                <th>TP</th>
                <th>SL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && !preview ? (
                <tr>
                  <td colSpan={11} className="py-1.5 text-[var(--dim)]">
                    No open positions
                  </td>
                </tr>
              ) : null}
              {positions.length === 0 && preview ? (
                <tr>
                  <td className="py-1.5 text-[var(--muted)]">Ticket</td>
                  <td className="num">{preview.qty || "—"}</td>
                  <td className="num">{preview.price ? fmtPx(preview.price, priceDecimals) : "—"}</td>
                  <td className="num">{ticker ? fmtPx(ticker.markPrice, priceDecimals) : "—"}</td>
                  <td className="num text-[var(--dim)]">—</td>
                  <td className="num">{preview.liq != null ? fmtPx(preview.liq, priceDecimals) : "—"}</td>
                  <td className="num">{preview.margin ? fmtUsd(preview.margin) : "—"}</td>
                  <td className={`num ${ticker ? signedClass(ticker.fundingRate) : ""}`}>
                    {ticker ? fmtFunding(ticker.fundingRate) : "—"}
                  </td>
                  <td className="num">{preview.tp ? fmtPx(Number(preview.tp), priceDecimals) : "—"}</td>
                  <td className="num">{preview.sl ? fmtPx(Number(preview.sl), priceDecimals) : "—"}</td>
                  <td className="text-[var(--dim)]">Before fill</td>
                </tr>
              ) : null}
              {positions.map((p) => {
                const editing = editId === p.instrumentId;
                const on = p.instrumentId === instrumentId;
                const digits = on ? priceDecimals : 2;
                return (
                  <tr key={`${p.instrumentId}-${p.symbol}`}>
                    <td className="py-1.5">
                      <Link href={`/markets/${p.symbol}`} className="text-[var(--text)] hover:underline">
                        {p.symbol.replace("-USD", "")}
                      </Link>
                    </td>
                    <td className="num">{p.size}</td>
                    <td className="num">{fmtPx(Number(p.entryPrice), digits)}</td>
                    <td className="num">{on && ticker ? fmtPx(ticker.markPrice, digits) : "—"}</td>
                    <td className={`num ${signedClass(Number(p.unrealizedPnl))}`}>{fmtUsdSigned(p.unrealizedPnl)}</td>
                    <td className="num">{fmtPx(Number(p.liquidationPrice), digits)}</td>
                    <td className="num">{fmtUsd(p.margin)}</td>
                    <td className={`num ${signedClass(Number(p.funding))}`}>{fmtUsdSigned(p.funding)}</td>
                    <td className="num">
                      {editing ? (
                        <input
                          value={tpDraft}
                          onChange={(e) => setTpDraft(e.target.value)}
                          placeholder="TP"
                          aria-label="Take profit"
                          className={field}
                        />
                      ) : p.tp ? (
                        fmtPx(Number(p.tp), digits)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {editing ? (
                        <input
                          value={slDraft}
                          onChange={(e) => setSlDraft(e.target.value)}
                          placeholder="SL"
                          aria-label="Stop loss"
                          className={field}
                        />
                      ) : p.sl ? (
                        fmtPx(Number(p.sl), digits)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setPositionTpSl(p)}
                            className="mr-2 text-[var(--signal)] hover:underline"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEditId(null)}
                            className="text-[var(--dim)] hover:text-[var(--muted)]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEdit(p)}
                            className="mr-2 text-[var(--signal)] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void closePosition(p)}
                            className="text-[var(--perp)] hover:underline"
                          >
                            Close
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        {tab === "orders" ? (
          <table className="lg-table w-full min-w-[640px] text-left">
            <thead>
              <tr>
                <th className="py-1">Market</th>
                <th>Side</th>
                <th>Type</th>
                <th>Size</th>
                <th>Filled</th>
                <th>Price</th>
                <th>Status</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-1.5 text-[var(--dim)]">
                    No open orders
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const px = o.triggerPrice || o.price;
                  const sym = names[o.instrumentId] ?? (o.instrumentId === instrumentId ? symbol : "");
                  return (
                    <tr key={o.id} className={o.instrumentId === instrumentId ? undefined : "text-[var(--muted)]"}>
                      <td className="py-1.5">
                        {sym ? (
                          <Link href={`/markets/${sym}`} className="text-[var(--text)] hover:underline">
                            {marketBase(sym)}
                          </Link>
                        ) : (
                          marketFor(o.instrumentId)
                        )}
                      </td>
                      <td className={sideTone(o.side)}>{sideLabel(o.side)}</td>
                      <td>{orderTypeLabel(o)}</td>
                      <td className="num">{o.quantity}</td>
                      <td className="num">{o.filled || "—"}</td>
                      <td className="num">{fmtPx(Number(px), o.instrumentId === instrumentId ? priceDecimals : 2)}</td>
                      <td className="capitalize">{o.status.toLowerCase()}</td>
                      <td className="num text-[var(--dim)]">{fmtStamp(o.created)}</td>
                      <td className="whitespace-nowrap">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void cancel(o.id)}
                          className="text-[var(--perp)] hover:underline disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : null}
        {tab === "fills" ? (
          <table className="lg-table w-full min-w-[560px] text-left">
            <thead>
              <tr>
                <th className="py-1">Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Size</th>
                <th>Price</th>
                <th>Fee</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {fills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-1.5 text-[var(--dim)]">
                    No fills yet
                  </td>
                </tr>
              ) : (
                fills.map((f, i) => {
                  const sym = names[f.instrumentId] ?? (f.instrumentId === instrumentId ? symbol : "");
                  return (
                  <tr key={`${f.instrumentId}-${f.time ?? i}-${i}`}>
                    <td className="num py-1.5 text-[var(--dim)]">{fmtStamp(f.time)}</td>
                    <td>
                      {sym ? (
                        <Link href={`/markets/${sym}`} className="text-[var(--text)] hover:underline">
                          {marketBase(sym)}
                        </Link>
                      ) : (
                        marketFor(f.instrumentId)
                      )}
                    </td>
                    <td className={sideTone(f.side)}>{sideLabel(f.side)}</td>
                    <td className="num">{f.quantity}</td>
                    <td className="num">{fmtPx(Number(f.price), f.instrumentId === instrumentId ? priceDecimals : 2)}</td>
                    <td className="num text-[var(--dim)]">{f.fee ? fmtUsd(f.fee) : "—"}</td>
                    <td className={`num ${f.pnl ? signedClass(Number(f.pnl)) : "text-[var(--dim)]"}`}>
                      {f.pnl ? fmtUsdSigned(f.pnl) : "—"}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
