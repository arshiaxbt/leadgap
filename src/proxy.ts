import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowRequest, clientIp } from "@/lib/rate-limit";

/** Per-isolate only. Vercel WAF rate limits for these paths need Pro; Hobby keeps this Map. */

function bucket(path: string): { key: string; limit: number } {
  if (path === "/api/builder/sign") return { key: path, limit: 30 };
  if (path === "/api/ingest") return { key: path, limit: 5 };
  if (path === "/api/book" || path === "/api/klines") return { key: path, limit: 40 };
  return { key: "api", limit: 120 };
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip = clientIp(request);
  const { key, limit } = bucket(path);
  if (!allowRequest(`${ip}:${key}`, limit)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
