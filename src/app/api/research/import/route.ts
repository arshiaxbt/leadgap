import { readRequestText, RequestBodyTooLarge } from "@/lib/request-body";
import { verifyPrivyBearer } from "@/lib/privy-server";
import { dataService, DataServiceError } from "@/lib/data-service";
import {
  validRule,
  validWatch,
  type AlertRule,
  type WatchItem,
} from "@/lib/research";

export const dynamic = "force-dynamic";

type Kind = "watchlist" | "rules";
type Outcome = { imported: string[]; existing: string[]; invalid: number; overflow: string[] };

/**
 * One-time move of browser-saved watchlist items and alert rules into the
 * signed-in account. Never overwrites server copies (they may carry newer
 * mute/edit state) and stops a kind at the account limit.
 */
export async function POST(req: Request) {
  if (process.env.ENABLE_RESEARCH !== "true")
    return Response.json(
      { error: "Saved research is not available yet." },
      { status: 503 },
    );
  const identity = await verifyPrivyBearer(req);
  if (!identity)
    return Response.json(
      { error: "Log in to access saved research." },
      { status: 401 },
    );
  let body: { watchlist?: unknown[]; rules?: unknown[] };
  try {
    body = JSON.parse(await readRequestText(req, 65_536));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RequestBodyTooLarge
            ? "Request too large"
            : "Invalid JSON",
      },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400 },
    );
  }
  const input: Record<Kind, unknown[]> = {
    watchlist: Array.isArray(body?.watchlist) ? body.watchlist.slice(0, 100) : [],
    rules: Array.isArray(body?.rules) ? body.rules.slice(0, 20) : [],
  };
  try {
    const result = {} as Record<Kind, Outcome>;
    for (const kind of ["watchlist", "rules"] as const) {
      const valid = kind === "watchlist" ? validWatch : validRule;
      const current = await dataService<{ items: (WatchItem | AlertRule)[] }>(
        `/account/${kind}`,
        { method: "GET" },
        identity.userId,
      );
      const have = new Set(current.items.map((item) => item.id));
      const outcome: Outcome = { imported: [], existing: [], invalid: 0, overflow: [] };
      for (const item of input[kind]) {
        if (!valid(item)) {
          outcome.invalid += 1;
          continue;
        }
        if (have.has(item.id)) {
          outcome.existing.push(item.id);
          continue;
        }
        if (outcome.overflow.length) {
          outcome.overflow.push(item.id);
          continue;
        }
        try {
          await dataService(
            `/account/${kind}`,
            { method: "PUT", body: JSON.stringify(item) },
            identity.userId,
          );
          outcome.imported.push(item.id);
          have.add(item.id);
        } catch (error) {
          if (error instanceof DataServiceError && error.status === 409) {
            outcome.overflow.push(item.id);
            continue;
          }
          throw error;
        }
      }
      result[kind] = outcome;
    }
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DataServiceError
            ? error.message
            : "Saved research is temporarily unavailable.",
      },
      { status: error instanceof DataServiceError ? error.status : 503 },
    );
  }
}
