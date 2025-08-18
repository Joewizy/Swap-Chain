"use client"

import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { baseSepolia, sepolia, arbitrumSepolia, optimismSepolia, polygonAmoy } from "viem/chains"
import { lightTheme } from '@rainbow-me/rainbowkit'

// Get WalletConnect project ID from environment or use a fallback
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "YOUR_WALLET_CONNECT_PROJECT_ID"

export default getDefaultConfig({
    appName: "Swap-Chain",
    projectId: projectId,
    chains: [sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, polygonAmoy],
    ssr: false
})

// Custom theme for RainbowKit
export const rainbowKitTheme = lightTheme({
    accentColor: '#5C4B99',
    accentColorForeground: 'white',
    borderRadius: 'large',
    fontStack: 'system',
    overlayBlur: 'small',
})