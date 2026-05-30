"use client";

import { getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import type { Chain } from "viem";
import { ACTIVE_CHAINS } from "@/config/network";

const projectId =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "YOUR_WALLET_CONNECT_PROJECT_ID";

const evmChains = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => c.viemChain as Chain);

export default getDefaultConfig({
  appName: "Swap-Chain",
  projectId,
  chains: evmChains as unknown as readonly [Chain, ...Chain[]],
  ssr: false,
});

export const rainbowKitTheme = lightTheme({
  accentColor: "#5C4B99",
  accentColorForeground: "white",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
});
