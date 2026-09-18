export class RequestBodyTooLarge extends Error {}
/** Bound bytes while streaming, including requests with no Content-Length. */
export async function readRequestText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new RequestBodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
