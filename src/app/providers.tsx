"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi"
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import config from "./rainbowKitConfig"
import { rainbowKitTheme } from "./rainbowKitConfig"
import { useState } from "react";
import "@rainbow-me/rainbowkit/styles.css"

export function Providers(props: {children: ReactNode}) {
    const [queryClient] = useState(() => new QueryClient())
    
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
            <RainbowKitProvider showRecentTransactions theme={rainbowKitTheme}>
                {props.children}
            </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}
