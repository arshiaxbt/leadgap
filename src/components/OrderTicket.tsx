"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { estLiq, fmtPx, fmtUsd, mmr } from "@/lib/format";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { Field, TextInput } from "@/components/ui";

type Geo = { blocked: boolean; country: string; reason: string };

export function OrderTicket({
  instrument,
  ticker,
  price: priceOverride,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  price?: string;
}) {
  const mount = usePrivyMount();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const [geo, setGeo] = useState<Geo | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [tif, setTif] = useState<"IOC" | "GTC">("GTC");
  const [qty, setQty] = useState("0.01");
  const [price, setPrice] = useState(ticker ? String(ticker.markPrice) : "");
  const [leverage, setLeverage] = useState(Math.min(5, instrument.maxLeverage));
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [perpsAccess, setPerpsAccess] = useState<PerpsAccess | null>(null);
  const [free, setFree] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/geo")
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo({ blocked: true, country: "XX", reason: "Could not verify location." }));
  }, []);

  useEffect(() => {
    if (priceOverride) setPrice(priceOverride);
  }, [priceOverride]);

  useEffect(() => {
    if (ticker && !price) setPrice(String(ticker.markPrice));
  }, [ticker, price]);

  useEffect(() => {
    if (!walletClient || mount !== "ready") return;
    let stop = false;
    (async () => {
      try {
        const { resumePerpsSession } = await import("@/lib/perpsSession");
        const opened = await resumePerpsSession(walletClient);
        if (!opened || stop) return;
        const portfolio = await opened.session.fetchPortfolio();
        const margin = portfolio.margin as { availableOrderMargin?: string };
        const raw = Number(margin.availableOrderMargin ?? portfolio.withdrawable);
        if (!stop && Number.isFinite(raw)) setFree(raw);
      } catch {
        // stay at null
      }
    })();
    return () => {
      stop = true;
    };
  }, [mount, walletClient]);

  const blocked = geo?.blocked ?? true;
  const inviteBlocked = perpsAccess?.kind === "invite";
  const canTrade = mount === "ready" && isConnected && !!walletClient && !blocked && !inviteBlocked;
  const maint = mmr(instrument.maxLeverage);
  const px = Number(price) || ticker?.markPrice || 0;
  const size = Number(qty) || 0;
  const notional = px * size;
  const marginEst = leverage > 0 ? notional / leverage : 0;
  const liq = estLiq(px, leverage, maint, side);

  const hint = useMemo(() => {
    if (mount === "insecure") return "HTTPS required to log in.";
    if (mount !== "ready") return "Log in to trade.";
    if (!geo) return "Checking location…";
    if (blocked) return geo.reason;
    if (!isConnected) return "Log in to place an order.";
    if (inviteBlocked) return perpsAccess?.message ?? "";
    return geo.reason;
  }, [blocked, geo, inviteBlocked, isConnected, mount, perpsAccess]);

  function applyPct(pct: number) {
    if (!px || !leverage) return;
    const budget = (free ?? 0) * pct;
    const next = (budget * leverage) / px;
    if (next > 0) setQty(next.toFixed(Math.max(2, instrument.quantityDecimals)));
  }

  async function submit() {
    if (!walletClient || !address) return;
    setBusy(true);
    setStatus(null);
    try {
      const { OrderSide, PerpsTimeInForce } = await import("@polymarket/client");
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      const request: Record<string, unknown> = {
        instrumentId: instrument.instrumentId,
        side: side === "BUY" ? OrderSide.BUY : OrderSide.SELL,
        quantity: qty,
        timeInForce: tif === "GTC" ? PerpsTimeInForce.GTC : PerpsTimeInForce.IOC,
        reduceOnly,
        builderCode: BUILDER_CODE,
      };
      if (tif === "GTC" && price) request.price = price;
      if (tif === "GTC") {
        if (tp) request.takeProfit = { triggerPrice: tp };
        if (sl) request.stopLoss = { triggerPrice: sl };
      }
      const placed = await session.placeOrder(request as never);
      setStatus(`Order ${placed.order.id} ${placed.order.status}`);
      await session.armAutoCancel({ cancelAt: Date.now() + 15 * 60_000 }).catch(() => undefined);
    } catch (err) {
      const access = explainPerpsError(err);
      setPerpsAccess(access);
      setStatus(access.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAll() {
    if (!walletClient || !address) return;
    setBusy(true);
    try {
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      await session.cancelAllOrders({ instrumentId: instrument.instrumentId });
      setStatus("Canceled open orders.");
    } catch (err) {
      const access = explainPerpsError(err);
      setPerpsAccess(access);
      setStatus(access.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-3">
      <div className="mb-3 flex gap-1">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`flex-1 rounded-md py-2 text-sm font-semibold ${
            side === "BUY" ? "bg-emerald-600 text-white" : "bg-white/5 text-[#8b93a7]"
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`flex-1 rounded-md py-2 text-sm font-semibold ${
            side === "SELL" ? "bg-rose-600 text-white" : "bg-white/5 text-[#8b93a7]"
          }`}
        >
          Short
        </button>
      </div>
      <div className="mb-3 flex gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => setTif("GTC")}
          className={`rounded px-2 py-1 ${tif === "GTC" ? "bg-white text-[#07080c]" : "bg-white/5 text-[#8b93a7]"}`}
        >
          Limit
        </button>
        <button
          type="button"
          onClick={() => setTif("IOC")}
          className={`rounded px-2 py-1 ${tif === "IOC" ? "bg-white text-[#07080c]" : "bg-white/5 text-[#8b93a7]"}`}
        >
          Market
        </button>
        <label className="ml-auto flex items-center gap-1 text-[#8b93a7]">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce
        </label>
      </div>
      {tif === "GTC" ? (
        <Field label="Price">
          <TextInput value={price} onChange={(e) => setPrice(e.target.value)} className="num" />
        </Field>
      ) : null}
      <div className="mt-2">
        <Field label="Size">
          <TextInput value={qty} onChange={(e) => setQty(e.target.value)} className="num" />
        </Field>
        <div className="mt-1 flex gap-1">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyPct(pct)}
              className="flex-1 rounded bg-white/5 py-1 text-[10px] text-[#8b93a7] hover:text-white"
            >
              {pct * 100}%
            </button>
          ))}
        </div>
      </div>
      <label className="mt-2 block text-xs text-[#8b93a7]">
        Leverage {leverage}x
        <input
          type="range"
          min={1}
          max={instrument.maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      {tif === "GTC" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="TP">
            <TextInput value={tp} onChange={(e) => setTp(e.target.value)} />
          </Field>
          <Field label="SL">
            <TextInput value={sl} onChange={(e) => setSl(e.target.value)} />
          </Field>
        </div>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[11px] text-[#8b93a7]">
        <dt>Notional</dt>
        <dd className="num text-right text-zinc-200">{fmtPx(notional, 2)} pUSD</dd>
        <dt>Margin</dt>
        <dd className="num text-right text-zinc-200">{fmtPx(marginEst, 2)}</dd>
        <dt>Free</dt>
        <dd className="num text-right">{free != null ? fmtUsd(free) : "—"}</dd>
        <dt>MMR</dt>
        <dd className="num text-right">{(maint * 100).toFixed(2)}%</dd>
        <dt>Liq hint</dt>
        <dd className="num text-right text-zinc-200">{liq != null ? fmtPx(liq, instrument.priceDecimals) : "—"}</dd>
      </dl>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void submit()}
          className="flex-1 rounded-lg bg-[#3ee0a8] py-2.5 text-sm font-semibold text-[#07080c] disabled:opacity-40"
        >
          {busy ? "…" : side === "BUY" ? "Buy / Long" : "Sell / Short"}
        </button>
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void cancelAll()}
          className="rounded-lg border border-[#1e2636] px-3 text-xs text-zinc-300 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[#5c6478]">{hint}</p>
      {perpsAccess?.href ? (
        <a href={perpsAccess.href} target="_blank" rel="noreferrer" className="mt-1 text-[11px] text-[#8bb4ff] hover:underline">
          Request Perps access
        </a>
      ) : null}
      {status ? <p className="mt-1 text-[11px] text-amber-200">{status}</p> : null}
    </div>
  );
}
