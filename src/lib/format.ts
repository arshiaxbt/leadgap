import type { PerpsCategory, SessionLabel } from "./types";

export function fmtPx(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: digits });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function fmtPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

export function fmtOdds(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}¢`;
}

export function fmtOddsDelta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}¢`;
}

export function fmtScore(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

export function fmtFunding(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(4)}%`;
}

export function signedClass(n: number): string {
  if (n > 0.0000001) return "text-emerald-400";
  if (n < -0.0000001) return "text-rose-400";
  return "text-zinc-400";
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

export function leaderCopy(leader: "odds" | "perp" | "flat"): string {
  if (leader === "odds") return "Odds first";
  if (leader === "perp") return "Perp first";
  return "In line";
}

export function fmtUsd(n: string | number | undefined): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
