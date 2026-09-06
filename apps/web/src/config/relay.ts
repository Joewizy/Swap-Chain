import {
  ASSETS_RELAY_API,
  convertViemChainToRelayChain,
  type RelayChain,
} from "@relayprotocol/relay-sdk";
import type { RelayKitTheme } from "@relayprotocol/relay-kit-ui";
import {
  ACTIVE_CHAINS,
  getChain,
  getTokenAddress,
  IS_MAINNET,
} from "./network";
import { SOLANA_RPC } from "./solana";

/**
 * Browser-facing Relay base URL. Points at our same-origin proxy
 * (`/api/relay/*`), which forwards to the real Relay API with the secret
 * API key attached server-side — the key must never reach the browser.
 * The Relay client builds every request (quotes, chains, execution status)
 * from this base, so proxying here covers the whole widget.
 *
 * It must be an ABSOLUTE URL: the widget's hooks build request URLs with
 * `new URL(`${baseApiUrl}/chains`)`, which throws on a relative path. We
 * anchor it to the live origin in the browser; the server-side placeholder
 * is never used to fetch (the widget only runs client-side).
 */
export const RELAY_API =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/relay`
    : "/api/relay";

/** EVM chains from our registry, in Relay's chain shape for RelayKitProvider. */
const RELAY_EVM_CHAINS = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => convertViemChainToRelayChain(c.viemChain!));

const activeSolanaChain = getChain(IS_MAINNET ? "solana" : "solana-devnet");
const activeSolanaUsdcAddress = getTokenAddress(
  "USDC",
  IS_MAINNET ? "solana" : "solana-devnet"
);

const RELAY_SOLANA_CHAIN: RelayChain | undefined =
  activeSolanaChain && activeSolanaUsdcAddress
    ? {
        id: activeSolanaChain.numericId,
        name: activeSolanaChain.id,
        displayName: activeSolanaChain.name,
        httpRpcUrl: SOLANA_RPC,
        explorerUrl: activeSolanaChain.explorer,
        icon: {
          dark: `${ASSETS_RELAY_API}/icons/${activeSolanaChain.numericId}/dark.png`,
          light: `${ASSETS_RELAY_API}/icons/${activeSolanaChain.numericId}/light.png`,
          squaredDark: `${ASSETS_RELAY_API}/icons/square/${activeSolanaChain.numericId}/dark.png`,
          squaredLight: `${ASSETS_RELAY_API}/icons/square/${activeSolanaChain.numericId}/light.png`,
        },
        currency: {
          address: "11111111111111111111111111111111",
          decimals: 9,
          name: "Solana",
          symbol: "SOL",
        },
        erc20Currencies: [
          {
            address: activeSolanaUsdcAddress,
            decimals: 6,
            name: "USD Coin",
            symbol: "USDC",
          },
        ],
        vmType: "svm",
        depositEnabled: true,
        tokenSupport: "All",
      }
    : undefined;

/** Relay chains available before the dynamic /chains fetch resolves. */
export const RELAY_CHAINS: RelayChain[] = RELAY_SOLANA_CHAIN
  ? [...RELAY_EVM_CHAINS, RELAY_SOLANA_CHAIN]
  : RELAY_EVM_CHAINS;

/**
 * Maps the Relay widget onto our design tokens so it reads as part of the app
 * rather than a dark embed. Values are `var(--token)` references, so the widget
 * follows the same palette as everything else — including a future dark mode.
 */
export const RELAY_THEME: RelayKitTheme = {
  font: "inherit",
  fontHeading: "inherit",
  primaryColor: "var(--accent)",
  focusColor: "var(--accent)",
  subtleBackgroundColor: "var(--bg-soft)",
  subtleBorderColor: "var(--line)",
  text: {
    default: "var(--fg)",
    subtle: "var(--fg-mute)",
    error: "var(--err)",
    success: "var(--ok)",
  },
  buttons: {
    borderRadius: "12px",
    primary: {
      color: "var(--btn-fg)",
      background: "var(--btn-bg)",
      hover: { color: "var(--btn-fg)", background: "var(--fg-soft)" },
    },
    disabled: { color: "var(--fg-faint)", background: "var(--bg-sunk)" },
  },
  input: {
    background: "var(--bg-soft)",
    borderRadius: "10px",
    color: "var(--fg)",
  },
  anchor: {
    color: "var(--accent)",
    hover: { color: "var(--accent)" },
  },
  dropdown: {
    background: "var(--bg-elev)",
    borderRadius: "12px",
    border: "1px solid var(--line)",
  },
  widget: {
    background: "var(--bg-elev)",
    borderRadius: "16px",
    border: "1px solid var(--line)",
    boxShadow: "var(--shadow-2)",
    card: {
      background: "var(--bg-soft)",
      borderRadius: "12px",
      border: "1px solid var(--line)",
    },
    selector: {
      background: "var(--bg-soft)",
      hover: { background: "var(--bg-sunk)" },
    },
  },
  modal: {
    background: "var(--bg-elev)",
    border: "1px solid var(--line)",
    borderRadius: "16px",
  },
};
