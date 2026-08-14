"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { fmtFunding, fmtPx, mmr } from "@/lib/format";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { Field, Panel, TextInput } from "@/components/ui";

type Geo = { blocked: boolean; country: string; reason: string };

export function OrderTicket({
  instrument,
  ticker,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
}) {
  const mount = usePrivyMount();
  return <ConnectedTicket instrument={instrument} ticker={ticker} mount={mount} />;
}

function ConnectedTicket({
  instrument,
  ticker,
  mount,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  mount: ReturnType<typeof usePrivyMount>;
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
  const canTrade = mount === "ready" && isConnected && !!walletClient && !blocked && !inviteBlocked;
  const maint = mmr(instrument.maxLeverage);

  const hint = useMemo(() => {
    if (mount === "insecure") return "Open this site over HTTPS to log in.";
    if (mount !== "ready") return "Log in to trade.";
    if (!geo) return "Checking location…";
    if (blocked) return geo.reason;
    if (!isConnected) return "Log in to place an order.";
    if (inviteBlocked) return perpsAccess?.message ?? "";
    return geo.reason;
  }, [blocked, geo, inviteBlocked, isConnected, mount, perpsAccess]);

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
    <Panel className="p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white">Trade {instrument.symbol.replace("-USD", "")}</h2>
        <span className="text-[11px] text-[#5c6478]">Min {instrument.minNotional} pUSD</span>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-[#8b93a7]">
        <dt>Mark</dt>
        <dd className="num text-right text-zinc-200">
          {ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}
        </dd>
        <dt>Index</dt>
        <dd className="num text-right">{ticker ? fmtPx(ticker.indexPrice, instrument.priceDecimals) : "—"}</dd>
        <dt>Funding</dt>
        <dd className="num text-right">
          {ticker ? fmtFunding(ticker.fundingRate) : "—"} / {instrument.fundingInterval}
        </dd>
        <dt>Max lev</dt>
        <dd className="num text-right">
          {instrument.maxLeverage}x · MMR {(maint * 100).toFixed(2)}%
        </dd>
      </dl>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
            side === "BUY" ? "bg-emerald-600 text-white" : "bg-white/5 text-[#8b93a7]"
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
            side === "SELL" ? "bg-rose-600 text-white" : "bg-white/5 text-[#8b93a7]"
          }`}
        >
          Short
        </button>
      </div>
      <div className="space-y-2">
        <Field label="Price">
          <TextInput value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Quantity">
          <TextInput value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {(["IOC", "GTC"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTif(t)}
            className={`rounded-md px-2 py-1 ${tif === t ? "bg-white text-[#07080c]" : "bg-white/5 text-[#8b93a7]"}`}
          >
            {t}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[#8b93a7]">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce-only
        </label>
      </div>
      {tif === "GTC" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Take profit">
            <TextInput value={tp} onChange={(e) => setTp(e.target.value)} />
          </Field>
          <Field label="Stop loss">
            <TextInput value={sl} onChange={(e) => setSl(e.target.value)} />
          </Field>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void submit()}
          className="flex-1 rounded-lg bg-[#3ee0a8] px-3 py-2.5 text-sm font-medium text-[#07080c] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Place order"}
        </button>
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void cancelAll()}
          className="rounded-lg border border-[#1e2636] px-3 py-2.5 text-sm text-zinc-300 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#5c6478]">{hint}</p>
      {perpsAccess?.href ? (
        <a href={perpsAccess.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[#8bb4ff] hover:underline">
          Request Perps access
        </a>
      ) : null}
      {status ? <p className="mt-2 text-xs text-amber-200">{status}</p> : null}
      <p className="mt-3 text-[11px] leading-4 text-[#4b5366]">
        Isolated. You are responsible for local law. Not a recommendation.
      </p>
    </Panel>
  );
}
