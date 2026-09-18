/** Read-only JSON request with a bounded lifetime and user-facing failure message. */
export async function readJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(55_000);
  const response = await fetch(url, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Updates are temporarily limited. Retrying shortly."
        : "Market data is unavailable. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}
