import { NextResponse } from "next/server";
import { fetchBook } from "@/lib/perps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("instrumentId"));
  const depth = Number(new URL(req.url).searchParams.get("depth") ?? 20);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "instrumentId required" }, { status: 400 });
  }
  try {
    const allowed =
      depth === 100 || depth === 500 || depth === 1000 || (Number.isFinite(depth) && depth >= 8 && depth <= 40);
    const book = await fetchBook(id, allowed ? Math.floor(depth) : 10);
    return NextResponse.json(book);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "book failed" },
      { status: 502 },
    );
  }
}
