import { NextResponse } from "next/server";
import { buildHmacSignature } from "@polymarket/client";
import { builderApiCreds } from "@/lib/builder-server";
import {
  allowedBuilderMethod,
  allowedBuilderOrigin,
  allowedBuilderPath,
  verifyPrivyBearer,
} from "@/lib/privy-server";
import { allowRequest, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!allowedBuilderOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const identity = await verifyPrivyBearer(req);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Geo is enforced at the trading boundary (assertCanTrade / placeOrder), not HMAC signing.
  const signKey = `sign:${identity.userId}:${clientIp(req)}`;
  if (!allowRequest(signKey, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const credentials = builderApiCreds();
  if (!credentials) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  let body: { method?: string; path?: string; body?: string };
  try {
    body = (await req.json()) as { method?: string; path?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const method = (body.method ?? "GET").toUpperCase();
  const path = body.path ?? "";
  if (!allowedBuilderMethod(method) || !allowedBuilderPath(path)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[builder/sign] rejected", method, path.split("?")[0]);
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await buildHmacSignature(
    credentials.secret,
    timestamp,
    method,
    path,
    body.body,
  );
  return NextResponse.json({
    POLY_BUILDER_API_KEY: credentials.key,
    POLY_BUILDER_PASSPHRASE: credentials.passphrase,
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: `${timestamp}`,
  });
}
