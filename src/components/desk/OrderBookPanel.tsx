"use client";

import { fmtPx } from "@/lib/format";
import type { PerpsBook } from "@/lib/types";

export function OrderBookPanel({
  book,
  decimals,
  onPrice,
}: {
  book: PerpsBook | null;
  decimals: number;
  onPrice?: (price: number) => void;
}) {
  const asks = (book?.asks ?? []).slice(0, 10).slice().reverse();
  const bids = (book?.bids ?? []).slice(0, 10);
  const bestAsk = book?.asks[0]?.price;
  const bestBid = book?.bids[0]?.price;
  const spread =
    bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const maxQty = Math.max(
    ...asks.map((l) => l.quantity),
    ...bids.map((l) => l.quantity),
    0.0001,
  );

  return (
    <div className="flex h-full min-h-[180px] flex-col text-[11px]">
      <div className="flex items-center justify-between border-b border-[#1e2636] px-3 py-1.5 text-[#5c6478]">
        <span>Order book</span>
        <span className="num">
          {spread != null ? `Spread ${fmtPx(spread, decimals)}` : "—"}
        </span>
      </div>
      <div className="grid grid-cols-3 px-3 py-1 text-[#5c6478]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {asks.map((level) => (
          <Row
            key={`a-${level.price}`}
            level={level}
            maxQty={maxQty}
            decimals={decimals}
            side="ask"
            onPrice={onPrice}
          />
        ))}
        <div className="num border-y border-[#1e2636] px-3 py-1 text-center text-xs text-white">
          {bestBid != null && bestAsk != null
            ? `${fmtPx(bestBid, decimals)}  /  ${fmtPx(bestAsk, decimals)}`
            : "—"}
        </div>
        {bids.map((level) => (
          <Row
            key={`b-${level.price}`}
            level={level}
            maxQty={maxQty}
            decimals={decimals}
            side="bid"
            onPrice={onPrice}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  level,
  maxQty,
  decimals,
  side,
  onPrice,
}: {
  level: { price: number; quantity: number };
  maxQty: number;
  decimals: number;
  side: "bid" | "ask";
  onPrice?: (price: number) => void;
}) {
  const pct = Math.min(100, (level.quantity / maxQty) * 100);
  return (
    <button
      type="button"
      onClick={() => onPrice?.(level.price)}
      className="relative grid w-full grid-cols-3 px-3 py-0.5 text-left hover:bg-white/[0.04]"
    >
      <span
        className="absolute inset-y-0 right-0 opacity-20"
        style={{
          width: `${pct}%`,
          background: side === "bid" ? "#3ee0a8" : "#fb7185",
        }}
      />
      <span className={`num relative ${side === "bid" ? "text-[#3ee0a8]" : "text-rose-300"}`}>
        {fmtPx(level.price, decimals)}
      </span>
      <span className="num relative text-right text-zinc-300">{fmtPx(level.quantity, 4)}</span>
      <span className="num relative text-right text-[#8b93a7]">
        {fmtPx(level.price * level.quantity, 0)}
      </span>
    </button>
  );
}
