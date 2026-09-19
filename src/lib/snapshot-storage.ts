import { gunzipSync } from "node:zlib";
import { SNAPSHOT_ENCODING, SNAPSHOT_MAX_BYTES } from "../../workers/data/snapshot-codec";

export type StoredSnapshot = { _leadgapEncoding: typeof SNAPSHOT_ENCODING; data: string };

/** Run only on Vercel/Node: Worker reads can forward the stored JSON untouched. */
export function decodeStoredSnapshot<T>(value: T | StoredSnapshot): T {
  if (value && typeof value === "object" && "_leadgapEncoding" in value &&
      value._leadgapEncoding === SNAPSHOT_ENCODING && "data" in value && typeof value.data === "string")
    return JSON.parse(gunzipSync(Buffer.from(value.data, "base64"), {
      maxOutputLength: SNAPSHOT_MAX_BYTES,
    }).toString("utf8")) as T;
  return value as T;
}
