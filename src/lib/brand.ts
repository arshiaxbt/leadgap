export const APP_NAME = "Leadgap";
export const APP_TAGLINE = "When Polymarket event probabilities move before the perp.";
export const APP_ACCENT = "#8FC9F2";
export const APP_LOGO = "/leadgap-logo.svg";
export const APP_LOGO_RASTER = "/leadgap-logo.png";
export const APP_OG = "/og.png";
export const POLYMARKET_ORIGIN = "https://polymarket.com";
export const PERPS_WAITLIST_URL = `${POLYMARKET_ORIGIN}/perps`;
export const PERPS_INVITE_CODE = "00cas6it";
export const PERPS_INVITE_URL = `${POLYMARKET_ORIGIN}/perps?c=${PERPS_INVITE_CODE}`;
export const PERPS_INVITE_LABEL = PERPS_INVITE_URL.replace(/^https:\/\//, "");
export const APP_ORIGIN = "https://www.leadgap.xyz";
export const APP_GITHUB = "https://github.com/arshiaxbt/leadgap";
export const APP_X = "https://x.com/0xarshia";
export const APP_BUILDER = "0xarshia.eth";

export function polymarketEventUrl(slug?: string | null): string | null {
  if (!slug) return null;
  return `${POLYMARKET_ORIGIN}/event/${encodeURIComponent(slug)}`;
}
