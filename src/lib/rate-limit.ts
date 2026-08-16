const windows = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Returns true when the request is allowed. */
export function allowRequest(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const prior = (windows.get(key) ?? []).filter((t) => t > cutoff);
  if (prior.length >= limit) {
    windows.set(key, prior);
    return false;
  }
  prior.push(now);
  windows.set(key, prior);
  return true;
}
