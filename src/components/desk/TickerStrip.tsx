"use client";

import { PairPicker } from "@/components/desk/PairPicker";
import { MenuSelect } from "@/components/MenuSelect";
import type { TicketPreview } from "@/components/OrderTicket";
import { fmtCountdown, fmtFunding, fmtPct, fmtPx, fmtUsd, signedClass } from "@/lib/format";
import { useDeskPosition } from "@/lib/useDeskPosition";
import type { KlineInterval, PerpsInstrument, PerpsTicker } from "@/lib/types";
import { Segmented } from "@/components/ui";

export function TickerStrip({
  instrument,
  ticker,
  instruments,
  interval,
  onInterval,
  preview,
}: {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  instruments: PerpsInstrument[];
  interval: KlineInterval;
  onInterval: (v: KlineInterval) => void;
  preview?: TicketPreview | null;
}) {
  const { position, tpSl } = useDeskPosition(instrument.instrumentId);
  const change = ticker?.change1h ?? null;
  const digits = instrument.priceDecimals;
  const liq = position?.liq ?? preview?.liq ?? null;
  const margin = position ? position.margin : preview?.margin;
  const tp = (position ? tpSl.tp : preview?.tp) || "";
  const sl = (position ? tpSl.sl : preview?.sl) || "";

  return (
    <div className="lg-toolbar h-auto min-h-8 flex-wrap gap-x-3 gap-y-1 overflow-x-auto px-2 py-1 text-[11px] xl:h-8 xl:flex-nowrap xl:py-0">
      <PairPicker instrument={instrument} instruments={instruments} />
      <span className="num text-[15px] font-semibold text-[var(--text)]">
        {ticker ? fmtPx(ticker.markPrice, digits) : "—"}
      </span>
      <Stat
        label="1h"
        value={change != null ? fmtPct(change) : "—"}
        className={change != null ? signedClass(change) : ""}
      />
      <Stat hide="hidden md:inline" label="Index" value={ticker ? fmtPx(ticker.indexPrice, digits) : "—"} />
      <Stat
        label="Funding"
        value={ticker ? fmtFunding(ticker.fundingRate) : "—"}
        className={ticker ? signedClass(ticker.fundingRate) : ""}
      />
      <Stat hide="hidden lg:inline" label="Next" value={ticker ? fmtCountdown(ticker.nextFunding) : "—"} />
      <Stat
        label="Liq"
        value={liq != null ? fmtPx(liq, digits) : "—"}
      />
      <Stat
        label="Margin"
        value={margin != null && margin > 0 ? fmtUsd(margin) : "—"}
      />
      <Stat label="TP" value={tp ? fmtPx(Number(tp), digits) : "—"} />
      <Stat label="SL" value={sl ? fmtPx(Number(sl), digits) : "—"} />
      <Stat hide="hidden lg:inline" label="OI" value={ticker ? fmtPx(ticker.openInterest, 2) : "—"} />
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
