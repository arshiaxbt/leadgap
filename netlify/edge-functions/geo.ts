import type { Context } from "@netlify/edge-functions";
import { decisionForLocation } from "../../src/lib/geo.ts";
export default function geo(_request: Request, context: Context) {
  const decision = decisionForLocation(
    context.geo.country?.code ?? "XX",
    context.geo.subdivision?.code ?? null,
    true,
  );
  return Response.json(decision, {
    headers: {
      "cache-control": "no-store",
      "set-cookie": `can_trade=${decision.blocked ? "" : "1"}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${decision.blocked ? 0 : 600}`,
    },
  });
}
