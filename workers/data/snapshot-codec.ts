/** Only latest snapshots use this representation; archives and account data do not. */
export const SNAPSHOT_ENCODING = "gzip-base64-v1";
export const SNAPSHOT_MAX_BYTES = 1_572_864;
const PREFIX = `{"_leadgapEncoding":"${SNAPSHOT_ENCODING}"`;

export function snapshotGzip(value: string): Uint8Array<ArrayBuffer> | null {
  if (!value.startsWith(PREFIX)) return null;
  const encoded = JSON.parse(value) as { data: string };
  return Uint8Array.from(atob(encoded.data), (c) => c.charCodeAt(0));
}

/** Compatibility reads only: current Vercel clients inflate outside the Worker. */
export async function snapshotText(value: string): Promise<string> {
  const bytes = snapshotGzip(value);
  if (!bytes) return value;
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > SNAPSHOT_MAX_BYTES) {
        await reader.cancel();
        throw new Error("Stored snapshot exceeds maximum size");
      }
      text += decoder.decode(next.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
