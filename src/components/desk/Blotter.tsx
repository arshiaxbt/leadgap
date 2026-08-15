"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { explainPerpsError } from "@/lib/perpsAccess";
import { fmtFunding, fmtPx, fmtUsd, fmtUsdSigned, signedClass } from "@/lib/format";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { TicketPreview } from "@/components/OrderTicket";
import type { PerpsTicker } from "@/lib/types";

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
};

type OrderRow = {
  id: number;
  side: string;
  price: string;
  quantity: string;
  status: string;
  tpSlKind?: string;
  triggerPrice?: string;
};

type FillRow = {
  side: string;
  quantity: string;
  price: string;
};

export function Blotter({
  instrumentId,
  preview,
  ticker,
  priceDecimals = 2,
}: {
  instrumentId: number;
  preview?: TicketPreview | null;
  ticker?: PerpsTicker;
  priceDecimals?: number;
}) {
  const mount = usePrivyMount();
  if (mount !== "ready") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
        <div className="lg-toolbar">
          <span className="lg-label">Blotter</span>
          <Link href="/portfolio" className="px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]">
            Account
          </Link>
          <span className="ml-auto truncate text-[var(--dim)]">
            {mount === "insecure" ? "HTTPS required to log in." : "Log in to see positions and orders."}
          </span>
        </div>
      </div>
    );
  }
  return (
    <BlotterSession
      instrumentId={instrumentId}
      preview={preview}
      ticker={ticker}
      priceDecimals={priceDecimals}
    />
  );
}

function BlotterSession({
  instrumentId,
  preview,
  ticker,
  priceDecimals,
}: {
  instrumentId: number;
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
  const [busy, setBusy] = useState(false);
  const [tpDraft, setTpDraft] = useState("");
  const [slDraft, setSlDraft] = useState("");

  const refresh = useCallback(async () => {
    if (mount !== "ready" || !isConnected || !walletClient) {
      setNote("Log in to see positions and orders.");
      setPositions([]);
      setOrders([]);
      return;
    }
    try {
      const { resumePerpsSession } = await import("@/lib/perpsSession");
      const opened = await resumePerpsSession(walletClient);
      if (!opened) {
        setNote("Connect Perps to load the blotter.");
        return;
      }
      const { session } = opened;
      const portfolio = await session.fetchPortfolio();
      setPositions(
        (portfolio.positions ?? [])
          .filter((p) => Number(p.size) !== 0)
          .map((p) => ({
            instrumentId: Number(p.instrumentId ?? instrumentId),
            symbol: p.symbol,
            size: String(p.size),
            entryPrice: String(p.entryPrice),
            leverage: Number(p.leverage),
            unrealizedPnl: String(p.unrealizedPnl),
            liquidationPrice: String(p.liquidationPrice),
            margin: String(p.initialMargin ?? ""),
            funding: String(p.cumulativeFunding ?? ""),
          })),
      );
      const open = await session.fetchOpenOrders().catch(() => []);
      setOrders(
        (open ?? []).map((o) => ({
          id: Number(o.id),
          side: String(o.side),
          price: String(o.price),
          quantity: String(o.quantity),
          status: String(o.status),
          tpSlKind: o.tpSl?.kind,
          triggerPrice: o.tpSl?.triggerPrice != null ? String(o.tpSl.triggerPrice) : undefined,
        })),
      );
      const liveTp = (open ?? []).find((o) => Number(o.instrumentId) === instrumentId && o.tpSl?.kind === "tp");
      const liveSl = (open ?? []).find((o) => Number(o.instrumentId) === instrumentId && o.tpSl?.kind === "sl");
      setTpDraft(liveTp?.tpSl?.triggerPrice != null ? String(liveTp.tpSl.triggerPrice) : "");
      setSlDraft(liveSl?.tpSl?.triggerPrice != null ? String(liveSl.tpSl.triggerPrice) : "");
      try {
        const page = await session.listFills().firstPage();
        const items = page.items ?? [];
        setFills(
          items.slice(0, 12).map((f) => ({
            side: String(f.side),
            quantity: String(f.quantity),
            price: String(f.price),
          })),
        );
      } catch {
        setFills([]);
      }
      setNote("");
    } catch (err) {
      setNote(explainPerpsError(err).message);
    }
  }, [instrumentId, isConnected, mount, walletClient]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function closePosition(row: PositionRow) {
    if (!walletClient) return;
    setBusy(true);
    try {
      const { OrderSide, PerpsTimeInForce } = await import("@polymarket/client");
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      const size = Math.abs(Number(row.size));
      const long = Number(row.size) > 0;
      await session.placeOrder({
        instrumentId: row.instrumentId,
        side: long ? OrderSide.SELL : OrderSide.BUY,
        quantity: String(size),
        timeInForce: PerpsTimeInForce.IOC,
        reduceOnly: true,
        builderCode: BUILDER_CODE,
      } as never);
      await refresh();
    } catch (err) {
      setNote(explainPerpsError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    if (!walletClient) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      await session.cancelOrder({ orderId: id as never });
      await refresh();
    } catch (err) {
      setNote(explainPerpsError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function setPositionTpSl(row: PositionRow) {
    if (!walletClient) return;
    if (!tpDraft && !slDraft) return;
    setBusy(true);
    try {
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
    } catch (err) {
      setNote(explainPerpsError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const live = positions.find((p) => p.instrumentId === instrumentId) ?? null;
  const liveTp = orders.find((o) => o.tpSlKind === "tp")?.triggerPrice ?? "";
  const liveSl = orders.find((o) => o.tpSlKind === "sl")?.triggerPrice ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="lg-toolbar">
        {(["positions", "orders", "fills"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-2 py-1 capitalize ${
              tab === t
                ? "border-[var(--signal)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t}
          </button>
        ))}
        <Link href="/portfolio" className="px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]">
          Account
        </Link>
        {note ? <span className="ml-auto truncate text-[var(--dim)]">{note}</span> : null}
      </div>
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
              {live ? (
                <tr>
                  <td className="py-1.5">{live.symbol.replace("-USD", "")}</td>
                  <td className="num">{live.size}</td>
                  <td className="num">{fmtPx(Number(live.entryPrice), priceDecimals)}</td>
                  <td className="num">{ticker ? fmtPx(ticker.markPrice, priceDecimals) : "—"}</td>
                  <td className={`num ${signedClass(Number(live.unrealizedPnl))}`}>{fmtUsdSigned(live.unrealizedPnl)}</td>
                  <td className="num">{fmtPx(Number(live.liquidationPrice), priceDecimals)}</td>
                  <td className="num">{fmtUsd(live.margin)}</td>
                  <td className={`num ${signedClass(Number(live.funding))}`}>{fmtUsdSigned(live.funding)}</td>
                  <td>
                    <input
                      value={tpDraft}
                      onChange={(e) => setTpDraft(e.target.value)}
                      placeholder={liveTp || "—"}
                      className="lg-input num w-[4.5rem] px-1 py-0.5 text-[11px]"
                    />
                  </td>
                  <td>
                    <input
                      value={slDraft}
                      onChange={(e) => setSlDraft(e.target.value)}
                      placeholder={liveSl || "—"}
                      className="lg-input num w-[4.5rem] px-1 py-0.5 text-[11px]"
                    />
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setPositionTpSl(live)}
                      className="mr-2 text-[var(--signal)] hover:underline"
                    >
                      Set
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePosition(live)}
                      className="text-[var(--perp)] hover:underline"
                    >
                      Close
                    </button>
                  </td>
                </tr>
              ) : preview ? (
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
              ) : (
                <tr>
                  <td colSpan={11} className="py-1.5 text-[var(--dim)]">
                    No open positions.
                  </td>
                </tr>
              )}
              {positions
                .filter((p) => p.instrumentId !== instrumentId)
                .map((p) => (
                  <tr key={`${p.instrumentId}-${p.symbol}`}>
                    <td className="py-1.5">{p.symbol.replace("-USD", "")}</td>
                    <td className="num">{p.size}</td>
                    <td className="num">{fmtPx(Number(p.entryPrice), priceDecimals)}</td>
                    <td className="num">—</td>
                    <td className={`num ${signedClass(Number(p.unrealizedPnl))}`}>{fmtUsdSigned(p.unrealizedPnl)}</td>
                    <td className="num">{fmtPx(Number(p.liquidationPrice), priceDecimals)}</td>
                    <td className="num">{fmtUsd(p.margin)}</td>
                    <td className={`num ${signedClass(Number(p.funding))}`}>{fmtUsdSigned(p.funding)}</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void closePosition(p)}
                        className="text-[var(--perp)] hover:underline"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : null}
        {tab === "orders" ? (
          orders.length === 0 ? (
            <p className="text-[var(--dim)]">No open orders.</p>
          ) : (
            <ul className="space-y-1">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span className="num">
                    {o.side} {o.quantity} @ {o.price} · {o.status}
                  </span>
                  <button type="button" disabled={busy} onClick={() => void cancel(o.id)} className="text-[var(--perp)]">
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {tab === "fills" ? (
          fills.length === 0 ? (
            <p className="text-[var(--dim)]">No fills yet.</p>
          ) : (
            <ul className="space-y-1 text-[var(--perp)]">
              {fills.map((f, i) => (
                <li key={`${f.side}-${f.price}-${i}`} className="num">
                  {f.side} {f.quantity} @ {f.price}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
