import { NextResponse } from "next/server";
import { allowRequest, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PORTFOLIO_URL = "https://api.perpetuals.polymarket.com/v1/info/portfolio";
const INVITE_URL = "https://api.perpetuals.polymarket.com/v1/info/invite";
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const HEADERS = {
  accept: "application/json",
  "user-agent": "Leadgap/1.0 (+https://www.leadgap.xyz)",
};

type Probe = {
  exists: boolean | null;
  equity: number | null;
};

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function missingAccount(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const error = "error" in body ? String((body as { error?: unknown }).error ?? "").toLowerCase() : "";
  return error.includes("account not found") || error === "not_found";
}

function portfolioEquity(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  if (!("equity" in body) && !("positions" in body)) return null;
  return num((body as { equity?: unknown }).equity) ?? 0;
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: HEADERS,
    signal: AbortSignal.timeout(8_000),
  });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function inviteExists(address: string): Promise<boolean | null> {
  const { body } = await fetchJson(`${INVITE_URL}?code=leadgap&address=${encodeURIComponent(address)}`);
  if (!body || typeof body !== "object") return null;
  const error = "error" in body ? String((body as { error?: unknown }).error ?? "").toLowerCase() : "";
  if (error.includes("address already exists") || error.includes("already has")) return true;
  if (error.includes("code not found") || error.includes("invalid")) return false;
  if ("valid" in body && (body as { valid?: unknown }).valid === true) return false;
  return null;
}

async function probeAddress(address: string): Promise<Probe> {
  let exists: boolean | null = null;
  let equity: number | null = null;
  try {
    exists = await inviteExists(address);
  } catch {
    exists = null;
  }
  try {
    const { status, body } = await fetchJson(`${PORTFOLIO_URL}?address=${encodeURIComponent(address)}`);
    const nextEquity = portfolioEquity(body);
    if (nextEquity != null) {
      equity = nextEquity;
      exists = true;
    } else if (missingAccount(body) || status === 400 || status === 404) {
      if (exists !== true) exists = false;
    }
  } catch {
    // keep invite result
  }
  return { exists, equity };
}

export async function GET(req: Request) {
  if (!allowRequest(`perps-account:${clientIp(req)}`, 40)) {
    return NextResponse.json({ exists: null, equity: null }, { status: 429 });
  }

  const url = new URL(req.url);
  const addresses = [...new Set(url.searchParams.getAll("address").map((a) => a.trim()).filter((a) => ADDR_RE.test(a)))];
  if (!addresses.length) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  let found = false;
  let missing = 0;
  let unknown = 0;
  let equity: number | null = null;
  for (const address of addresses) {
    const probe = await probeAddress(address);
    if (probe.exists === true) {
      found = true;
      if (probe.equity != null && (equity == null || probe.equity > equity)) equity = probe.equity;
    } else if (probe.exists === false) missing += 1;
    else unknown += 1;
  }

  if (found) return NextResponse.json({ exists: true, equity: equity ?? 0 });
  if (missing > 0 && unknown === 0) return NextResponse.json({ exists: false, equity: null });
  return NextResponse.json({ exists: null, equity: null });
}
