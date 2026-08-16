function hostAllowed(hostname: string, suffixes: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export const NEWS_LINK_HOSTS = [
  "bbc.com",
  "bbc.co.uk",
  "bbci.co.uk",
  "federalreserve.gov",
  "coindesk.com",
] as const;

export const PROFILE_IMAGE_HOSTS = [
  "polymarket.com",
  "googleusercontent.com",
  "amazonaws.com",
  "cloudfront.net",
  "privy.io",
  "walletconnect.com",
] as const;

export function safeHttpsUrl(
  raw: string | null | undefined,
  allowedHostSuffixes?: readonly string[],
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") {
      if (allowedHostSuffixes && !hostAllowed(url.hostname, allowedHostSuffixes)) return null;
      return url.href;
    }
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
