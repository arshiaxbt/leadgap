import { PERPS_WAITLIST_URL } from "@/lib/brand";

export type PerpsAccess = {
  kind: "invite" | "other";
  message: string;
  href?: string;
};

export const PERPS_INVITE_ACCESS: PerpsAccess = {
  kind: "invite",
  href: PERPS_WAITLIST_URL,
  message: "This account is not enabled for Polymarket Perps yet. You can still watch gaps here.",
};

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const extra = [
      err.name,
      err.message,
      err.cause instanceof Error ? err.cause.message : err.cause,
      "error" in err ? String((err as { error?: unknown }).error ?? "") : "",
      "status" in err ? String((err as { status?: unknown }).status ?? "") : "",
    ];
    return extra.filter(Boolean).join(" ");
  }
  if (err && typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export function explainPerpsError(err: unknown): PerpsAccess {
  const raw = errorText(err);
  const text = raw.toLowerCase();
  if (/sign the perps proxy|sign the perps session|could not sign|user rejected|rejected the request|cancelled signing/.test(text)) {
    return {
      kind: "other",
      message: "Approve the Perps signature in your wallet. This is separate from logging in.",
    };
  }
  const invite =
    /invite|waitlist|not (yet )?enabled|not onboard|access denied|forbidden|unauthorized|not eligible|closed.?only|perps (is )?not available|account (not|isn)|account not found|not_found|kyc|restricted|do not have access|hasn't been (granted|enabled)|has not been (granted|enabled)|unprocessable|\b422\b/.test(
      text,
    ) || /\b(403|401)\b/.test(text);

  if (invite) return { ...PERPS_INVITE_ACCESS };

  return {
    kind: "other",
    message: (err instanceof Error ? err.message : raw) || "Could not open Perps for this login.",
  };
}

export type PerpsAccountLookup = {
  status: "found" | "missing" | "unknown";
  equity: number | null;
};

export async function lookupPerpsAccount(addresses: string[]): Promise<PerpsAccountLookup> {
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  if (!unique.length) return { status: "unknown", equity: null };
  const params = new URLSearchParams();
  for (const address of unique) params.append("address", address);
  try {
    const res = await fetch(`/api/perps/account?${params}`, { cache: "no-store" });
    if (!res.ok) return { status: "unknown", equity: null };
    const body = (await res.json()) as { exists?: boolean | null; equity?: number | null };
    const equity = typeof body.equity === "number" && Number.isFinite(body.equity) ? body.equity : null;
    if (body.exists === true) return { status: "found", equity };
    if (body.exists === false) return { status: "missing", equity: null };
    return { status: "unknown", equity: null };
  } catch {
    return { status: "unknown", equity: null };
  }
}
