"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { estLiq, fmtPx, fmtUsd, mmr } from "@/lib/format";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

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
  const base = instrument.symbol.replace("-USD", "");

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

  function bump(dir: -1 | 1) {
    const step = 10 ** -Math.max(2, instrument.quantityDecimals);
    const next = Math.max(0, size + dir * step);
    setQty(next.toFixed(Math.max(2, instrument.quantityDecimals)));
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

  const long = side === "BUY";
  const levPresets = [...new Set([1, 2, 5, 10, 25, 50, instrument.maxLeverage].filter((n) => n <= instrument.maxLeverage))].sort(
    (a, b) => a - b,
  );
  const field =
    "num mt-0.5 w-full rounded-md border border-[#1e2636] bg-[#07080c] px-2 py-1 text-[13px] text-zinc-100 outline-none placeholder:text-[#5c6478] focus:border-[#3ee0a8]/40";

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-auto px-2 py-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-[#5c6478]">Order</p>
        <span className="num text-[10px] text-[#8b93a7]">{free != null ? `Free ${fmtUsd(free)}` : "—"}</span>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[#1a2030]">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`py-1.5 text-[12px] font-bold tracking-wide ${
            long ? "bg-[#3ee0a8] text-[#07080c]" : "bg-[#0e1118] text-[#8b93a7] hover:text-white"
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`py-1.5 text-[12px] font-bold tracking-wide ${
            !long ? "bg-[#fb7185] text-[#07080c]" : "bg-[#0e1118] text-[#8b93a7] hover:text-white"
          }`}
        >
          Short
        </button>
      </div>

      <div className="flex items-center gap-1">
        {(["IOC", "GTC"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTif(id)}
            className={`flex-1 rounded py-1 text-[11px] font-medium ${
              tif === id ? "bg-white text-[#07080c]" : "bg-white/5 text-[#8b93a7] hover:text-white"
            }`}
          >
            {id === "IOC" ? "Market" : "Limit"}
          </button>
        ))}
        <label className="flex items-center gap-1 px-1 text-[10px] text-[#8b93a7]">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce
        </label>
      </div>

      {tif === "GTC" ? (
        <label className="block text-[10px] uppercase tracking-wide text-[#5c6478]">
          Price
          <input value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </label>
      ) : null}

      <label className="block text-[10px] uppercase tracking-wide text-[#5c6478]">
        <span className="flex justify-between">
          Size
          <span className="num normal-case tracking-normal text-[#8b93a7]">{fmtUsd(notional)}</span>
        </span>
        <div className="mt-0.5 flex gap-1">
          <button type="button" onClick={() => bump(-1)} className="w-7 rounded bg-white/5 text-zinc-300 hover:text-white">
            −
          </button>
          <input value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
          <button type="button" onClick={() => bump(1)} className="w-7 rounded bg-white/5 text-zinc-300 hover:text-white">
            +
          </button>
        </div>
      </label>
      <div className="grid grid-cols-4 gap-1">
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => applyPct(pct)}
            className="rounded bg-white/5 py-0.5 text-[10px] text-[#8b93a7] hover:bg-white/10 hover:text-white"
          >
            {pct * 100}%
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[#5c6478]">
        <span>Leverage</span>
        <span className="num text-zinc-200">{leverage}x</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {levPresets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLeverage(n)}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              leverage === n ? "bg-white text-[#07080c]" : "bg-white/5 text-[#8b93a7] hover:text-white"
            }`}
          >
            {n}x
          </button>
        ))}
      </div>
      <input
        type="range"
        min={1}
        max={instrument.maxLeverage}
        value={leverage}
        onChange={(e) => setLeverage(Number(e.target.value))}
        className="w-full accent-[#3ee0a8]"
      />

      {tif === "GTC" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] uppercase tracking-wide text-[#5c6478]">
            TP
            <input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="—" className={field} />
          </label>
          <label className="text-[10px] uppercase tracking-wide text-[#5c6478]">
            SL
            <input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="—" className={field} />
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1 border-t border-[#1a2030] pt-1.5 text-[10px] text-[#5c6478]">
        <div>
          Margin
          <div className="num text-zinc-200">{fmtPx(marginEst, 2)}</div>
        </div>
        <div>
          Liq
          <div className="num text-zinc-200">{liq != null ? fmtPx(liq, instrument.priceDecimals) : "—"}</div>
        </div>
        <div className="text-right">
          Free
          <div className="num text-zinc-200">{free != null ? fmtUsd(free) : "—"}</div>
        </div>
      </div>
      <button
        type="button"
        disabled={!canTrade || busy}
        onClick={() => void submit()}
        className={`w-full rounded-md py-2 text-[13px] font-bold tracking-wide disabled:opacity-40 ${
          long ? "bg-[#3ee0a8] text-[#07080c]" : "bg-[#fb7185] text-[#07080c]"
        }`}
      >
        {busy ? "Submitting…" : `${long ? "Long" : "Short"} ${base}`}
      </button>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void cancelAll()}
          className="text-[10px] text-[#8b93a7] hover:text-white disabled:opacity-40"
        >
          Cancel open
        </button>
        {perpsAccess?.href ? (
          <a href={perpsAccess.href} target="_blank" rel="noreferrer" className="text-[10px] text-[#8bb4ff] hover:underline">
            Request access
          </a>
        ) : null}
      </div>
      <p className="text-[10px] leading-3 text-[#5c6478]">{hint}</p>
      {status ? <p className="text-[11px] text-amber-200">{status}</p> : null}
    </div>
  );
}
