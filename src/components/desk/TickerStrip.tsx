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
  /** Data transport status, e.g. STREAMING or POLLING. */
  status?: { label: string; warn: boolean };
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
  status,
}: Props & { position: DeskPosition | null; tpSl: DeskTpSl }) {
  const change = ticker?.change1h ?? null;
  const digits = instrument.priceDecimals;
  const showRisk = Boolean(position) || Boolean(preview && preview.qty > 0);
  const liq = position?.liq ?? preview?.liq ?? null;
  const margin = position ? position.margin : preview?.margin;
  const tp = (position ? tpSl.tp : preview?.tp) || "";
  const sl = (position ? tpSl.sl : preview?.sl) || "";

  return (
    <div className="flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-[26px] gap-y-3 overflow-x-auto border-b border-line bg-chrome px-5 py-3 xl:flex-nowrap xl:py-0">
      <h1 className="sr-only">
        {instrument.symbol.replace("-USD", "")} trading desk
      </h1>
      <PairPicker
        instrument={instrument}
        instruments={instruments}
        events={events}
      />
      <span className="num text-[24px] leading-none font-medium tracking-[-0.02em] text-text">
        {ticker ? fmtPx(ticker.markPrice, digits) : "—"}
      </span>
      <div className="flex items-center gap-6 text-[12px]">
        <Stat
          label="1H"
          value={change != null ? fmtPct(change) : "—"}
          className={change != null ? signedClass(change) : ""}
        />
        <Stat
          hide="hidden md:flex"
          label="INDEX"
          value={ticker ? fmtPx(ticker.indexPrice, digits) : "—"}
        />
        <Stat
          label={`FUNDING${ticker ? ` · ${fmtCountdown(ticker.nextFunding).toUpperCase()}` : ""}`}
          value={ticker ? fmtFunding(ticker.fundingRate) : "—"}
          className={ticker ? signedClass(ticker.fundingRate) : ""}
        />
        <Stat
          hide="hidden lg:flex"
          label="OPEN INTEREST"
          value={ticker ? fmtPx(ticker.openInterest, 2) : "—"}
        />
        <Stat
          hide="hidden lg:flex"
          label="MAX LEV"
          value={`${instrument.maxLeverage}×`}
        />
        {showRisk ? (
          <>
            <Stat
              label="LIQ"
              value={liq != null ? fmtPx(liq, digits) : "—"}
              className="text-short"
            />
            <Stat
              hide="hidden 2xl:flex"
              label="MARGIN"
              value={margin != null && margin > 0 ? fmtUsd(margin) : "—"}
            />
            <Stat
              hide="hidden 2xl:flex"
              label="TP"
              value={tp ? fmtPx(Number(tp), digits) : "—"}
            />
            <Stat
              hide="hidden 2xl:flex"
              label="SL"
              value={sl ? fmtPx(Number(sl), digits) : "—"}
            />
          </>
        ) : null}
      </div>
      {status ? (
        <span
          role="status"
          className={`feed-status ml-auto ${status.warn ? "text-warn" : ""}`}
        >
          <span
            className="status-dot"
            data-state={status.warn ? "stale" : "fresh"}
            aria-hidden
          />
          {status.label}
        </span>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
  hide = "flex",
}: {
  label: string;
  value: string;
  className?: string;
  hide?: string;
}) {
  return (
    <span className={`shrink-0 flex-col gap-[3px] ${hide}`}>
      <span className="num text-[10px] tracking-[0.08em] text-dim">{label}</span>
      <span className={`num text-mark ${className}`}>{value}</span>
    </span>
  );
}
