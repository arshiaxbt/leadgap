import { PERPS_WAITLIST_URL } from "@/lib/brand";

export type PerpsAccess = {
  kind: "invite" | "other";
  message: string;
  href?: string;
};

export function explainPerpsError(err: unknown): PerpsAccess {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  if (/sign the perps proxy|sign the perps session|could not sign|user rejected|rejected the request|cancelled signing/.test(text)) {
    return {
      kind: "other",
      message:
        "The wallet must approve one Polygon signature to open Perps. Switch the wallet to Polygon, sign once, and wait — overlapping prompts are ignored.",
    };
  }
  const invite =
    /invite|waitlist|not (yet )?enabled|not onboard|access denied|forbidden|unauthorized|not eligible|closed.?only|perps (is )?not available|account (not|isn)|kyc|restricted|do not have access|hasn't been (granted|enabled)|has not been (granted|enabled)/.test(
      text,
    ) || /\b(403|401)\b/.test(text);

  if (invite) {
    return {
      kind: "invite",
      href: PERPS_WAITLIST_URL,
      message:
        "Polymarket Perps is invite-only. This login is not enabled for Perps yet. Join the waitlist on Polymarket — you can still watch event/perp gaps here.",
    };
  }

  return {
    kind: "other",
    message: raw || "Could not open a Perps session from this login.",
  };
}
