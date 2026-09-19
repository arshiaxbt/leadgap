import { MAP_REVISION } from "./mapping";
import { SCORE_MODEL_VERSION } from "./score";
import type { ResolvedEvent } from "./types";

/** Model semantics, independent of catalog order and transient market prices. */
export async function fingerprintModel(
  events: ResolvedEvent[],
  scoreVersion = SCORE_MODEL_VERSION,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([
    MAP_REVISION,
    scoreVersion,
    [...events].sort((a, b) => a.id.localeCompare(b.id)).map((event) => [
      event.id,
      event.yesTokenId,
      event.question || event.title,
      event.endsAt ?? null,
      [...event.perps].sort((a, b) => a.symbol.localeCompare(b.symbol)).map((p) => [
        p.symbol, p.signedBeta, p.confidence, p.mappingKind,
      ]),
    ]),
  ]));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((n) => n.toString(16).padStart(2, "0")).join("");
}
