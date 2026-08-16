import { PrivyClient } from "@privy-io/server-auth";
import { APP_ORIGIN } from "@/lib/brand";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

/** Paths the Polymarket client actually HMAC-signs for CreateProxy, CLOB, relayer, and perps. */
const ALLOWED_PATH_PREFIXES = [
  "/auth",
  "/order",
  "/orders",
  "/order-scoring",
  "/orders-scoring",
  "/data/orders",
  "/submit",
  "/v1/account",
  "/v1/trade",
  "/v1/builder",
  "/v1/builders",
  "/v1/positions",
  "/v1/market-positions",
  "/v1/activity",
  "/v1/collateral-return",
  "/v1/accounting",
] as const;

let client: PrivyClient | null = null;

function privyAppId(): string | undefined {
  return process.env.PRIVY_APP_ID?.trim() || process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
}

function privyClient(): PrivyClient | null {
  const appId = privyAppId();
  const secret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !secret) return null;
  if (!client) client = new PrivyClient(appId, secret);
  return client;
}

export function allowedBuilderOrigin(req: Request): boolean {
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return false;
  if (origin === APP_ORIGIN) return true;
  try {
    const host = new URL(origin).hostname;
    if (process.env.VERCEL_ENV === "preview") {
      return host.endsWith(".vercel.app") && host.startsWith("leadgap");
    }
    if (process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && process.env.VERCEL)) {
      return false;
    }
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function allowedBuilderMethod(method: string): boolean {
  return ALLOWED_METHODS.has(method.toUpperCase());
}

export function allowedBuilderPath(path: string): boolean {
  if (!path.startsWith("/") || path.includes("..") || path.includes("://") || path.includes("\\")) {
    return false;
  }
  const pathname = path.split("?")[0] ?? path;
  return ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type PrivyIdentity = { userId: string };

export async function verifyPrivyBearer(req: Request): Promise<PrivyIdentity | null> {
  const privy = privyClient();
  if (!privy) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    if (!claims.userId) return null;
    return { userId: claims.userId };
  } catch {
    return null;
  }
}
