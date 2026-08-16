export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return url.href;
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function safeXProfileUrl(username: string | null | undefined): string | null {
  if (!username) return null;
  const handle = username.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,30}$/.test(handle)) return null;
  return `https://x.com/${encodeURIComponent(handle)}`;
}
