"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";
import { polygon } from "viem/chains";
import { BUILDER_CODE } from "@/lib/builder";
import { estLiq, fmtCountdown, fmtFunding, fmtPx, fmtUsd, mmr, signedClass } from "@/lib/format";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import { trackEvent } from "@/lib/track";
import type { Bias } from "@/lib/score";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";

type Geo = { blocked: boolean; country: string; reason: string };

type TicketProps = {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  price?: string;
  thesis?: string;
  bias?: Bias;
};

export function OrderTicket(props: TicketProps) {
  const mount = usePrivyMount();
  if (mount !== "ready") return <TicketForm {...props} mount={mount} />;
  return <TicketSession {...props} />;
}

function TicketSession(props: TicketProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  return (
    <TicketForm {...props} mount="ready" address={address} isConnected={isConnected} walletClient={walletClient} />
  );
}

function TicketForm({
  instrument,
  ticker,
  price: priceOverride,
  thesis,
  bias,
  mount,
  address,
  isConnected = false,
  walletClient,
}: TicketProps & {
  mount: ReturnType<typeof usePrivyMount>;
  address?: string;
  isConnected?: boolean;
  walletClient?: WalletClient;
}) {
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
    if (bias === "long") setSide("BUY");
    else if (bias === "short") setSide("SELL");
  }, [bias]);

  useEffect(() => {
    trackEvent("open_ticket", { symbol: instrument.symbol });
  }, [instrument.symbol]);

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
      trackEvent("submit_order", { symbol: instrument.symbol, side });
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
  const field = "lg-input num mt-0.5 w-full px-2 py-1 text-[12px]";
  const fromEvent = bias === "long" || bias === "short";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface)] text-[11px]">
      <div className="lg-toolbar justify-between">
        <span className="lg-label">Ticket</span>
        <span className="num text-[var(--muted)]">{free != null ? `${fmtUsd(free)} free` : "—"}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-2">
      {thesis ? (
        <div>
          <p className="lg-label mb-0.5">{fromEvent ? "From event" : "Thesis"}</p>
          <p className="leading-4 text-[var(--text)]">{thesis}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)]">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`py-1.5 text-[12px] font-semibold tracking-wide ${
            long
              ? "bg-[color-mix(in_srgb,var(--long)_18%,var(--surface))] text-[var(--long)]"
              : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--muted)]"
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`py-1.5 text-[12px] font-semibold tracking-wide ${
            !long
              ? "bg-[color-mix(in_srgb,var(--short)_18%,var(--surface))] text-[var(--short)]"
              : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--muted)]"
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
            className={`flex-1 border py-1 text-[11px] font-medium ${
              tif === id
                ? "border-[var(--line-strong)] bg-[var(--hover)] text-[var(--text)]"
                : "border-[var(--line)] bg-[var(--bg)] text-[var(--dim)] hover:text-[var(--muted)]"
            }`}
          >
            {id === "IOC" ? "Market" : "Limit"}
          </button>
        ))}
        <label className="flex items-center gap-1 px-1 text-[10px] text-[var(--dim)]">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce
        </label>
      </div>

      {tif === "GTC" ? (
        <label className="block lg-label">
          Price
          <input value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </label>
      ) : null}

      <label className="block lg-label">
        <span className="flex justify-between">
          Size ({base})
          <span className="num normal-case tracking-normal text-[var(--muted)]">{fmtUsd(notional)}</span>
        </span>
        <div className="mt-0.5 flex gap-1">
          <button type="button" onClick={() => bump(-1)} className="w-7 border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--hover)]">
            −
          </button>
          <input value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
          <button type="button" onClick={() => bump(1)} className="w-7 border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--hover)]">
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
            className="border border-[var(--line)] bg-[var(--bg)] py-0.5 text-[10px] text-[var(--dim)] hover:bg-[var(--hover)]"
          >
            {pct * 100}%
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between lg-label">
        <span>Leverage</span>
        <span className="num text-[var(--text)]">{leverage}x</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {levPresets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLeverage(n)}
            className={`border px-1.5 py-0.5 text-[10px] ${
              leverage === n
                ? "border-[var(--line-strong)] bg-[var(--hover)] text-[var(--text)]"
                : "border-[var(--line)] bg-[var(--bg)] text-[var(--dim)]"
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
        className="w-full accent-[var(--signal)]"
      />

      {tif === "GTC" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="lg-label">
            TP
            <input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="—" className={field} />
          </label>
          <label className="lg-label">
            SL
            <input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="—" className={field} />
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1 border-t border-[var(--line)] pt-2 text-[10px] text-[var(--dim)]">
        <div>
          Margin
          <div className="num text-[var(--text)]">{fmtPx(marginEst, 2)}</div>
        </div>
        <div>
          Est. liq
          <div className="num text-[var(--text)]">{liq != null ? fmtPx(liq, instrument.priceDecimals) : "—"}</div>
        </div>
        <div className="text-right">
          Funding
          <div className={`num ${ticker ? signedClass(ticker.fundingRate) : "text-[var(--text)]"}`}>
            {ticker ? fmtFunding(ticker.fundingRate) : "—"}
          </div>
          <div className="num text-[var(--muted)]">{ticker ? fmtCountdown(ticker.nextFunding) : ""}</div>
        </div>
      </div>
      <button
        type="button"
        disabled={!canTrade || busy}
        onClick={() => void submit()}
        className={`w-full border py-2 text-[13px] font-semibold tracking-wide disabled:opacity-40 ${
          long
            ? "border-[color-mix(in_srgb,var(--long)_50%,var(--line))] text-[var(--long)]"
            : "border-[color-mix(in_srgb,var(--short)_50%,var(--line))] text-[var(--short)]"
        }`}
      >
        {busy ? "Submitting…" : `${long ? "Long" : "Short"} ${base}`}
      </button>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void cancelAll()}
          className="text-[10px] text-[var(--dim)] hover:text-[var(--muted)] disabled:opacity-40"
        >
          Cancel open
        </button>
        {perpsAccess?.href ? (
          <a href={perpsAccess.href} target="_blank" rel="noreferrer" className="text-[10px] text-[var(--perp)] hover:underline">
            Request access
          </a>
        ) : null}
      </div>
      <p className="text-[10px] leading-3 text-[var(--dim)]">{hint}</p>
      {status ? <p className="text-[11px] text-[var(--warn)]">{status}</p> : null}
      </div>
    </div>
  );
}
