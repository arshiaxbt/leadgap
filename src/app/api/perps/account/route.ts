import { NextResponse } from "next/server";
import { allowRequest, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PORTFOLIO_URL = "https://api.perpetuals.polymarket.com/v1/info/portfolio";
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function missingAccount(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const error = "error" in body ? String((body as { error?: unknown }).error ?? "").toLowerCase() : "";
  return error.includes("account not found") || error === "not_found";
}

function hasPortfolio(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return "equity" in body || "positions" in body;
}

export async function GET(req: Request) {
  if (!allowRequest(`perps-account:${clientIp(req)}`, 40)) {
    return NextResponse.json({ exists: null }, { status: 429 });
  }

  const url = new URL(req.url);
  const addresses = [...new Set(url.searchParams.getAll("address").map((a) => a.trim()).filter((a) => ADDR_RE.test(a)))];
  if (!addresses.length) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  let found = false;
  let missing = 0;
  let failed = 0;
  for (const address of addresses) {
    try {
      const res = await fetch(`${PORTFOLIO_URL}?address=${encodeURIComponent(address)}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      const body: unknown = await res.json().catch(() => null);
      if (hasPortfolio(body)) {
        found = true;
        break;
      }
      if (missingAccount(body) || res.status === 400 || res.status === 404) missing += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  if (found) return NextResponse.json({ exists: true });
  if (missing > 0 && failed === 0) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: null });
}
