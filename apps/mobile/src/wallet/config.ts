/**
 * Reown AppKit (WalletConnect) + wagmi configuration.
 *
 * This module has side effects — importing it calls `createAppKit`, which must
 * run once before the app renders. `index.ts` pulls it in via App.tsx. The
 * chain universe comes straight from `@railglide/shared` so the wallet, the
 * route planner, and the backend all agree on which chains are live.
 *
 * Signing model: no server-held keys. The wallet app produces every signature;
 * the connection is a deep-link round trip back to the `railglide://` scheme.
 */
import "@walletconnect/react-native-compat";
import {
  createAppKit,
  defaultWagmiConfig,
} from "@reown/appkit-wagmi-react-native";
import type { Chain } from "viem";
import { ACTIVE_CHAINS } from "@railglide/shared/network";

/** WalletConnect Cloud project id — set EXPO_PUBLIC_REOWN_PROJECT_ID in .env. */
export const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID ?? "";

/** True once a project id is present; the connect UI degrades gracefully without one. */
export const walletReady = projectId.length > 0;

const metadata = {
  name: "Railglide",
  description: "Send stablecoins and cash out to local fiat, from any chain.",
  url: "https://railglide.app",
  icons: ["https://railglide.app/icon.png"],
  redirect: {
    native: "railglide://",
    universal: "https://railglide.app",
  },
};

// EVM chains from the active (testnet/mainnet) universe. Non-EVM chains
// (Solana/Starknet) sign through their own adapters, added later.
const evmChains = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => c.viemChain as Chain);

// defaultWagmiConfig needs a non-empty tuple; the active universe always has at
// least one EVM chain (e.g. base-sepolia on testnet).
const chains = evmChains as [Chain, ...Chain[]];

export const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});

if (walletReady) {
  createAppKit({
    projectId,
    wagmiConfig,
    metadata,
    defaultChain: chains[0],
    enableAnalytics: false,
  });
}
