const windows = new Map<string, number[]>();
let lastSweep = 0;

export function clientIp(req: Request): string {
  if (process.env.NETLIFY)
    return req.headers.get("x-nf-client-connection-ip")?.trim() || "unknown";
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Returns true when the request is allowed. */
export function allowRequest(
  key: string,
  limit: number,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  if (now - lastSweep >= 60_000 || windows.size > 10_000) {
    for (const [entry, timestamps] of windows) {
      if ((timestamps.at(-1) ?? 0) <= cutoff) windows.delete(entry);
    }
    lastSweep = now;
  }
  if (!windows.has(key) && windows.size >= 10_000) return false;
  const prior = (windows.get(key) ?? []).filter((t) => t > cutoff);
  if (prior.length >= limit) {
    windows.set(key, prior);
    return false;
  }
  prior.push(now);
  windows.set(key, prior);
  return true;
}
