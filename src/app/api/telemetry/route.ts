import { readRequestText, RequestBodyTooLarge } from "@/lib/request-body";
import { dataService } from "@/lib/data-service";
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_ENABLE_TELEMETRY !== "true")
    return new Response(null, { status: 204 });
  try {
    const text = await readRequestText(req, 256);
    const value = JSON.parse(text);
    await dataService("/telemetry", {
      method: "POST",
      body: JSON.stringify({ name: value.name, placement: value.placement }),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(null, {
      status: error instanceof RequestBodyTooLarge ? 413 : 400,
    });
  }
}
