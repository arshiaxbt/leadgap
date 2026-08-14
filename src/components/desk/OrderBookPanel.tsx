"use client";

import { fmtPx } from "@/lib/format";
import type { PerpsBook } from "@/lib/types";

const LEVELS = 8;

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
  const mid = bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : null;
  const bidQty = bids.reduce((s, l) => s + l.quantity, 0);
  const askQty = asksRaw.reduce((s, l) => s + l.quantity, 0);
  const tot = bidQty + askQty || 1;
  const maxCum = Math.max(
    bids.reduce((s, l) => s + l.quantity, 0),
    asksRaw.reduce((s, l) => s + l.quantity, 0),
    0.0001,
  );

  let askCum = asksRaw.reduce((s, l) => s + l.quantity, 0);
  const askRows = asks.map((level) => {
    const row = { ...level, cum: askCum };
    askCum -= level.quantity;
    return row;
  });
  let bidCum = 0;
  const bidRows = bids.map((level) => {
    bidCum += level.quantity;
    return { ...level, cum: bidCum };
  });

  return (
    <div className="flex h-full min-h-0 flex-col text-[10px] leading-4">
      <div className="flex items-center justify-between px-2 py-1 text-[#5c6478]">
        <span>Book</span>
        <span className="num">{spread != null ? fmtPx(spread, decimals) : "—"}</span>
      </div>
      <div className="grid grid-cols-3 px-2 text-[#5c6478]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
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
        <div className="flex items-center justify-between border-y border-[#1e2636] px-2 py-0.5">
          <span className="num text-[11px] font-medium text-white">
            {mid != null ? fmtPx(mid, decimals) : "—"}
          </span>
          <span className="text-[#5c6478]">Spread</span>
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
      <div className="flex h-1.5 overflow-hidden">
        <div className="bg-[#3ee0a8]" style={{ width: `${(bidQty / tot) * 100}%` }} />
        <div className="bg-[#fb7185]" style={{ width: `${(askQty / tot) * 100}%` }} />
      </div>
      <div className="flex justify-between px-2 py-0.5 text-[9px] text-[#5c6478]">
        <span className="text-[#3ee0a8]">{((bidQty / tot) * 100).toFixed(0)}% bid</span>
        <span className="text-rose-300">{((askQty / tot) * 100).toFixed(0)}% ask</span>
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
      className="relative grid w-full grid-cols-3 px-2 text-left hover:bg-white/[0.04]"
    >
      <span
        className="absolute inset-y-0 right-0 opacity-25"
        style={{
          width: `${pct}%`,
          background: side === "bid" ? "#3ee0a8" : "#fb7185",
        }}
      />
      <span className={`num relative ${side === "bid" ? "text-[#3ee0a8]" : "text-rose-300"}`}>
        {fmtPx(level.price, decimals)}
      </span>
      <span className="num relative text-right text-zinc-300">{fmtPx(level.quantity, 4)}</span>
      <span className="num relative text-right text-[#8b93a7]">{fmtPx(level.cum, 3)}</span>
    </button>
  );
}
