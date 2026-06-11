import {
  convertViemChainToRelayChain,
  MAINNET_RELAY_API,
  TESTNET_RELAY_API,
} from "@relayprotocol/relay-sdk";
import { ACTIVE_CHAINS, IS_MAINNET } from "./network";

/** Relay API base URL for the active network mode. */
export const RELAY_API = IS_MAINNET ? MAINNET_RELAY_API : TESTNET_RELAY_API;

/** EVM chains from our registry, in Relay's chain shape for RelayKitProvider. */
export const RELAY_CHAINS = ACTIVE_CHAINS.filter(
  (c) => c.kind === "evm" && c.viemChain
).map((c) => convertViemChainToRelayChain(c.viemChain!));
