"use client";

import { PairPicker } from "@/components/desk/PairPicker";
import { fmtCountdown, fmtFunding, fmtPct, fmtPx, sessionLabel, signedClass } from "@/lib/format";
import type { KlineInterval, PerpsInstrument, PerpsTicker } from "@/lib/types";
import { Segmented } from "@/components/ui";

export function TickerStrip({
  instrument,
  ticker,
  instruments,
  interval,
  onInterval,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  instruments: PerpsInstrument[];
  interval: KlineInterval;
  onInterval: (v: KlineInterval) => void;
}) {
  const change = ticker?.change1h ?? null;
  return (
    <div className="flex h-8 items-center gap-x-3 overflow-x-auto border-b border-[#1a2030] bg-[#08090c] px-2 text-[11px]">
      <PairPicker instrument={instrument} instruments={instruments} />
      <span className="num text-[15px] font-semibold text-white">
        {ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}
      </span>
      <Stat label="Index" value={ticker ? fmtPx(ticker.indexPrice, instrument.priceDecimals) : "—"} />
      <Stat
        label="1h"
        value={change != null ? fmtPct(change) : "—"}
        className={change != null ? signedClass(change) : ""}
      />
      <Stat label="Funding" value={ticker ? fmtFunding(ticker.fundingRate) : "—"} />
      <Stat label="Next" value={ticker ? fmtCountdown(ticker.nextFunding) : "—"} />
      <Stat label="OI" value={ticker ? fmtPx(ticker.openInterest, 2) : "—"} />
      <Stat label="Lev" value={`${instrument.maxLeverage}x`} />
      <Stat label="Session" value={sessionLabel(instrument.category)} />
      <div className="ml-auto">
        <Segmented
          options={[
            { id: "1m", label: "1m" },
            { id: "5m", label: "5m" },
            { id: "15m", label: "15m" },
            { id: "1h", label: "1h" },
          ]}
          value={interval}
          onChange={onInterval}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <span className="text-[#5c6478]">
      {label} <span className={`num text-zinc-200 ${className}`}>{value}</span>
    </span>
  );
}
