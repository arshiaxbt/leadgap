"use client";

import { PairPicker } from "@/components/desk/PairPicker";
import type { TicketPreview } from "@/components/OrderTicket";
import {
  fmtCountdown,
  fmtFunding,
  fmtPct,
  fmtPx,
  fmtUsd,
  signedClass,
} from "@/lib/format";
import { usePrivyMount } from "@/lib/usePrivyMount";
import {
  useDeskPosition,
  type DeskPosition,
  type DeskTpSl,
} from "@/lib/useDeskPosition";
import type { PerpsInstrument, PerpsTicker, ResolvedEvent } from "@/lib/types";

type Props = {
  instrument: PerpsInstrument;
  ticker?: PerpsTicker;
  instruments: PerpsInstrument[];
  events?: ResolvedEvent[];
  preview?: TicketPreview | null;
};
export function TickerStrip(props: Props) {
  const mount = usePrivyMount();
  return mount === "ready" ? (
    <TickerStripSession {...props} />
  ) : (
    <TickerStripView {...props} position={null} tpSl={{ tp: "", sl: "" }} />
  );
}
function TickerStripSession(props: Props) {
  const { position, tpSl } = useDeskPosition(props.instrument.instrumentId);
  return <TickerStripView {...props} position={position} tpSl={tpSl} />;
}
function TickerStripView({
  instrument,
  ticker,
  instruments,
  events,
  preview,
  position,
  tpSl,
}: Props & { position: DeskPosition | null; tpSl: DeskTpSl }) {
  const change = ticker?.change1h ?? null;
  const digits = instrument.priceDecimals;
  const showRisk = Boolean(position) || Boolean(preview && preview.qty > 0);
  const liq = position?.liq ?? preview?.liq ?? null;
  const margin = position ? position.margin : preview?.margin;
  const tp = (position ? tpSl.tp : preview?.tp) || "";
  const sl = (position ? tpSl.sl : preview?.sl) || "";

  return (
    <div className="flex min-h-20 flex-wrap items-center gap-x-6 gap-y-3 overflow-x-auto border-b border-[var(--line)] bg-[var(--bg)] px-5 py-4 text-[12px] xl:flex-nowrap">
      <h1 className="sr-only">
        {instrument.symbol.replace("-USD", "")} trading desk
      </h1>
      <PairPicker
        instrument={instrument}
        instruments={instruments}
        events={events}
      />
      <span className="num text-[22px] font-medium leading-none text-[var(--text)]">
        {ticker ? fmtPx(ticker.markPrice, digits) : "—"}
      </span>
      <Stat
        label="1h"
        value={change != null ? fmtPct(change) : "—"}
        className={change != null ? signedClass(change) : ""}
      />
      <Stat
        hide="hidden md:inline"
        label="Index"
        value={ticker ? fmtPx(ticker.indexPrice, digits) : "—"}
      />
      <Stat
        label="Funding"
        value={
          ticker
            ? `${fmtFunding(ticker.fundingRate)} · ${fmtCountdown(ticker.nextFunding)}`
            : "—"
        }
        className={ticker ? signedClass(ticker.fundingRate) : ""}
      />
      <Stat
        hide="hidden lg:inline"
        label="OI"
        value={ticker ? fmtPx(ticker.openInterest, 2) : "—"}
      />
      {showRisk ? (
        <>
          <Stat label="Liq" value={liq != null ? fmtPx(liq, digits) : "—"} />
          <Stat
            label="Margin"
            value={margin != null && margin > 0 ? fmtUsd(margin) : "—"}
          />
          <Stat label="TP" value={tp ? fmtPx(Number(tp), digits) : "—"} />
          <Stat label="SL" value={sl ? fmtPx(Number(sl), digits) : "—"} />
        </>
      ) : null}
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
      {label}{" "}
      <span className={`num text-[var(--mark)] ${className}`}>{value}</span>
    </span>
  );
}
