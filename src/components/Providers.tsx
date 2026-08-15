"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { privyAppId } from "@/lib/privy";

const PrivyTree = dynamic(() => import("./PrivyTree").then((m) => m.PrivyTree), {
  ssr: false,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = privyAppId();

  return (
    <QueryClientProvider client={queryClient}>
      {appId ? <PrivyTree>{children}</PrivyTree> : children}
    </QueryClientProvider>
  );
}
