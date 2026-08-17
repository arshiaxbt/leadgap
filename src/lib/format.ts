import type { PerpsCategory, SessionLabel } from "./types";

/** Axis / series precision: honor instrument decimals, then bump for sub-dollar marks. */
export function priceDigits(decimals: number, sample = 0): number {
  let d = Math.max(0, decimals);
  if (sample > 0 && sample < 1) {
    d = Math.max(d, Math.min(8, Math.ceil(-Math.log10(sample)) + 2));
  }
  return Math.max(2, Math.min(8, d));
}

export function fmtPx(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const frac = abs >= 1 ? digits : Math.max(digits, 6);
  return n.toLocaleString("en-US", { maximumFractionDigits: frac });
}

export function fmtPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

/** Yes probability in 0–1, shown as a percent (Polymarket-style). */
export function fmtOdds(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtOddsRange(from: number, to: number): string {
  return `${fmtOdds(from)} → ${fmtOdds(to)}`;
}

/** Absolute change in Yes probability, in percentage points. */
export function fmtOddsDelta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)} pts`;
}

export function fmtScore(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

export function fmtFunding(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(4)}%`;
}

export function signedClass(n: number): string {
  if (n > 0.0000001) return "text-[var(--long)]";
  if (n < -0.0000001) return "text-[var(--short)]";
  return "text-[var(--dim)]";
}

export function sessionLabel(category: PerpsCategory, now = new Date()): SessionLabel {
  if (category === "crypto") return "24h";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const mins = hour * 60 + minute;
  const weekend = weekday === "Sat" || weekday === "Sun";
  const rth = !weekend && mins >= 9 * 60 + 30 && mins < 16 * 60;
  return rth ? "RTH" : "overnight";
}

export function mmr(maxLeverage: number): number {
  return 0.5 / maxLeverage;
}

export function estLiq(mark: number, leverage: number, maint: number, side: "BUY" | "SELL"): number | null {
  if (!(mark > 0) || !(leverage > 0)) return null;
  const move = 1 / leverage - maint;
  if (move <= 0) return mark;
  return side === "BUY" ? mark * (1 - move) : mark * (1 + move);
}

export function fmtCountdown(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const abs = ts < 1e12 ? ts * 1000 : ts;
  const ms = abs - Date.now();
  if (ms <= 0) return "now";
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function shortAddr(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return fmtPx(n, 2);
}

export function leaderCopy(leader: "odds" | "perp" | "flat"): string {
  switch (leader) {
    case "odds":
      return "Odds first";
    case "perp":
      return "Perp first";
    case "flat":
      return "In line";
    default: {
      const _never: never = leader;
      return _never;
    }
  }
}

export function fmtUsd(n: string | number | undefined): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return String(n);
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function clampQtyDecimals(decimals: number): number {
  if (!Number.isFinite(decimals)) return 0;
  return Math.max(0, Math.min(12, Math.trunc(decimals)));
}

function trimQtyZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "") || "0";
}

/** Floor a size to the venue's quantity precision. Never exceeds `decimals` places. */
export function formatOrderQty(n: number, decimals: number): string {
  const d = clampQtyDecimals(decimals);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const factor = 10 ** d;
  const snapped = Math.floor(n * factor + 1e-9) / factor;
  if (!(snapped > 0)) return "0";
  if (d === 0) return String(Math.trunc(snapped));
  return trimQtyZeros(snapped.toFixed(d));
}

export function qtyStep(decimals: number): number {
  const d = clampQtyDecimals(decimals);
  return d === 0 ? 1 : 10 ** -d;
}

export function formatUsdSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const snapped = Math.floor(n * 100 + 1e-9) / 100;
  if (!(snapped > 0)) return "0";
  return trimQtyZeros(snapped.toFixed(2));
}

export function defaultUsdSize(minNotional: string | number | undefined): string {
  const min = Number(minNotional);
  const floor = Number.isFinite(min) && min > 0 ? min : 10;
  return String(Math.max(100, Math.ceil(floor)));
}

/** Snap a position size for reduce-only close. Prefer instrument decimals when known. */
export function formatCloseQty(size: string | number, decimals?: number): string {
  const raw = typeof size === "string" ? size.trim() : String(size);
  const n = Math.abs(Number(raw));
  if (typeof decimals === "number" && Number.isFinite(decimals)) {
    return formatOrderQty(n, decimals);
  }
  const frac = raw.replace(/^-/, "").split(".")[1];
  const inferred = frac ? Math.min(12, frac.length) : 0;
  return formatOrderQty(n, inferred);
}

export function isBuySide(side: string): boolean {
  const s = side.toUpperCase();
  return s === "BUY" || s === "LONG" || s === "B";
}

export function sideLabel(side: string): "Long" | "Short" {
  return isBuySide(side) ? "Long" : "Short";
}

export function sideTone(side: string): string {
  return isBuySide(side) ? "text-[var(--long)]" : "text-[var(--short)]";
}

export function marketBase(symbol?: string | null): string {
  if (!symbol) return "—";
  return symbol.replace(/-USD$/i, "");
}

export function fmtStamp(ts: number | undefined): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function orderTypeLabel(order: {
  tpSlKind?: string;
  reduceOnly?: boolean;
  timeInForce?: string;
}): string {
  switch (order.tpSlKind) {
    case "tp":
      return "TP";
    case "sl":
      return "SL";
    default:
      break;
  }
  const tif = (order.timeInForce ?? "GTC").toUpperCase();
  let base: string;
  switch (tif) {
    case "GTC":
      base = "Limit";
      break;
    case "IOC":
      base = "IOC";
      break;
    case "FOK":
      base = "FOK";
      break;
    default:
      base = tif || "Limit";
      break;
  }
  return order.reduceOnly ? `Reduce ${base}` : base;
}

export function fmtUsdSigned(n: string | number | undefined): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$${abs}`;
}
