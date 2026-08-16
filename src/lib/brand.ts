export const APP_NAME = "Leadgap";
export const APP_TAGLINE = "When Polymarket event probabilities move before the perp.";
export const APP_LOGO = "/leadgap-logo.svg";
export const APP_LOGO_RASTER = "/leadgap-logo.png";
export const APP_OG = "/og.png";
export const PERPS_WAITLIST_URL = "https://polymarket.com/perps";
export const POLYMARKET_ORIGIN = "https://polymarket.com";
export const APP_ORIGIN = "https://www.leadgap.xyz";
export const APP_GITHUB = "https://github.com/arshiaxbt/leadgap";
export const APP_X = "https://x.com/0xarshia";
export const APP_BUILDER = "0xarshia.eth";

export function polymarketEventUrl(slug?: string | null): string | null {
  if (!slug) return null;
  return `${POLYMARKET_ORIGIN}/event/${encodeURIComponent(slug)}`;
}
