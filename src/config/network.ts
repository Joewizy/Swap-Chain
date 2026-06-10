/**
 * Single source of truth for the network universe the app runs in.
 *
 * Flip `NEXT_PUBLIC_NETWORK` between `testnet` and `mainnet` and every
 * rail (RainbowKit, Relay quote API, Chainrails, CCTP, Paycrest, the
 * intent parser, the route planner) reads from this file.
 *
 * See ARCHITECTURE.md §4 for the contract.
 */

import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  avalanche,
  bsc,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygonAmoy,
  avalancheFuji,
} from "viem/chains";
import type { Chain } from "viem";

// ---------------------------------------------------------------------------
// Network flag
// ---------------------------------------------------------------------------

export type NetworkMode = "testnet" | "mainnet";

export const NETWORK: NetworkMode =
  (process.env.NEXT_PUBLIC_NETWORK as NetworkMode) || "testnet";

export const IS_MAINNET = NETWORK === "mainnet";
export const IS_TESTNET = NETWORK === "testnet";

// ---------------------------------------------------------------------------
// Chain registry
// ---------------------------------------------------------------------------

/**
 * App-level chain id. Stable string we use everywhere instead of numeric
 * chain ids, so testnet/mainnet swaps don't ripple through call sites.
 */
export type ChainId =
  // EVM mainnet
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "polygon"
  | "avalanche"
  | "bnb"
  // Non-EVM mainnet
  | "solana"
  | "starknet"
  // EVM testnet
  | "sepolia"
  | "base-sepolia"
  | "arbitrum-sepolia"
  | "op-sepolia"
  | "polygon-amoy"
  | "avalanche-fuji"
  // Non-EVM testnet
  | "solana-devnet"
  | "starknet-sepolia";

export type ChainKind = "evm" | "solana" | "starknet";

export interface ChainEntry {
  id: ChainId;
  name: string;
  kind: ChainKind;
  /** Numeric id used by Relay / viem for EVM; arbitrary for non-EVM. */
  numericId: number;
  /** viem chain object for EVM chains, used by RainbowKit. */
  viemChain?: Chain;
  isTestnet: boolean;
  explorer: string;
  /**
   * Whether Chainrails accepts this chain as a source for funding intent
   * addresses (per docs.chainrails.io/essentials/integrations).
   * Testnet: USDC-only constraint applies.
   */
  chainrailsSupported: boolean;
}

const CHAINS: ChainEntry[] = [
  // ---------- EVM mainnet ----------
  {
    id: "ethereum",
    name: "Ethereum",
    kind: "evm",
    numericId: 1,
    viemChain: mainnet,
    isTestnet: false,
    explorer: "https://etherscan.io",
    chainrailsSupported: true,
  },
  {
    id: "base",
    name: "Base",
    kind: "evm",
    numericId: 8453,
    viemChain: base,
    isTestnet: false,
    explorer: "https://basescan.org",
    chainrailsSupported: true,
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    kind: "evm",
    numericId: 42161,
    viemChain: arbitrum,
    isTestnet: false,
    explorer: "https://arbiscan.io",
    chainrailsSupported: true,
  },
  {
    id: "optimism",
    name: "Optimism",
    kind: "evm",
    numericId: 10,
    viemChain: optimism,
    isTestnet: false,
    explorer: "https://optimistic.etherscan.io",
    chainrailsSupported: true,
  },
  {
    id: "polygon",
    name: "Polygon",
    kind: "evm",
    numericId: 137,
    viemChain: polygon,
    isTestnet: false,
    explorer: "https://polygonscan.com",
    chainrailsSupported: true, // mainnet only on Chainrails
  },
  {
    id: "avalanche",
    name: "Avalanche",
    kind: "evm",
    numericId: 43114,
    viemChain: avalanche,
    isTestnet: false,
    explorer: "https://snowtrace.io",
    chainrailsSupported: true,
  },
  {
    id: "bnb",
    name: "BNB Chain",
    kind: "evm",
    numericId: 56,
    viemChain: bsc,
    isTestnet: false,
    explorer: "https://bscscan.com",
    chainrailsSupported: true, // mainnet only on Chainrails
  },

  // ---------- Non-EVM mainnet ----------
  {
    id: "solana",
    name: "Solana",
    kind: "solana",
    numericId: 792703809, // Relay's solana id
    isTestnet: false,
    explorer: "https://solscan.io",
    chainrailsSupported: true,
  },
  {
    id: "starknet",
    name: "Starknet",
    kind: "starknet",
    // Placeholder — Starknet's real chain id (SN_MAIN) is a felt that exceeds
    // JS's safe integer range. Code that needs the felt should reach for the
    // string form via the starknet SDK. This numericId is only for our own
    // bookkeeping; not passed to Relay/viem.
    numericId: -1,
    isTestnet: false,
    explorer: "https://starkscan.co",
    chainrailsSupported: true,
  },

  // ---------- EVM testnet ----------
  {
    id: "sepolia",
    name: "Sepolia",
    kind: "evm",
    numericId: 11155111,
    viemChain: sepolia,
    isTestnet: true,
    explorer: "https://sepolia.etherscan.io",
    chainrailsSupported: true,
  },
  {
    id: "base-sepolia",
    name: "Base Sepolia",
    kind: "evm",
    numericId: 84532,
    viemChain: baseSepolia,
    isTestnet: true,
    explorer: "https://sepolia.basescan.org",
    chainrailsSupported: true,
  },
  {
    id: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    kind: "evm",
    numericId: 421614,
    viemChain: arbitrumSepolia,
    isTestnet: true,
    explorer: "https://sepolia.arbiscan.io",
    chainrailsSupported: true,
  },
  {
    id: "op-sepolia",
    name: "OP Sepolia",
    kind: "evm",
    numericId: 11155420,
    viemChain: optimismSepolia,
    isTestnet: true,
    explorer: "https://sepolia-optimism.etherscan.io",
    chainrailsSupported: true,
  },
  {
    id: "polygon-amoy",
    name: "Polygon Amoy",
    kind: "evm",
    numericId: 80002,
    viemChain: polygonAmoy,
    isTestnet: true,
    explorer: "https://www.oklink.com/amoy",
    chainrailsSupported: false, // Polygon is mainnet-only on Chainrails
  },
  {
    id: "avalanche-fuji",
    name: "Avalanche Fuji",
    kind: "evm",
    numericId: 43113,
    viemChain: avalancheFuji,
    isTestnet: true,
    explorer: "https://testnet.snowtrace.io",
    chainrailsSupported: true,
  },

  // ---------- Non-EVM testnet ----------
  {
    id: "solana-devnet",
    name: "Solana Devnet",
    kind: "solana",
    numericId: 1936682084,
    isTestnet: true,
    explorer: "https://solscan.io/?cluster=devnet",
    chainrailsSupported: true,
  },
  {
    id: "starknet-sepolia",
    name: "Starknet Sepolia",
    kind: "starknet",
    numericId: -2, // see note on `starknet` above
    isTestnet: true,
    explorer: "https://sepolia.starkscan.co",
    chainrailsSupported: true,
  },
];

/** Default chain we settle funds on (per ARCHITECTURE.md decision). */
export const DEFAULT_SETTLEMENT_CHAIN_ID: ChainId = IS_MAINNET
  ? "base"
  : "base-sepolia";

/** Chains visible in the current network universe. */
export const ACTIVE_CHAINS: ChainEntry[] = CHAINS.filter(
  (c) => c.isTestnet === IS_TESTNET
);

export function getChain(id: ChainId): ChainEntry | undefined {
  return CHAINS.find((c) => c.id === id);
}

export function getChainByNumericId(numericId: number): ChainEntry | undefined {
  return CHAINS.find((c) => c.numericId === numericId);
}

// ---------------------------------------------------------------------------
// Token registry
// ---------------------------------------------------------------------------

export type TokenSymbol =
  | "USDC"
  | "USDT"
  | "DAI"
  | "EURC"
  | "ETH"
  | "WETH"
  | "BNB"
  | "STRK"
  | "SOL"
  | "MATIC"
  | "AVAX";

export interface TokenEntry {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  /** Per-chain contract address. Native gas tokens use the zero address. */
  addresses: Partial<Record<ChainId, string>>;
  /** Chainrails accepts this token as funding for an intent address. */
  chainrailsSupported: boolean;
}

const ZERO_EVM = "0x0000000000000000000000000000000000000000";
const SOL_NATIVE = "11111111111111111111111111111111";

const TOKENS: TokenEntry[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    chainrailsSupported: true,
    addresses: {
      // Mainnet
      ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      bnb: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      // Testnet
      sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "arbitrum-sepolia": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      "op-sepolia": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
      "avalanche-fuji": "0x5425890298aed601595a70AB815c96711a31Bc65",
      "solana-devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    chainrailsSupported: true,
    addresses: {
      ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      base: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      optimism: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      avalanche: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      bnb: "0x55d398326f99059fF775485246999027B3197955",
    },
  },
  {
    symbol: "DAI",
    name: "Dai",
    decimals: 18,
    chainrailsSupported: true,
    addresses: {
      ethereum: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      base: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      arbitrum: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      optimism: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      polygon: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    },
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    decimals: 6,
    chainrailsSupported: true,
    addresses: {
      ethereum: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
      base: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
    },
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    chainrailsSupported: true,
    addresses: {
      ethereum: ZERO_EVM,
      base: ZERO_EVM,
      arbitrum: ZERO_EVM,
      optimism: ZERO_EVM,
      sepolia: ZERO_EVM,
      "base-sepolia": ZERO_EVM,
      "arbitrum-sepolia": ZERO_EVM,
      "op-sepolia": ZERO_EVM,
    },
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    chainrailsSupported: true,
    addresses: {
      ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      base: "0x4200000000000000000000000000000000000006",
      arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      optimism: "0x4200000000000000000000000000000000000006",
      polygon: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    },
  },
  {
    symbol: "BNB",
    name: "BNB",
    decimals: 18,
    chainrailsSupported: true,
    addresses: {
      bnb: ZERO_EVM,
    },
  },
  {
    symbol: "STRK",
    name: "Starknet Token",
    decimals: 18,
    chainrailsSupported: true,
    addresses: {
      starknet:
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      "starknet-sepolia":
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    },
  },
  {
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    chainrailsSupported: false, // not in Chainrails source token list
    addresses: {
      solana: SOL_NATIVE,
      "solana-devnet": SOL_NATIVE,
    },
  },
  {
    symbol: "MATIC",
    name: "Polygon",
    decimals: 18,
    chainrailsSupported: false,
    addresses: {
      polygon: ZERO_EVM,
      "polygon-amoy": ZERO_EVM,
    },
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    decimals: 18,
    chainrailsSupported: false,
    addresses: {
      avalanche: ZERO_EVM,
      "avalanche-fuji": ZERO_EVM,
    },
  },
];

export function getToken(symbol: TokenSymbol): TokenEntry | undefined {
  return TOKENS.find((t) => t.symbol === symbol);
}

export function getTokenAddress(
  symbol: TokenSymbol,
  chainId: ChainId
): string | undefined {
  return getToken(symbol)?.addresses[chainId];
}

/** Tokens that exist on at least one active chain. */
export const ACTIVE_TOKENS: TokenEntry[] = TOKENS.filter((t) =>
  Object.keys(t.addresses).some((id) =>
    ACTIVE_CHAINS.some((c) => c.id === (id as ChainId))
  )
);

// ---------------------------------------------------------------------------
// Aliases (used by intent parser to normalise NL → ChainId / TokenSymbol)
// ---------------------------------------------------------------------------

export const CHAIN_ALIASES: Record<string, ChainId> = {
  // Mainnet
  ethereum: "ethereum",
  eth: "ethereum",
  mainnet: "ethereum",
  l1: "ethereum",
  base: "base",
  "coinbase-l2": "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  optimism: "optimism",
  op: "optimism",
  polygon: "polygon",
  matic: "polygon",
  avalanche: "avalanche",
  avax: "avalanche",
  bnb: "bnb",
  bsc: "bnb",
  binance: "bnb",
  solana: "solana",
  sol: "solana",
  starknet: "starknet",
  strk: "starknet",
  // Testnet
  sepolia: "sepolia",
  "base-sepolia": "base-sepolia",
  basesep: "base-sepolia",
  "arb-sepolia": "arbitrum-sepolia",
  "arbitrum-sepolia": "arbitrum-sepolia",
  "op-sepolia": "op-sepolia",
  "optimism-sepolia": "op-sepolia",
  "polygon-amoy": "polygon-amoy",
  amoy: "polygon-amoy",
  fuji: "avalanche-fuji",
  "avalanche-fuji": "avalanche-fuji",
  "solana-devnet": "solana-devnet",
  devnet: "solana-devnet",
  "starknet-sepolia": "starknet-sepolia",
};

export function resolveChain(input: string): ChainId | undefined {
  return CHAIN_ALIASES[input.trim().toLowerCase()];
}

export function resolveToken(input: string): TokenSymbol | undefined {
  const upper = input.trim().toUpperCase();
  return TOKENS.find((t) => t.symbol === upper)?.symbol;
}
