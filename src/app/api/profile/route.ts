import { NextResponse } from "next/server";
import { fetchPublicProfile } from "@/lib/gamma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.getAll("address").map((a) => a.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const address of raw) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const profile = await fetchPublicProfile(address);
    if (profile) return NextResponse.json(profile);
  }
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
