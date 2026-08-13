import { NextResponse } from "next/server";
import { buildHmacSignature } from "@polymarket/client";
import { builderApiCreds } from "@/lib/builder-server";

export async function POST(req: Request) {
  const credentials = builderApiCreds();
  if (!credentials) {
    return NextResponse.json(
      { error: "Builder API key/secret/passphrase not configured" },
      { status: 503 },
    );
  }
  const body = (await req.json()) as { method?: string; path?: string; body?: string };
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await buildHmacSignature(
    credentials.secret,
    timestamp,
    body.method ?? "GET",
    body.path ?? "/",
    body.body,
  );
  return NextResponse.json({
    POLY_BUILDER_API_KEY: credentials.key,
    POLY_BUILDER_PASSPHRASE: credentials.passphrase,
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: `${timestamp}`,
  });
}
