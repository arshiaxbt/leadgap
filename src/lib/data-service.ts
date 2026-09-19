import { decodeStoredSnapshot, type StoredSnapshot } from "./snapshot-storage";
import {
  WINDOWS,
  freshResearchSnapshot,
  type ResearchSnapshot,
} from "./research";
export const durableEnabled = () => process.env.ENABLE_DURABLE_DATA === "true";
export async function dataService<T>(
  path: string,
  init: RequestInit = {},
  userId?: string,
): Promise<T> {
  const origin = process.env.DATA_SERVICE_URL,
    secret = process.env.DATA_SERVICE_SECRET;
  if (!origin || !secret) throw new Error("Shared data is not configured.");
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin)
    throw new Error("Invalid data path");
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
      ...(userId ? { "x-leadgap-user": userId } : {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new DataServiceError(
      body.error ?? "Shared data is unavailable.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
export class DataServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let cached: ResearchSnapshot | null = null,
  lastRead = 0;
export async function researchSnapshot(): Promise<ResearchSnapshot> {
  if (cached && Date.now() - lastRead < 10_000)
    return freshResearchSnapshot(cached);
  try {
    cached = decodeStoredSnapshot(await dataService<ResearchSnapshot | StoredSnapshot>("/snapshot/raw?encoding=stored"));
    lastRead = Date.now();
    return freshResearchSnapshot(cached);
  } catch (error) {
    if (cached)
      return {
        ...cached,
        windows: Object.fromEntries(
          WINDOWS.map((k) => [k, []]),
        ) as unknown as ResearchSnapshot["windows"],
        error: "Shared data is unavailable. Last values are shown.",
      };
    throw error;
  }
}
