import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { ModelView } from "@/components/ModelView";

export const metadata: Metadata = pageMetadata({
  path: "/model",
  title: "Model",
  description:
    "How the Leadgap score is built from live data, and what it cannot tell you.",
});

export default function ModelPage() {
  return <ModelView />;
}
