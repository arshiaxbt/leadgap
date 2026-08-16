"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";
import { polygon } from "viem/chains";
import { Button, buttonVariants } from "@/components/ui/button";
import { BUILDER_CODE } from "@/lib/builder";
import { estLiq, fmtCountdown, fmtFunding, fmtPx, fmtUsd, mmr, signedClass } from "@/lib/format";
import { assertCanTrade, fetchTradeGeo } from "@/lib/geo";
import { notifyErr, notifyOk } from "@/lib/notify";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import { trackEvent } from "@/lib/track";
import type { Bias } from "@/lib/score";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { cn } from "@/lib/utils";

type Geo = { blocked: boolean; country: string; reason: string };

export type TicketPreview = {
  side: "BUY" | "SELL";
  leverage: number;
  qty: number;
  price: number;
  margin: number;
  liq: number | null;
  tp: string;
  sl: string;
};

type TicketProps = {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  price?: string;
  thesis?: string;
  bias?: Bias;
  onPreview?: (preview: TicketPreview) => void;
};

export function OrderTicket(props: TicketProps) {
  const mount = usePrivyMount();
  if (mount !== "ready") return <TicketForm {...props} mount={mount} />;
  return <TicketSession {...props} />;
}

function TicketSession(props: TicketProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: polygon.id });
  const { login } = usePrivy();
  return (
    <TicketForm
      {...props}
      mount="ready"
      address={address}
      isConnected={isConnected}
      walletClient={walletClient}
      onLogin={login}
    />
  );
}

function readTicketSide(): "BUY" | "SELL" {
  try {
    const v = sessionStorage.getItem("lg-ticket-side");
    if (v === "BUY" || v === "SELL") return v;
  } catch {
    // ignore
  }
  return "BUY";
}

function readTicketTif(): "IOC" | "GTC" {
  try {
    const v = sessionStorage.getItem("lg-ticket-tif");
    if (v === "IOC" || v === "GTC") return v;
  } catch {
    // ignore
  }
  return "GTC";
}

function TicketForm({
  instrument,
  ticker,
  price: priceOverride,
  thesis,
  bias,
  onPreview,
  mount,
  address,
  isConnected = false,
  walletClient,
  onLogin,
}: TicketProps & {
  mount: ReturnType<typeof usePrivyMount>;
  address?: string;
  isConnected?: boolean;
  walletClient?: WalletClient;
  onLogin?: () => void;
}) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">(readTicketSide);
  const [tif, setTif] = useState<"IOC" | "GTC">(readTicketTif);
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
    void fetchTradeGeo().then(setGeo);
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
    try {
      sessionStorage.setItem("lg-ticket-side", side);
      sessionStorage.setItem("lg-ticket-tif", tif);
    } catch {
      // ignore
    }
  }, [side, tif]);

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
    return "";
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
      const geoCheck = await assertCanTrade();
      setGeo(geoCheck);
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
      if (tp) request.takeProfit = { triggerPrice: tp };
      if (sl) request.stopLoss = { triggerPrice: sl };
      const placed = await session.placeOrder(request as never);
      trackEvent("submit_order", { symbol: instrument.symbol, side });
      const line = `Order ${placed.order.id} ${placed.order.status}`;
      setStatus(line);
      notifyOk(line);
      await session.armAutoCancel({ cancelAt: Date.now() + 15 * 60_000 }).catch(() => undefined);
    } catch (err) {
      const access = explainPerpsError(err);
      setPerpsAccess(access);
      setStatus(access.message);
      notifyErr(access.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAll() {
    if (!walletClient || !address) return;
    setBusy(true);
    try {
      const geoCheck = await assertCanTrade();
      setGeo(geoCheck);
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      await session.cancelAllOrders({ instrumentId: instrument.instrumentId });
      setStatus("Canceled open orders.");
      notifyOk("Canceled open orders.");
    } catch (err) {
      const access = explainPerpsError(err);
      setPerpsAccess(access);
      setStatus(access.message);
      notifyErr(access.message);
    } finally {
      setBusy(false);
    }
  }

  const long = side === "BUY";
  const loggedOut = mount === "ready" && !isConnected;
  const levPresets = [...new Set([1, 2, 5, 10, 25, 50, instrument.maxLeverage].filter((n) => n <= instrument.maxLeverage))].sort(
    (a, b) => a - b,
  );
  const field = "lg-input num mt-0.5 w-full px-2 py-1 text-[12px]";
  const fromEvent = bias === "long" || bias === "short";
  const primaryDisabled = busy || (loggedOut ? !onLogin : !canTrade);
  const primaryLabel = busy ? "Submitting…" : loggedOut ? "Log in to trade" : `${long ? "Long" : "Short"} ${base}`;

  useEffect(() => {
    onPreview?.({
      side,
      leverage,
      qty: size,
      price: px,
      margin: marginEst,
      liq,
      tp,
      sl,
    });
  }, [leverage, liq, marginEst, onPreview, px, side, size, sl, tp]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface)] text-[12px]">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 py-3">
      {thesis ? (
        <div>
          <p className="mb-0.5 text-[11px] text-[var(--dim)]">{fromEvent ? "From event" : "Thesis"}</p>
          <p className="leading-5 text-[var(--text)]">{thesis}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={cn(buttonVariants({ variant: long ? "long" : "ghost", size: "sm" }), "h-9 rounded-[6px]")}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={cn(buttonVariants({ variant: !long ? "short" : "ghost", size: "sm" }), "h-9 rounded-[6px]")}
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
            className={cn(
              "flex-1 rounded-[6px] py-1.5 text-[12px] font-medium focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--odds)_40%,transparent)]",
              tif === id
                ? "bg-[var(--elevated)] text-[var(--text)]"
                : "text-[var(--dim)] hover:text-[var(--muted)]",
            )}
          >
            {id === "IOC" ? "Market" : "Limit"}
          </button>
        ))}
        <label className="flex items-center gap-1 px-1 text-[12px] text-[var(--dim)]">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce
        </label>
      </div>

      {tif === "GTC" ? (
        <label className="block text-[11px] text-[var(--dim)]">
          Price
          <input value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </label>
      ) : null}

      <label className="block text-[11px] text-[var(--dim)]">
        <span className="flex justify-between">
          Size ({base})
          <span className="num text-[12px] text-[var(--muted)]">{fmtUsd(notional)}</span>
        </span>
        <div className="mt-0.5 flex gap-1">
          <button
            type="button"
            onClick={() => bump(-1)}
            className="w-7 rounded-[6px] bg-[var(--elevated)] text-[var(--muted)] hover:bg-[var(--hover)]"
          >
            −
          </button>
          <input value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
          <button
            type="button"
            onClick={() => bump(1)}
            className="w-7 rounded-[6px] bg-[var(--elevated)] text-[var(--muted)] hover:bg-[var(--hover)]"
          >
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
            className="rounded-[4px] bg-[var(--elevated)] py-1 text-[11px] text-[var(--dim)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          >
            {pct * 100}%
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--dim)]">
        <span>Leverage</span>
        <span className="num text-[12px] text-[var(--text)]">{leverage}x</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {levPresets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLeverage(n)}
            className={cn(
              "rounded-[4px] px-1.5 py-0.5 text-[11px]",
              leverage === n
                ? "bg-[var(--elevated)] text-[var(--text)]"
                : "text-[var(--dim)] hover:text-[var(--muted)]",
            )}
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
        className="w-full accent-[var(--mark)]"
      />

      <details className="rounded-[6px] bg-[var(--elevated)] px-2 py-1.5">
        <summary className="cursor-pointer text-[12px] text-[var(--muted)]">Advanced</summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <label className="text-[11px] text-[var(--dim)]">
            TP
            <input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="—" className={field} />
          </label>
          <label className="text-[11px] text-[var(--dim)]">
            SL
            <input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="—" className={field} />
          </label>
        </div>
      </details>

      <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] text-[var(--dim)]">
        <div>
          Margin
          <div className="num text-[12px] text-[var(--text)]">{fmtPx(marginEst, 2)}</div>
        </div>
        <div>
          Est. liq
          <div className="num text-[12px] text-[var(--text)]">{liq != null ? fmtPx(liq, instrument.priceDecimals) : "—"}</div>
        </div>
        <div className="text-right">
          Funding
          <div className={`num text-[12px] ${ticker ? signedClass(ticker.fundingRate) : "text-[var(--text)]"}`}>
            {ticker ? fmtFunding(ticker.fundingRate) : "—"}
          </div>
          <div className="num text-[var(--muted)]">{ticker ? fmtCountdown(ticker.nextFunding) : ""}</div>
        </div>
      </div>
      {free != null ? (
        <p className="num text-[11px] text-[var(--muted)]">{fmtUsd(free)} free</p>
      ) : null}
      <Button
        type="button"
        variant={long ? "long" : "short"}
        disabled={primaryDisabled}
        onClick={() => {
          if (loggedOut) {
            onLogin?.();
            return;
          }
          void submit();
        }}
        className="h-10 w-full rounded-[6px] text-[13px]"
      >
        {primaryLabel}
      </Button>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canTrade || busy}
          onClick={() => void cancelAll()}
          className="lg-focus text-[12px] text-[var(--dim)] hover:text-[var(--muted)] disabled:opacity-40"
        >
          Cancel open
        </button>
        {perpsAccess?.href ? (
          <a href={perpsAccess.href} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--mark)] hover:underline">
            Request access
          </a>
        ) : null}
      </div>
      {hint ? <p className="text-[12px] leading-4 text-[var(--muted)]">{hint}</p> : null}
      {status ? <p className="text-[13px] leading-4 text-[var(--warn)]">{status}</p> : null}
      </div>
    </div>
  );
}
