"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheetManager } from "styled-components";
import { CircleArcWalletProvider, UnconfiguredArcWalletProvider } from "@/components/arc-wallet-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const configured = Boolean(process.env.NEXT_PUBLIC_CLIENT_KEY);

  return (
    <StyleSheetManager shouldForwardProp={(propName, target) => {
      if (typeof target !== "string") return true;
      return propName !== "isActive" && propName !== "isactive";
    }}>
      <QueryClientProvider client={queryClient}>
        {configured
          ? <CircleArcWalletProvider>{children}</CircleArcWalletProvider>
          : <UnconfiguredArcWalletProvider>{children}</UnconfiguredArcWalletProvider>}
      </QueryClientProvider>
    </StyleSheetManager>
  );
}
