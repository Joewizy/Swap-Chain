// Reown AppKit (WalletConnect) + wagmi config. Importing runs createAppKit()
// once (via App.tsx). Chains come from @railglide/shared. Signing happens in
// the wallet app and deep-links back to the `railglide://` scheme.
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

// EVM chains from the active universe (Solana/Starknet get their own adapters later).
const evmChains = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => c.viemChain as Chain);
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
