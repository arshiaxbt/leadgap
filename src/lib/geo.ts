const BLOCKED = new Set([
  "US",
  "CA",
  "CU",
  "IR",
  "KP",
  "SY",
  "T1", // Cloudflare Tor
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

const JURISDICTION_REASON =
  "Order placement is not permitted from this jurisdiction. Market data remains visible.";
const UNVERIFIED_REASON = "Could not verify location.";

export function geoFromRequest(req: Request): GeoDecision {
  if (process.env.NETLIFY) return decisionForLocation("XX", null, true); // Only the trusted edge function can establish Netlify location.
  const country = (
    (process.env.VERCEL
      ? header(req, "x-vercel-ip-country")
      : header(req, "cf-ipcountry")) || "XX"
  ).toUpperCase();
  const region =
    (
      (process.env.VERCEL
        ? header(req, "x-vercel-ip-country-region")
        : header(req, "cf-region-code")) || ""
    ).toUpperCase() || null;

  return decisionForLocation(
    country,
    region,
    Boolean(process.env.VERCEL || process.env.NETLIFY),
  );
}

export function decisionForLocation(
  country: string,
  region: string | null,
  failClosed: boolean,
): GeoDecision {
  const geoKey = region && country === "UA" ? `UA-${region}` : country;
  const listed = BLOCKED.has(country) || BLOCKED.has(geoKey);
  const unknown = country === "XX" || country === "";
  const failClosedUnknown = failClosed && unknown;
  const blocked = listed || failClosedUnknown;
  return {
    country,
    region,
    blocked,
    reason: blocked ? (listed ? JURISDICTION_REASON : UNVERIFIED_REASON) : "",
  };
}

export const GEO_COOKIE = "can_trade";
export const GEO_COOKIE_MAX_AGE = 60 * 10;

const UNVERIFIED: GeoDecision = {
  country: "XX",
  region: null,
  blocked: true,
  reason: UNVERIFIED_REASON,
};

export async function fetchTradeGeo(): Promise<GeoDecision> {
  try {
    const res = await fetch("/api/geo", { cache: "no-store" });
    const geo = (await res.json()) as GeoDecision;
    if (!res.ok || typeof geo?.blocked !== "boolean") return UNVERIFIED;
    return geo;
  } catch {
    return UNVERIFIED;
  }
}

export async function assertCanTrade(): Promise<GeoDecision> {
  const geo = await fetchTradeGeo();
  if (geo.blocked) {
    throw new Error(geo.reason || UNVERIFIED.reason);
  }
  return geo;
}
