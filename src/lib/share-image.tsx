import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { fmtOdds, fmtOddsDelta, fmtPct } from "@/lib/format";
import { perpName } from "@/lib/signal";
import { getGaps } from "@/lib/store";
import type { GapRow, GapWindow } from "@/lib/types";

export const SHARE_SIZE = { width: 1200, height: 630 };

const WINDOW: GapWindow = "4h";
const C = {
  bg: "#121210",
  surface: "#191916",
  elevated: "#22221D",
  line: "#2C2C26",
  text: "#F2F1EC",
  muted: "#A8A69C",
  dim: "#8F8D83",
  odds: "#CBF152",
  onLong: "#062318",
  onShort: "#2A0D07",
  mark: "#CFC3AE",
  band: "rgba(203,241,82,0.15)",
  long: "#4FD4A0",
  short: "#F0745F",
};

const FONT_DIR = join(process.cwd(), "src/assets/og");
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600 }[]> | null =
  null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(FONT_DIR, "InstrumentSans-SemiBold.ttf")).then((data) => ({
      name: "Instrument Sans",
      data,
      weight: 600 as const,
    })),
    readFile(join(FONT_DIR, "InstrumentSerif-Regular.ttf")).then((data) => ({
      name: "Instrument Serif",
      data,
      weight: 400 as const,
    })),
    readFile(join(FONT_DIR, "IBMPlexMono-Regular.ttf")).then((data) => ({
      name: "IBM Plex Mono",
      data,
      weight: 400 as const,
    })),
  ]).catch((error) => {
    fonts = null;
    throw error;
  });
  return fonts;
}

async function findRow(eventId: string, symbol: string): Promise<GapRow | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(resolve, 5_000, null));
  const lookup = getGaps(WINDOW)
    .then(
      (data) =>
        data.gaps.find((g) => g.eventId === eventId && g.symbol === symbol) ??
        null,
    )
    .catch(() => null);
  return Promise.race([lookup, timeout]);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The lime/bone gap band, drawn from the row's trace or its endpoints. */
function Band({ row, width, height }: { row: GapRow; width: number; height: number }) {
  const implied = row.trace?.implied.length ? row.trace.implied : [0, row.expected];
  const observed = row.trace?.observed.length ? row.trace.observed : [0, row.actual];
  const all = [0, ...implied, ...observed].filter(Number.isFinite);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const pad = 8;
  const x = (i: number, n: number) => pad + (i / Math.max(1, n - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const line = (vs: number[]) =>
    vs.map((v, i) => `${i ? "L" : "M"}${x(i, vs.length).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const band = `${line(implied)} ${[...observed]
    .map((v, i) => [v, i] as const)
    .reverse()
    .map(([v, i]) => `L${x(i, observed.length).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ")} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={`M${pad} ${y(0)} L${width - pad} ${y(0)}`} stroke={C.line} strokeWidth={2} strokeDasharray="6 8" />
      <path d={band} fill={C.band} />
      <path d={line(observed)} fill="none" stroke={C.mark} strokeWidth={4} strokeLinejoin="round" />
      <path d={line(implied)} fill="none" stroke={C.odds} strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={44} height={44} viewBox="0 0 24 24" fill="none">
        <path d="M2 17h9V7h11" stroke={C.odds} strokeWidth={2.4} strokeLinejoin="round" />
        <path d="M2 21h13v-7h7" stroke={C.mark} strokeWidth={2.4} strokeLinejoin="round" />
      </svg>
      <div style={{ fontFamily: "Instrument Sans", fontSize: 36, color: C.text }}>Leadgap</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
      <div style={{ fontSize: 17, letterSpacing: 2, color: C.dim }}>{label}</div>
      <div style={{ fontSize: 34, color }}>{value}</div>
    </div>
  );
}

function Direction({ row }: { row: GapRow }) {
  const name = perpName(row.symbol);
  if (row.bias === "none")
    return (
      <div style={{ display: "flex", padding: "10px 18px", borderRadius: 8, background: C.elevated, color: C.muted, fontSize: 22 }}>
        {`NO EDGE · ${name}`}
      </div>
    );
  const long = row.bias === "long";
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 18px",
        borderRadius: 8,
        background: long ? C.long : C.short,
        color: long ? C.onLong : C.onShort,
        fontSize: 22,
      }}
    >
      {`${long ? "LONG" : "SHORT"} ${name} · SCORE ${Math.round(row.score)}`}
    </div>
  );
}

function SignalCard({ row }: { row: GapRow }) {
  // The market question carries the strike ("above $116,000"); event titles use a blank.
  const question = clip(row.question || row.title, 130);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px 64px", background: C.bg, fontFamily: "IBM Plex Mono" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Logo />
        <div style={{ fontSize: 18, letterSpacing: 2, color: C.dim }}>
          {`${perpName(row.symbol)} · ${WINDOW.toUpperCase()} WINDOW`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 40,
          fontFamily: "Instrument Serif",
          fontSize: question.length > 80 ? 50 : 60,
          lineHeight: 1.12,
          color: C.text,
          maxWidth: 1072,
        }}
      >
        {question}
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Stat label="YES ODDS" value={fmtOdds(row.yesPrice)} color={C.text} />
            <Stat label="ODDS MOVE" value={fmtOddsDelta(row.oddsMove)} color={C.text} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Stat label="IMPLIED" value={fmtPct(row.expected)} color={C.odds} />
            <Stat label="OBSERVED" value={fmtPct(row.actual)} color={C.mark} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Direction row={row} />
            <div style={{ fontSize: 22, color: C.odds }}>{`GAP ${fmtPct(row.gap)}`}</div>
          </div>
        </div>
        <Band row={row} width={440} height={250} />
      </div>
    </div>
  );
}

function FallbackCard({ symbol }: { symbol: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "56px 64px", background: C.bg, fontFamily: "IBM Plex Mono" }}>
      <Logo />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: "Instrument Serif", fontSize: 68, color: C.text }}>
          {`${perpName(symbol) || "Signal"} vs the odds`}
        </div>
        <div style={{ fontFamily: "Instrument Serif", fontSize: 40, color: C.odds }}>
          Open Leadgap for the live gap.
        </div>
      </div>
      <div style={{ fontSize: 17, letterSpacing: 2, color: C.dim }}>
        POLYMARKET ODDS · MAPPED PERPS · THE GAP BETWEEN THEM
      </div>
    </div>
  );
}

/** Shared by the opengraph-image and twitter-image routes of a signal. */
export async function renderSignalImage(params: Promise<{ event: string; symbol: string }>) {
  const { event, symbol } = await params;
  const eventId = decodeURIComponent(event);
  const sym = decodeURIComponent(symbol).toUpperCase();
  const [row, fontData] = await Promise.all([findRow(eventId, sym), loadFonts()]);
  return new ImageResponse(row ? <SignalCard row={row} /> : <FallbackCard symbol={sym} />, {
    ...SHARE_SIZE,
    fonts: fontData.map((f) => ({ ...f, style: "normal" as const })),
    headers: {
      // Social crawlers fetch once; a short shared cache keeps the gap recent.
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
