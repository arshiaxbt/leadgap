import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SECRET_KEYS = /poly_|gemini_|passphrase|private[_-]?key|authorization|cookie|secret|api[_-]?key/i;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 24 && SECRET_KEYS.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redactValue(nested);
    }
    return out;
  }
  return value;
}

export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      for (const key of Object.keys(headers)) {
        if (SECRET_KEYS.test(key)) delete headers[key];
      }
      event.request.headers = headers;
    }
    if (event.request.data) {
      event.request.data = redactValue(event.request.data) as typeof event.request.data;
    }
  }
  if (event.extra) event.extra = redactValue(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = redactValue(event.contexts) as typeof event.contexts;
  return event;
}
