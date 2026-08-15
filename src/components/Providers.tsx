"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { PrivyTree } from "@/components/PrivyTree";
import { privyAppId } from "@/lib/privy";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = privyAppId();

  return (
    <QueryClientProvider client={queryClient}>
      {appId ? <PrivyTree>{children}</PrivyTree> : children}
    </QueryClientProvider>
  );
}
