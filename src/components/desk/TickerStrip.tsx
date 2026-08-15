"use client";

import { PairPicker } from "@/components/desk/PairPicker";
import { MenuSelect } from "@/components/MenuSelect";
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
    <div className="lg-toolbar h-auto min-h-8 flex-wrap gap-x-3 gap-y-1 overflow-x-auto px-2 py-1 text-[11px] xl:h-8 xl:flex-nowrap xl:py-0">
      <PairPicker instrument={instrument} instruments={instruments} />
      <span className="num text-[15px] font-semibold text-[var(--text)]">
        {ticker ? fmtPx(ticker.markPrice, instrument.priceDecimals) : "—"}
      </span>
      <Stat
        label="1h"
        value={change != null ? fmtPct(change) : "—"}
        className={change != null ? signedClass(change) : ""}
      />
      <Stat hide="hidden md:inline" label="Index" value={ticker ? fmtPx(ticker.indexPrice, instrument.priceDecimals) : "—"} />
      <Stat
        label="Funding"
        value={ticker ? fmtFunding(ticker.fundingRate) : "—"}
        className={ticker ? signedClass(ticker.fundingRate) : ""}
      />
      <Stat label="Next" value={ticker ? fmtCountdown(ticker.nextFunding) : "—"} />
      <Stat hide="hidden lg:inline" label="OI" value={ticker ? fmtPx(ticker.openInterest, 2) : "—"} />
      <Stat hide="hidden lg:inline" label="Lev" value={`${instrument.maxLeverage}x`} />
      <Stat hide="hidden xl:inline" label="Session" value={sessionLabel(instrument.category)} />
      <div className="ml-auto hidden sm:block">
        <Segmented
          options={[
            { id: "1m", label: "1m" },
            { id: "5m", label: "5m" },
            { id: "15m", label: "15m" },
            { id: "30m", label: "30m" },
            { id: "1h", label: "1h" },
            { id: "4h", label: "4h" },
            { id: "1d", label: "1d" },
          ]}
          value={interval}
          onChange={onInterval}
        />
      </div>
      <MenuSelect
        ariaLabel="Interval"
        align="right"
        className="ml-auto py-0.5 text-[11px] sm:hidden"
        value={interval}
        onChange={onInterval}
        options={(["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const).map((id) => ({ id, label: id }))}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
  hide = "",
}: {
  label: string;
  value: string;
  className?: string;
  hide?: string;
}) {
  return (
    <span className={`shrink-0 text-[var(--dim)] ${hide}`}>
      {label} <span className={`num text-[var(--perp)] ${className}`}>{value}</span>
    </span>
  );
}
