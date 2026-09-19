"use client";

import { fmtPx } from "@/lib/format";
import type { PerpsBook } from "@/lib/types";

const LEVELS = 12;

export function OrderBookPanel({
  book,
  decimals,
  onPrice,
}: {
  book: PerpsBook | null;
  decimals: number;
  onPrice?: (price: number) => void;
}) {
  const asksRaw = (book?.asks ?? []).slice(0, LEVELS);
  const bids = (book?.bids ?? []).slice(0, LEVELS);
  const asks = asksRaw.slice().reverse();
  const bestAsk = book?.asks[0]?.price;
  const bestBid = book?.bids[0]?.price;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const mid =
    bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : null;
  const bidQty = bids.reduce((s, l) => s + l.quantity, 0);
  const askQty = asksRaw.reduce((s, l) => s + l.quantity, 0);
  const tot = bidQty + askQty || 1;
  const maxCum = Math.max(bidQty, askQty, 0.0001);
  const tick = (10 ** -Math.max(0, decimals)).toFixed(Math.max(0, decimals));

  const askRows = asks.map((level, i) => ({
    ...level,
    cum: asks.slice(i).reduce((sum, item) => sum + item.quantity, 0),
  }));
  const bidRows = bids.map((level, i) => ({
    ...level,
    cum: bids.slice(0, i + 1).reduce((sum, item) => sum + item.quantity, 0),
  }));

  return (
    <div className="flex h-full min-h-0 flex-col bg-side">
      <div className="flex items-center justify-between border-b border-line px-3 py-[11px]">
        <h2 className="kicker">Order book</h2>
        <span className="num text-[10px] text-dim" title="Price increment">
          {tick}
        </span>
      </div>
      <div className="num grid grid-cols-3 px-3 py-1.5 text-[10px] text-dim">
        <span>PRICE</span>
        <span className="text-right">SIZE</span>
        <span className="text-right">SUM</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {book ? null : (
          <p className="px-3 py-4 text-[12px] text-dim">Loading book…</p>
        )}
        {askRows.map((level) => (
          <Row
            key={`a-${level.price}`}
            level={level}
            maxCum={maxCum}
            decimals={decimals}
            side="ask"
            onPrice={onPrice}
          />
        ))}
        <div className="my-[3px] flex items-baseline justify-between bg-elevated px-3 py-2">
          <span className="num text-[14px] font-medium text-text">
            {mid != null ? fmtPx(mid, decimals) : "—"}
          </span>
          <span className="num text-[10px] text-dim">
            SPREAD {spread != null ? fmtPx(spread, decimals) : "—"}
          </span>
        </div>
        {bidRows.map((level) => (
          <Row
            key={`b-${level.price}`}
            level={level}
            maxCum={maxCum}
            decimals={decimals}
            side="bid"
            onPrice={onPrice}
          />
        ))}
      </div>
      <div className="shrink-0 border-t border-line px-3 py-[9px]">
        <div className="flex h-1 overflow-hidden rounded-[2px]" aria-hidden>
          <span className="bg-long" style={{ width: `${(bidQty / tot) * 100}%` }} />
          <span className="bg-short" style={{ width: `${(askQty / tot) * 100}%` }} />
        </div>
        <div className="num mt-1.5 flex justify-between text-[10px]">
          <span className="text-long">{((bidQty / tot) * 100).toFixed(0)}% BID</span>
          <span className="text-short">{((askQty / tot) * 100).toFixed(0)}% ASK</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  level,
  maxCum,
  decimals,
  side,
  onPrice,
}: {
  level: { price: number; quantity: number; cum: number };
  maxCum: number;
  decimals: number;
  side: "bid" | "ask";
  onPrice?: (price: number) => void;
}) {
  const pct = Math.min(100, (level.cum / maxCum) * 100);
  return (
    <button
      type="button"
      onClick={() => onPrice?.(level.price)}
      aria-label={`${side === "bid" ? "Bid" : "Ask"} ${fmtPx(level.price, decimals)}, size ${fmtPx(level.quantity, 4)}. Use as limit price`}
      className="lg-focus num relative grid min-h-[22px] w-full grid-cols-3 items-center px-3 text-left text-[11px] hover:bg-raise"
    >
      <span
        aria-hidden
        className="absolute inset-y-px right-0"
        style={{
          width: `${pct}%`,
          background:
            side === "bid" ? "rgba(79,212,160,0.16)" : "rgba(240,116,95,0.16)",
        }}
      />
      <span className={`relative ${side === "bid" ? "text-long" : "text-short"}`}>
        {fmtPx(level.price, decimals)}
      </span>
      <span className="relative text-right text-mark">
        {fmtPx(level.quantity, 4)}
      </span>
      <span className="relative text-right text-subtle">{fmtPx(level.cum, 3)}</span>
    </button>
  );
}
