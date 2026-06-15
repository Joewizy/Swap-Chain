"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { RelayKitProvider } from "@relayprotocol/relay-kit-ui";
import "@relayprotocol/relay-kit-ui/styles.css";
import "@rainbow-me/rainbowkit/styles.css";
import { RELAY_API, RELAY_CHAINS, RELAY_THEME } from "@/config/relay";
import config from "./rainbowKitConfig";
import { rainbowKitTheme } from "./rainbowKitConfig";
import { Analytics } from "@vercel/analytics/next";

export function Providers(props: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <Analytics />
      <QueryClientProvider client={queryClient}>
        <RelayKitProvider
          theme={RELAY_THEME}
          options={{
            appName: "Swap Chain",
            chains: RELAY_CHAINS,
            baseApiUrl: RELAY_API,
            themeScheme: "light",
          }}
        >
          <RainbowKitProvider showRecentTransactions theme={rainbowKitTheme}>
            {props.children}
          </RainbowKitProvider>
        </RelayKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
