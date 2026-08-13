const BLOCKED = new Set([
  "US",
  "CA",
  "CU",
  "IR",
  "KP",
  "SY",
  "UA-43", // Crimea
  "UA-14", // Donetsk
  "UA-09", // Luhansk
]);

export type GeoDecision = {
  country: string;
  region: string | null;
  blocked: boolean;
  reason: string;
};

function header(req: Request, name: string): string | null {
  return req.headers.get(name);
}

export function geoFromRequest(req: Request): GeoDecision {
  const country = (
    header(req, "cf-ipcountry") ||
    header(req, "x-vercel-ip-country") ||
    header(req, "x-country-code") ||
    "XX"
  ).toUpperCase();
  const region = (
    header(req, "cf-region-code") ||
    header(req, "x-vercel-ip-country-region") ||
    ""
  ).toUpperCase() || null;

  const geoKey = region && country === "UA" ? `UA-${region}` : country;
  const blocked = BLOCKED.has(country) || BLOCKED.has(geoKey);
  return {
    country,
    region,
    blocked,
    reason: blocked
      ? "Order placement is not permitted from this jurisdiction. Market data remains visible."
      : "Eligible to submit Perps orders from this IP, subject to local law.",
  };
}

export const GEO_COOKIE = "can_trade";
export const GEO_COOKIE_MAX_AGE = 60 * 10;
