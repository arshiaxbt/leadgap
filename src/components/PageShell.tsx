import type { ReactNode } from "react";

export function PageShell({ children, full = false }: { children: ReactNode; full?: boolean }) {
  return (
    <div
      className={
        full
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "mx-auto w-full max-w-[1600px] min-h-0 flex-1 overflow-auto px-3 py-2"
      }
    >
      {children}
    </div>
  );
}
