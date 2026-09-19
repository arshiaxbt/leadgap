import { renderSignalImage } from "@/lib/share-image";

export const alt =
  "Leadgap signal: Polymarket odds move against the mapped perp, with the gap between them.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default function Image({
  params,
}: {
  params: Promise<{ event: string; symbol: string }>;
}) {
  return renderSignalImage(params);
}
