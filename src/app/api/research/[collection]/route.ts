import { readRequestText, RequestBodyTooLarge } from "@/lib/request-body";
import { verifyPrivyBearer } from "@/lib/privy-server";
import { dataService, DataServiceError } from "@/lib/data-service";
export const dynamic = "force-dynamic";
async function handle(
  req: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  if (process.env.ENABLE_RESEARCH !== "true")
    return Response.json(
      { error: "Saved research is not available yet." },
      { status: 503 },
    );
  const { collection } = await params;
  if (!["watchlist", "rules", "notifications"].includes(collection))
    return Response.json({ error: "Not found" }, { status: 404 });
  const identity = await verifyPrivyBearer(req);
  if (!identity)
    return Response.json(
      { error: "Log in to access saved research." },
      { status: 401 },
    );
  try {
    const text = ["PUT", "PATCH"].includes(req.method)
      ? await readRequestText(req, 8192)
      : undefined;
    if (text && text.length > 8192)
      return Response.json({ error: "Request too large" }, { status: 413 });
    const url = new URL(req.url),
      id = url.searchParams.get("id");
    const result = await dataService(
      `/account/${collection}${id ? `?id=${encodeURIComponent(id)}` : ""}`,
      { method: req.method, ...(text ? { body: text } : {}) },
      identity.userId,
    );
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLarge)
      return Response.json({ error: "Request too large" }, { status: 413 });
    return Response.json(
      {
        error:
          error instanceof DataServiceError
            ? error.message
            : "Saved research is temporarily unavailable.",
      },
      { status: error instanceof DataServiceError ? error.status : 503 },
    );
  }
}
export { handle as GET, handle as PUT, handle as PATCH, handle as DELETE };
