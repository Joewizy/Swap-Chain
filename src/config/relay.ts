import {
  convertViemChainToRelayChain,
  MAINNET_RELAY_API,
  TESTNET_RELAY_API,
} from "@relayprotocol/relay-sdk";
import type { RelayKitTheme } from "@relayprotocol/relay-kit-ui";
import { ACTIVE_CHAINS, IS_MAINNET } from "./network";

/** Relay API base URL for the active network mode. */
export const RELAY_API = IS_MAINNET ? MAINNET_RELAY_API : TESTNET_RELAY_API;

/** EVM chains from our registry, in Relay's chain shape for RelayKitProvider. */
export const RELAY_CHAINS = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => convertViemChainToRelayChain(c.viemChain!));

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
