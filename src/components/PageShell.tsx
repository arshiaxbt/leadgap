import { Footer } from "@/components/Footer";
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">{children}</div>
      <Footer />
    </>
  );
}
