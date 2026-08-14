"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { fmtFunding, fmtPx, mmr } from "@/lib/format";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

type Geo = { blocked: boolean; country: string; reason: string };

export function OrderTicket({
  instrument,
  ticker,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
}) {
  const mount = usePrivyMount();
  if (mount !== "ready") {
    return (
      <section className="rounded-lg border border-zinc-800 bg-[#12161c] p-4 text-sm text-zinc-400">
        {mount === "insecure" ? (
          <>
            Privy cannot start on plain HTTP. Open{" "}
            <span className="text-zinc-200">https://localhost:3000</span> or{" "}
            <span className="text-zinc-200">https://138.124.119.188:3000</span> (accept the
            certificate warning) to log in with email, Google, or a wallet.
          </>
        ) : (
          <>
            Log in is disabled until a Privy App ID is set. Orders still attach builder{" "}
            <span className="text-zinc-200">arshia</span> once you can sign in.
          </>
        )}
      </section>
    );
  }
  return <ConnectedTicket instrument={instrument} ticker={ticker} />;
}

function ConnectedTicket({
  instrument,
  ticker,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
}) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const [geo, setGeo] = useState<Geo | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [tif, setTif] = useState<"IOC" | "GTC">("IOC");
  const [qty, setQty] = useState("0.01");
  const [price, setPrice] = useState(ticker ? String(ticker.markPrice) : "");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [perpsAccess, setPerpsAccess] = useState<PerpsAccess | null>(null);

  useEffect(() => {
    fetch("/api/geo")
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo({ blocked: true, country: "XX", reason: "Could not verify location." }));
  }, []);

  useEffect(() => {
    if (ticker && !price) setPrice(String(ticker.markPrice));
  }, [ticker, price]);

  const blocked = geo?.blocked ?? true;
  const inviteBlocked = perpsAccess?.kind === "invite";
  const canTrade = isConnected && !!walletClient && !blocked && !inviteBlocked;
  const maint = mmr(instrument.maxLeverage);

  const hint = useMemo(() => {
    if (!geo) return "Checking jurisdiction…";
    if (blocked) return geo.reason;
    if (!isConnected) return "Log in with email, Google, or a wallet to trade.";
    if (inviteBlocked) return perpsAccess?.message ?? "";
    return geo.reason;
  }, [blocked, geo, inviteBlocked, isConnected, perpsAccess]);

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
      if (price) request.price = price;
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
      setStatus("Canceled open orders on this instrument.");
    } catch (err) {
      const access = explainPerpsError(err);
      setPerpsAccess(access);
      setStatus(access.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-[#12161c] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Trade {instrument.symbol}</h2>
        <span className="text-xs text-zinc-500">Isolated default · min {instrument.minNotional} pUSD</span>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-400">
        <dt>Mark</dt>
        <dd className="text-zinc-200">{ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}</dd>
        <dt>Index</dt>
        <dd>{ticker ? fmtPx(ticker.indexPrice, instrument.priceDecimals) : "—"}</dd>
        <dt>Funding</dt>
        <dd>{ticker ? fmtFunding(ticker.fundingRate) : "—"} / {instrument.fundingInterval}</dd>
        <dt>Max lev</dt>
        <dd>{instrument.maxLeverage}x · MMR {(maint * 100).toFixed(2)}%</dd>
      </dl>
      <p className="mb-3 text-xs leading-5 text-zinc-500">
        Cross is opt-in on the API; this ticket opens isolated-style risk. Worst-case margin counts resting
        buys and sells. Immediate matches have a 20ms taker delay. Liquidation and ADL can close a position.
        You are responsible for local law. This is not a guaranteed edge.
      </p>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`flex-1 rounded px-3 py-1.5 text-sm ${side === "BUY" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300"}`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`flex-1 rounded px-3 py-1.5 text-sm ${side === "SELL" ? "bg-rose-800 text-white" : "bg-zinc-800 text-zinc-300"}`}
        >
          Short
        </button>
      </div>
      <label className="mb-2 block text-xs text-zinc-500">
        Price (pUSD)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        />
      </label>
      <label className="mb-2 block text-xs text-zinc-500">
        Quantity
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        />
      </label>
      <div className="mb-2 flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTif("IOC")}
          className={`rounded px-2 py-1 ${tif === "IOC" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
        >
          IOC
        </button>
        <button
          type="button"
          onClick={() => setTif("GTC")}
          className={`rounded px-2 py-1 ${tif === "GTC" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
        >
          GTC
        </button>
        <label className="ml-auto flex items-center gap-1 text-zinc-400">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce-only
        </label>
      </div>
      {tif === "GTC" ? (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">
            Take profit
            <input
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Stop loss
            <input
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            />
          </label>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={submit}
          className="flex-1 rounded bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Place order"}
        </button>
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={cancelAll}
          className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
        >
          Cancel all
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{hint}</p>
      {perpsAccess?.href ? (
        <p className="mt-2 text-xs">
          <a href={perpsAccess.href} target="_blank" rel="noreferrer" className="text-zinc-300 underline">
            Request Perps access on Polymarket
          </a>
        </p>
      ) : null}
      {status ? <p className="mt-2 text-xs text-amber-300">{status}</p> : null}
      <p className="mt-2 text-[11px] text-zinc-600">
        Builder <span className="text-zinc-400">arshia</span> is attached on every order. Dead-man&apos;s
        switch arms for 15 minutes after a live order. Builder maker/taker add-on is 0% — you only
        pay Polymarket&apos;s own fees.
      </p>
    </section>
  );
}
