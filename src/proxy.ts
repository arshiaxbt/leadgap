import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowRequest, clientIp } from "@/lib/rate-limit";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip = clientIp(request);
  const limit = path === "/api/builder/sign" ? 30 : path === "/api/ingest" ? 5 : 120;
  const key = `${ip}:${path === "/api/builder/sign" || path === "/api/ingest" ? path : "api"}`;
  if (!allowRequest(key, limit)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
