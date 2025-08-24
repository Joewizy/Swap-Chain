"use client"

import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { 
  baseSepolia, 
  sepolia, 
  arbitrumSepolia, 
  optimismSepolia, 
  polygonAmoy,
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon
} from "viem/chains"
import { lightTheme } from '@rainbow-me/rainbowkit'

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "YOUR_WALLET_CONNECT_PROJECT_ID"

export default getDefaultConfig({
    appName: "Swap-Chain",
    projectId: projectId,
    chains: [
        // Testnet chains
        sepolia, 
        baseSepolia, 
        arbitrumSepolia, 
        optimismSepolia, 
        polygonAmoy,
        // Mainnet chains
        mainnet,
        base,
        arbitrum,
        optimism,
        polygon
    ],
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