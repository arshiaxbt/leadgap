"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { explainPerpsError } from "@/lib/perpsAccess";
import { fmtPx, signedClass } from "@/lib/format";
import { usePrivyMount } from "@/lib/usePrivyMount";

type Tab = "positions" | "orders" | "fills";

type PositionRow = {
  instrumentId: number;
  symbol: string;
  size: string;
  entryPrice: string;
  leverage: number;
  unrealizedPnl: string;
  liquidationPrice: string;
};

type OrderRow = {
  id: number;
  side: string;
  price: string;
  quantity: string;
  status: string;
};

type FillRow = {
  side: string;
  quantity: string;
  price: string;
};

export function Blotter({ instrumentId }: { instrumentId: number }) {
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
  return <BlotterSession instrumentId={instrumentId} />;
}

function BlotterSession({ instrumentId }: { instrumentId: number }) {
  const mount = "ready" as const;
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const [tab, setTab] = useState<Tab>("positions");
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fills, setFills] = useState<FillRow[]>([]);
  const [note, setNote] = useState("Log in to see positions and orders.");
  const [busy, setBusy] = useState(false);

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
        })),
      );
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
          positions.length === 0 ? (
            <p className="text-[var(--dim)]">No open positions.</p>
          ) : (
            <table className="lg-table w-full text-left">
              <thead>
                <tr>
                  <th className="py-1">Market</th>
                  <th>Size</th>
                  <th>Entry</th>
                  <th>PnL</th>
                  <th>Liq</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={`${p.instrumentId}-${p.symbol}`}>
                    <td className="py-1.5">{p.symbol.replace("-USD", "")}</td>
                    <td className="num">{p.size}</td>
                    <td className="num">{fmtPx(Number(p.entryPrice))}</td>
                    <td className={`num ${signedClass(Number(p.unrealizedPnl))}`}>{p.unrealizedPnl}</td>
                    <td className="num">{fmtPx(Number(p.liquidationPrice))}</td>
                    <td>
                      <button type="button" disabled={busy} onClick={() => void closePosition(p)} className="text-[var(--perp)] hover:underline">
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
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
