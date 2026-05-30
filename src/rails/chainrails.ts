/**
 * Chainrails rail — chain-name mapping + shared types.
 *
 * Chainrails identifies chains with its own `{CHAIN}_{TESTNET|MAINNET}`
 * enum. The testnet names are verified via `crapi.chains.getSupported`
 * (see scripts/test-chainrails.mjs); mainnet names follow the same
 * pattern and should be re-verified before the mainnet flip.
 *
 * The SDK (`@chainrails/sdk`) needs the API key, so every SDK call stays
 * server-side in src/app/api/chainrails/*. This module is pure and safe
 * to import from either client or server.
 *
 * See ARCHITECTURE.md §"The four rails".
 */

import type { ChainId } from "@/config/network";

/**
 * App ChainId → Chainrails chain enum.
 *
 * Verified testnet set (crapi.chains.getSupported({ network: "testnet" })):
 *   ARBITRUM_TESTNET, AVALANCHE_TESTNET, BASE_TESTNET, STARKNET_TESTNET,
 *   ETHEREUM_TESTNET, OPTIMISM_TESTNET, MONAD_TESTNET, SOLANA_TESTNET
 */
export const CHAINRAILS_CHAIN: Partial<Record<ChainId, string>> = {
  // Mainnet — pattern-derived, verify before mainnet launch.
  ethereum: "ETHEREUM_MAINNET",
  base: "BASE_MAINNET",
  arbitrum: "ARBITRUM_MAINNET",
  optimism: "OPTIMISM_MAINNET",
  avalanche: "AVALANCHE_MAINNET",
  solana: "SOLANA_MAINNET",
  starknet: "STARKNET_MAINNET",
  // Testnet — verified.
  sepolia: "ETHEREUM_TESTNET",
  "base-sepolia": "BASE_TESTNET",
  "arbitrum-sepolia": "ARBITRUM_TESTNET",
  "op-sepolia": "OPTIMISM_TESTNET",
  "avalanche-fuji": "AVALANCHE_TESTNET",
  "solana-devnet": "SOLANA_TESTNET",
  "starknet-sepolia": "STARKNET_TESTNET",
};

export function isChainrailsSupported(chainId: ChainId): boolean {
  return chainId in CHAINRAILS_CHAIN;
}

/** Maps an app ChainId onto its Chainrails enum, or throws if unsupported. */
export function toChainrailsChain(chainId: ChainId): string {
  const name = CHAINRAILS_CHAIN[chainId];
  if (!name) {
    throw new Error(`Chainrails does not support chain "${chainId}"`);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Shared types — the slice of the Chainrails quote response the UI needs.
// The route at /api/chainrails/quote returns the SDK payload verbatim;
// the hook narrows it to this shape.
// ---------------------------------------------------------------------------

export interface ChainrailsQuoteRequest {
  sourceChain: string;
  destinationChain: string;
  tokenIn: string;
  tokenOut: string;
  /** Raw base units, decimal string. */
  amount: string;
  recipient: string;
  /** Funding token symbol, e.g. "USDC". */
  amountSymbol: string;
}
