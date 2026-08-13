import { NextResponse } from "next/server";
import { interpretGap, interpretStatus } from "@/lib/interpret";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(interpretStatus());
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    title?: string;
    question?: string;
    symbol?: string;
    mappingReason?: string;
    oddsMove?: number;
    perpMove?: number;
    gap?: number;
    leader?: "odds" | "perp" | "flat";
    signedBeta?: number;
  };
  if (!body.title || !body.symbol || !body.mappingReason) {
    return NextResponse.json({ error: "mapped fields required" }, { status: 400 });
  }
  const note = await interpretGap({
    title: body.title,
    question: body.question ?? body.title,
    symbol: body.symbol,
    mappingReason: body.mappingReason,
    oddsMove: Number(body.oddsMove ?? 0),
    perpMove: Number(body.perpMove ?? 0),
    gap: Number(body.gap ?? 0),
    leader: body.leader ?? "flat",
    signedBeta: Number(body.signedBeta ?? 1),
  });
  return NextResponse.json(note);
}
