"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";
import { polygon } from "viem/chains";
import { Button, buttonVariants } from "@/components/ui/button";
import { PerpsAccessAlert } from "@/components/PerpsAccessAlert";
import { usePerpsStrip } from "@/components/PortfolioStrip";
import { PERPS_INVITE_LABEL, PERPS_INVITE_URL } from "@/lib/brand";
import { submitPerpOrder } from "@/lib/submit-order";
import {
  defaultUsdSize,
  estLiq,
  formatOrderQty,
  formatUsdSize,
  fmtCountdown,
  fmtFunding,
  fmtPx,
  fmtUsd,
  mmr,
  qtyStep,
  signedClass,
} from "@/lib/format";
import { assertCanTrade, fetchTradeGeo } from "@/lib/geo";
import { notifyErr, notifyOk } from "@/lib/notify";
import { explainPerpsError, type PerpsAccess } from "@/lib/perpsAccess";
import { usePrivyMount } from "@/lib/usePrivyMount";
import { trackEvent } from "@/lib/track";
import type { Bias } from "@/lib/score";
import type { PerpsInstrument, PerpsTicker } from "@/lib/types";
import { validateOrder } from "@/lib/order-validation";
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

type SizeUnit = "usd" | "base";

function readTicketSizeUnit(): SizeUnit {
  try {
    const v = sessionStorage.getItem("lg-ticket-size-unit");
    if (v === "usd" || v === "base") return v;
  } catch {
    // ignore
  }
  return "usd";
}

function sizeTrailingHint(
  unit: SizeUnit,
  size: number,
  qtyStr: string,
  base: string,
  notional: number,
): string {
  switch (unit) {
    case "usd":
      return size > 0 ? `${qtyStr} ${base}` : "";
    case "base":
      return fmtUsd(notional);
    default: {
      const _never: never = unit;
      return _never;
    }
  }
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
  const [side, setSide] = useState<"BUY" | "SELL">(() =>
    bias === "long" ? "BUY" : bias === "short" ? "SELL" : readTicketSide(),
  );
  const [tif, setTif] = useState<"IOC" | "GTC">(() =>
    priceOverride ? "GTC" : readTicketTif(),
  );
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>(readTicketSizeUnit);
  const [sizeInput, setSizeInput] = useState(() =>
    readTicketSizeUnit() === "usd"
      ? defaultUsdSize(instrument.minNotional)
      : formatOrderQty(
          qtyStep(instrument.quantityDecimals),
          instrument.quantityDecimals,
        ),
  );
  const [price, setPrice] = useState(
    priceOverride ?? (ticker ? String(ticker.markPrice) : ""),
  );
  const [leverage, setLeverage] = useState(Math.min(5, instrument.maxLeverage));
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const currentAccount = useRef(address);
  useEffect(() => {
    currentAccount.current = address;
  }, [address]);
  const [review, setReview] = useState<
    | (Parameters<typeof submitPerpOrder>[1] & {
        account: string;
        position: number | null;
      })
    | null
  >(null);
  const [positionSize, setPositionSize] = useState<number | null>(null);
  const [ticketAccess, setTicketAccess] = useState<PerpsAccess | null>(null);
  const [free, setFree] = useState<number | null>(null);
  const stripAccess = usePerpsStrip()?.state.access ?? null;
  const perpsAccess =
    stripAccess?.kind === "invite" ? stripAccess : ticketAccess;

  useEffect(() => {
    void fetchTradeGeo().then(setGeo);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("lg-ticket-side", side);
      sessionStorage.setItem("lg-ticket-tif", tif);
      sessionStorage.setItem("lg-ticket-size-unit", sizeUnit);
    } catch {
      // ignore
    }
  }, [side, tif, sizeUnit]);

  useEffect(() => {
    trackEvent("open_ticket", { symbol: instrument.symbol });
  }, [instrument.symbol]);

  useEffect(() => {
    if (!walletClient || mount !== "ready" || perpsAccess?.kind === "invite")
      return;
    let stop = false;
    (async () => {
      try {
        const { resumePerpsSession } = await import("@/lib/perpsSession");
        const opened = await resumePerpsSession(walletClient);
        if (!opened || stop) return;
        const portfolio = await opened.session.fetchPortfolio();
        const margin = portfolio.margin as { availableOrderMargin?: string };
        const raw = Number(
          margin.availableOrderMargin ?? portfolio.withdrawable,
        );
        if (!stop && Number.isFinite(raw)) {
          setFree(raw);
          setPositionSize(
            Number(
              portfolio.positions?.find(
                (p) => Number(p.instrumentId) === instrument.instrumentId,
              )?.size ?? 0,
            ),
          );
        }
      } catch {
        // stay at null
      }
    })();
    return () => {
      stop = true;
    };
  }, [mount, perpsAccess?.kind, walletClient, instrument.instrumentId]);

  const blocked = geo?.blocked ?? true;
  const inviteBlocked = perpsAccess?.kind === "invite";
  const canTrade =
    mount === "ready" &&
    isConnected &&
    !!walletClient &&
    !blocked &&
    !inviteBlocked;
  const maint = mmr(instrument.maxLeverage);
  const px = tif === "GTC" ? Number(price) : (ticker?.markPrice ?? 0);
  const qtyStr = useMemo(() => {
    const raw = Number(sizeInput);
    if (!Number.isFinite(raw) || raw <= 0 || !(px > 0)) return "0";
    switch (sizeUnit) {
      case "usd":
        return formatOrderQty(raw / px, instrument.quantityDecimals);
      case "base":
        return formatOrderQty(raw, instrument.quantityDecimals);
      default: {
        const _never: never = sizeUnit;
        return _never;
      }
    }
  }, [instrument.quantityDecimals, px, sizeInput, sizeUnit]);
  const size = Number(qtyStr) || 0;
  const notional = px > 0 ? px * size : 0;
  const minNotional = Number(instrument.minNotional) || 0;
  const belowMin = size > 0 && minNotional > 0 && notional + 1e-9 < minNotional;
  const marginEst = leverage > 0 ? notional / leverage : 0;
  const liq = estLiq(px, leverage, maint, side);
  const base = instrument.symbol.replace("-USD", "");

  const hint = useMemo(() => {
    if (mount === "insecure") return "HTTPS required to log in.";
    if (mount === "off")
      return "Trading connection is unavailable in this environment.";
    if (mount !== "ready") return "Connecting to login…";
    if (!geo) return "Checking location…";
    if (blocked) return geo.reason;
    if (perpsAccess?.kind === "invite") return perpsAccess.message;
    if (!isConnected) return "Log in to Polymarket to place an order.";
    return "";
  }, [blocked, geo, isConnected, mount, perpsAccess]);

  function applyPct(pct: number) {
    if (!px || !leverage) return;
    const usd = (free ?? 0) * pct * leverage;
    if (!(usd > 0)) return;
    switch (sizeUnit) {
      case "usd":
        setSizeInput(formatUsdSize(usd));
        return;
      case "base":
        setSizeInput(formatOrderQty(usd / px, instrument.quantityDecimals));
        return;
      default: {
        const _never: never = sizeUnit;
        return _never;
      }
    }
  }

  function bump(dir: -1 | 1) {
    const raw = Number(sizeInput) || 0;
    switch (sizeUnit) {
      case "usd":
        setSizeInput(formatUsdSize(Math.max(0, raw + dir)));
        return;
      case "base": {
        const next = Math.max(
          0,
          size + dir * qtyStep(instrument.quantityDecimals),
        );
        setSizeInput(formatOrderQty(next, instrument.quantityDecimals));
        return;
      }
      default: {
        const _never: never = sizeUnit;
        return _never;
      }
    }
  }

  function changeSizeUnit(next: SizeUnit) {
    if (next === sizeUnit) return;
    switch (next) {
      case "usd":
        setSizeInput(
          notional > 0
            ? formatUsdSize(notional)
            : defaultUsdSize(instrument.minNotional),
        );
        break;
      case "base":
        setSizeInput(
          qtyStr === "0"
            ? formatOrderQty(
                qtyStep(instrument.quantityDecimals),
                instrument.quantityDecimals,
              )
            : qtyStr,
        );
        break;
      default: {
        const _never: never = next;
        return _never;
      }
    }
    setSizeUnit(next);
  }

  const validation = validateOrder({
    quoteTimestamp: ticker?.timestamp ?? 0,
    side,
    tif,
    quantity: size,
    price: px,
    limitPrice: price,
    minNotional,
    priceDecimals: instrument.priceDecimals,
    leverage,
    maxLeverage: instrument.maxLeverage,
    takeProfit: tp,
    stopLoss: sl,
  });

  function openReview() {
    if (validation) {
      setStatus(validation);
      return;
    }
    setStatus(null);
    setReview({
      quoteTimestamp: ticker?.timestamp ?? 0,
      instrumentId: instrument.instrumentId,
      isolatedOnly: instrument.isolatedOnly,
      side,
      tif,
      quantity: size,
      quantityText: qtyStr,
      price: px,
      limitPrice: price,
      minNotional,
      priceDecimals: instrument.priceDecimals,
      leverage,
      maxLeverage: instrument.maxLeverage,
      takeProfit: tp,
      stopLoss: sl,
      reduceOnly,
      account: address ?? "",
      position: positionSize,
    });
  }
  async function submit() {
    if (!walletClient || !address || busy || submitting.current || !review)
      return;
    if (review.account !== address) {
      setStatus("Account changed. Review this order again.");
      setReview(null);
      return;
    }
    const invalid = validateOrder(review);
    if (invalid) {
      setStatus(invalid);
      setReview(null);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const geoCheck = await assertCanTrade();
      setGeo(geoCheck);
      const { openCachedPerpsSession } = await import("@/lib/perpsSession");
      const { session } = await openCachedPerpsSession(walletClient);
      if (currentAccount.current !== review.account)
        throw new Error("Account changed. Review this order again.");
      const placed = await submitPerpOrder(session, review);
      setReview(null);
      trackEvent("submit_order", { symbol: instrument.symbol, side });
      const line = `Order ${placed.order.id} ${placed.order.status}`;
      setStatus(line);
      notifyOk(line);
    } catch (err) {
      const access = explainPerpsError(err);
      setTicketAccess(access);
      setStatus(access.message);
      notifyErr(access.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function cancelAll() {
    if (!walletClient || !address || busy) return;
    if (
      !window.confirm(`Cancel all open ${base} orders? This cannot be undone.`)
    )
      return;
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
      setTicketAccess(access);
      setStatus(access.message);
      notifyErr(access.message);
    } finally {
      setBusy(false);
    }
  }

  const long = side === "BUY";
  const loggedOut = mount === "ready" && !isConnected;
  const levPresets = [
    ...new Set(
      [1, 2, 5, 10, 25, 50, instrument.maxLeverage].filter(
        (n) => n <= instrument.maxLeverage,
      ),
    ),
  ].sort((a, b) => a - b);
  const field = "lg-input num mt-0.5 w-full px-2 py-1 text-[12px]";
  const fromEvent = bias === "long" || bias === "short";

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
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface)] text-[13px]">
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Order ticket</h2>
          <span className="text-xs text-[var(--muted)]">{base}</span>
        </div>
        {perpsAccess?.kind === "invite" ? (
          <PerpsAccessAlert
            access={perpsAccess}
            className="border border-[var(--line)]"
          />
        ) : null}
        {thesis ? (
          <div>
            <p className="mb-0.5 text-[11px] text-[var(--dim)]">
              {fromEvent ? "From event" : "Thesis"}
            </p>
            <p className="leading-5 text-[var(--text)]">{thesis}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            aria-pressed={long}
            onClick={() => setSide("BUY")}
            className={cn(
              buttonVariants({ variant: long ? "long" : "ghost", size: "sm" }),
              "h-9 rounded-[6px]",
            )}
          >
            Long
          </button>
          <button
            type="button"
            aria-pressed={!long}
            onClick={() => setSide("SELL")}
            className={cn(
              buttonVariants({
                variant: !long ? "short" : "ghost",
                size: "sm",
              }),
              "h-9 rounded-[6px]",
            )}
          >
            Short
          </button>
        </div>

        <div className="flex items-center gap-1">
          {(["IOC", "GTC"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tif === id}
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
            <input
              type="checkbox"
              checked={reduceOnly}
              onChange={(e) => setReduceOnly(e.target.checked)}
            />
            Reduce
          </label>
        </div>

        {tif === "GTC" ? (
          <label className="block text-[11px] text-[var(--dim)]">
            Price
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={field}
            />
          </label>
        ) : null}

        <div>
          <div className="flex items-center justify-between text-[11px] text-[var(--dim)]">
            <span className="flex items-center gap-1.5">
              Size
              <span className="inline-flex rounded-[4px] bg-[var(--elevated)] p-px">
                {(["usd", "base"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => changeSizeUnit(unit)}
                    className={cn(
                      "rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium",
                      sizeUnit === unit
                        ? "bg-[var(--hover)] text-[var(--text)]"
                        : "text-[var(--dim)] hover:text-[var(--muted)]",
                    )}
                  >
                    {unit === "usd" ? "USD" : base}
                  </button>
                ))}
              </span>
            </span>
            <span className="num text-[12px] text-[var(--muted)]">
              {sizeTrailingHint(sizeUnit, size, qtyStr, base, notional)}
            </span>
          </div>
          <div className="mt-0.5 flex gap-1">
            <button
              type="button"
              aria-label="Decrease order size"
              onClick={() => bump(-1)}
              className="w-7 rounded-[6px] bg-[var(--elevated)] text-[var(--muted)] hover:bg-[var(--hover)]"
            >
              −
            </button>
            <input
              aria-label="Order size"
              inputMode="decimal"
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              className="lg-input num w-full px-2 py-1 text-[12px]"
            />
            <button
              type="button"
              aria-label="Increase order size"
              onClick={() => bump(1)}
              className="w-7 rounded-[6px] bg-[var(--elevated)] text-[var(--muted)] hover:bg-[var(--hover)]"
            >
              +
            </button>
          </div>
          {belowMin ? (
            <p className="mt-1 text-[11px] text-[var(--warn)]">
              Min {fmtUsd(minNotional)}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              type="button"
              disabled={free == null || free <= 0}
              onClick={() => applyPct(pct)}
              className="rounded-[4px] bg-[var(--elevated)] py-1 text-[11px] text-[var(--dim)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            >
              {pct * 100}%
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--dim)]">
          <span>Leverage</span>
          <span className="num text-[12px] text-[var(--text)]">
            {leverage}x
          </span>
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
          aria-label="Leverage"
          type="range"
          min={1}
          max={instrument.maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-[var(--mark)]"
        />

        <details className="rounded-[6px] bg-[var(--elevated)] px-2 py-1.5">
          <summary className="cursor-pointer text-[12px] text-[var(--muted)]">
            Advanced
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-[var(--dim)]">
              Take profit
              <input
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                placeholder="—"
                className={field}
              />
            </label>
            <label className="text-[11px] text-[var(--dim)]">
              Stop loss
              <input
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                placeholder="—"
                className={field}
              />
            </label>
          </div>
        </details>

        <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] text-[var(--dim)]">
          <div>
            Margin
            <div className="num text-[12px] text-[var(--text)]">
              {fmtPx(marginEst, 2)}
            </div>
          </div>
          <div>
            Est. liq
            <div className="num text-[12px] text-[var(--text)]">
              {liq != null ? fmtPx(liq, instrument.priceDecimals) : "—"}
            </div>
          </div>
          <div className="text-right">
            Funding
            <div
              className={`num text-[12px] ${ticker ? signedClass(ticker.fundingRate) : "text-[var(--text)]"}`}
            >
              {ticker ? fmtFunding(ticker.fundingRate) : "—"}
            </div>
            <div className="num text-[var(--muted)]">
              {ticker ? fmtCountdown(ticker.nextFunding) : ""}
            </div>
          </div>
        </div>
        {free != null ? (
          <p className="num text-[11px] text-[var(--muted)]">
            {fmtUsd(free)} free
          </p>
        ) : null}
        {validation ? (
          <p className="text-xs leading-5 text-[var(--warn)]">{validation}</p>
        ) : null}
        <Button
          type="button"
          variant={long ? "long" : "short"}
          disabled={busy || !!validation}
          onClick={openReview}
          className="h-10 w-full rounded-[6px] text-[13px]"
        >
          {busy ? "Submitting…" : "Review order"}
        </Button>
        <Dialog
          open={!!review}
          onOpenChange={(open) => {
            if (!open && !busy) setReview(null);
          }}
        >
          <DialogContent
            showCloseButton={!busy}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
            className="max-h-[85dvh] overflow-y-auto"
          >
            <DialogTitle>Review {base} order</DialogTitle>
            <DialogDescription>
              Confirm the exact order below. Market execution and costs can
              differ from these estimates.
            </DialogDescription>
            {review ? (
              <dl className="divide-y divide-[var(--line)] text-sm">
                {[
                  [
                    "Direction",
                    review.side === "BUY" ? "Long / buy" : "Short / sell",
                  ],
                  ["Quantity", `${review.quantityText} ${base}`],
                  [
                    "Type",
                    review.tif === "IOC"
                      ? "Market · immediate or cancel"
                      : "Limit · good until cancelled",
                  ],
                  [
                    review.tif === "IOC" ? "Reference mark" : "Limit price",
                    fmtPx(review.price, instrument.priceDecimals),
                  ],
                  [
                    "Leverage / margin",
                    `${review.leverage}× · ${review.isolatedOnly ? "Isolated" : "Cross"}`,
                  ],
                  ["Reduce only", review.reduceOnly ? "Yes" : "No"],
                  [
                    "Current position",
                    review.position == null
                      ? "Unavailable"
                      : `${review.position} ${base}`,
                  ],
                  [
                    "Estimated margin",
                    fmtUsd((review.quantity * review.price) / review.leverage),
                  ],
                  [
                    "Take profit / stop loss",
                    `${review.takeProfit || "None"} / ${review.stopLoss || "None"}`,
                  ],
                  [
                    "Trading fees / slippage",
                    "Determined by venue; excluded from margin estimate",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-6 py-2">
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="max-w-[60%] text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {status ? (
              <p role="status" className="text-sm text-[var(--warn)]">
                {status}
              </p>
            ) : null}
            <Button
              disabled={busy || (loggedOut ? !onLogin : !canTrade)}
              onClick={() => {
                if (loggedOut) {
                  setReview(null);
                  onLogin?.();
                  return;
                }
                void submit();
              }}
            >
              {busy
                ? "Submitting…"
                : loggedOut
                  ? "Log in to trade"
                  : "Confirm order"}
            </Button>
            {!canTrade && !loggedOut ? (
              <p className="text-xs text-[var(--muted)]">
                {hint ??
                  "Trading is unavailable until your account and location are verified."}
              </p>
            ) : null}
          </DialogContent>
        </Dialog>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canTrade || busy}
            onClick={() => void cancelAll()}
            className="lg-focus text-[12px] text-[var(--dim)] hover:text-[var(--muted)] disabled:opacity-40"
          >
            Cancel open
          </button>
          {perpsAccess?.kind === "invite" ? null : perpsAccess?.href ? (
            <a
              href={PERPS_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[12px] text-[var(--mark)] hover:underline"
            >
              {PERPS_INVITE_LABEL}
            </a>
          ) : null}
        </div>
        {hint ? (
          <p className="text-[12px] leading-4 text-[var(--muted)]">{hint}</p>
        ) : null}
        <p className="text-xs leading-5 text-[var(--muted)]">
          {instrument.isolatedOnly ? "Isolated" : "Cross"} margin · estimates
          exclude fees.{" "}
          {tif === "IOC"
            ? "Market execution may differ from the mark price."
            : "Limit orders remain open until filled or canceled."}
        </p>
        {status ? (
          <p role="status" className="text-[13px] leading-4 text-[var(--warn)]">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
