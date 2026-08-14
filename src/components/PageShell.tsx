import { Footer } from "@/components/Footer";
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-2">{children}</div>
      <Footer />
    </>
  );
}
