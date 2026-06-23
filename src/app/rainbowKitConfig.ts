"use client";

import { getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import type { Chain, Transport } from "viem";
import { ACTIVE_CHAINS } from "@/config/network";

const projectId =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "YOUR_WALLET_CONNECT_PROJECT_ID";

const evmChains = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => c.viemChain as Chain);

// viem's built-in defaults (e.g. cloudflare-eth for mainnet) intermittently
// return 5xx / internal errors, which silently breaks on-chain reads like the
// balance lookup. publicnode is dependable; an env var overrides per chain.
const FALLBACK_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://base-sepolia-rpc.publicnode.com",
  421614: "https://arbitrum-sepolia-rpc.publicnode.com",
  11155420: "https://optimism-sepolia-rpc.publicnode.com",
  80002: "https://polygon-amoy-bor-rpc.publicnode.com",
  43113: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
};

// Literal env keys so Next.js inlines them in the client bundle (dynamic
// process.env access isn't replaced at build time).
const RPC_OVERRIDE: Record<number, string | undefined> = {
  1: process.env.NEXT_PUBLIC_RPC_ETHEREUM,
  8453: process.env.NEXT_PUBLIC_RPC_BASE,
  42161: process.env.NEXT_PUBLIC_RPC_ARBITRUM,
  137: process.env.NEXT_PUBLIC_RPC_POLYGON,
  56: process.env.NEXT_PUBLIC_RPC_BNB,
};

const transports = Object.fromEntries(
  evmChains.map((c) => {
    const url = RPC_OVERRIDE[c.id] || FALLBACK_RPC[c.id];
    return [c.id, url ? http(url) : http()];
  })
) as Record<number, Transport>;

export default getDefaultConfig({
  appName: "Railglide",
  projectId,
  chains: evmChains as unknown as readonly [Chain, ...Chain[]],
  transports,
  ssr: false,
});

export const rainbowKitTheme = lightTheme({
  accentColor: "#5C4B99",
  accentColorForeground: "white",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
});
