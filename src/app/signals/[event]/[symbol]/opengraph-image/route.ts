import { renderSignalImage } from "@/lib/share-image";
import { signalWindow } from "@/lib/signal-share";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ event: string; symbol: string }> },
) {
  const { event, symbol } = await params;
  if (!/^\d{1,80}$/.test(event) || !/^[A-Za-z0-9._-]{1,40}$/.test(symbol))
    return Response.json({ error: "Invalid signal" }, { status: 400 });
  return renderSignalImage(params, signalWindow(new URL(request.url).searchParams.get("window")));
}
