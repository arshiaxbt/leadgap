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
