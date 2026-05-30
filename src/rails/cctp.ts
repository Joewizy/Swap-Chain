/**
 * Circle CCTP v2 rail — addresses, ABIs, helpers.
 *
 * Pure module: no I/O, no React. Used by:
 *   - src/app/api/cctp/attestation/route.ts  (server: polls Iris)
 *   - the client hook that calls depositForBurn / receiveMessage via wagmi
 *   - scripts/test-cctp.mjs (CLI smoke test)
 *
 * Sources (verified via developers.circle.com & circlefin/evm-cctp-contracts):
 *   - Contracts: same addresses across all v2 EVM mainnets / testnets
 *   - Iris API: https://iris-api.circle.com (mainnet)
 *               https://iris-api-sandbox.circle.com (testnet)
 *   - V2 picks Fast vs Standard via the minFinalityThreshold parameter:
 *       ≤1000 → Fast Transfer  (~<60s, small Circle fee)
 *       2000  → Standard       (~15min, free)
 */

import { IS_MAINNET, type ChainId } from "@/config/network";

// ---------------------------------------------------------------------------
// Contract addresses (v2). Mainnet and testnet each share a single address
// across every supported EVM chain.
// ---------------------------------------------------------------------------

export const CCTP_TOKEN_MESSENGER: Record<"mainnet" | "testnet", `0x${string}`> = {
  mainnet: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  testnet: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
};

export const CCTP_MESSAGE_TRANSMITTER: Record<"mainnet" | "testnet", `0x${string}`> = {
  mainnet: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  testnet: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
};

export const IRIS_URL: Record<"mainnet" | "testnet", string> = {
  mainnet: "https://iris-api.circle.com",
  testnet: "https://iris-api-sandbox.circle.com",
};

// ---------------------------------------------------------------------------
// Circle domain IDs. Only EVM chains we already support in network.ts.
// Pair mainnet + testnet entries together so flips don't drift.
// ---------------------------------------------------------------------------

export const CCTP_DOMAINS: Partial<Record<ChainId, number>> = {
  // Mainnet
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  // Testnet
  sepolia: 0,
  "avalanche-fuji": 1,
  "op-sepolia": 2,
  "arbitrum-sepolia": 3,
  "base-sepolia": 6,
  "polygon-amoy": 7,
};

// ---------------------------------------------------------------------------
// Finality thresholds. Pass to depositForBurn's `minFinalityThreshold` param.
// ---------------------------------------------------------------------------

export const FINALITY_THRESHOLD = {
  fast: 1000,
  standard: 2000,
} as const;

export type CctpSpeed = keyof typeof FINALITY_THRESHOLD;

// ---------------------------------------------------------------------------
// ABI fragments — only what we actually call.
// ---------------------------------------------------------------------------

export const TOKEN_MESSENGER_V2_ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

export const MESSAGE_TRANSMITTER_V2_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Resolved context for a chain — single call site for all CCTP plumbing.
// ---------------------------------------------------------------------------

export interface CctpContext {
  chainId: ChainId;
  domain: number;
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  iris: string;
  network: "mainnet" | "testnet";
}

export function isCctpSupported(chainId: ChainId): boolean {
  return chainId in CCTP_DOMAINS;
}

export function getCctpContext(chainId: ChainId): CctpContext {
  const domain = CCTP_DOMAINS[chainId];
  if (domain === undefined) {
    throw new Error(`CCTP does not support chain "${chainId}"`);
  }
  const network = IS_MAINNET ? "mainnet" : "testnet";
  return {
    chainId,
    domain,
    tokenMessenger: CCTP_TOKEN_MESSENGER[network],
    messageTransmitter: CCTP_MESSAGE_TRANSMITTER[network],
    iris: IRIS_URL[network],
    network,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Left-pad a 20-byte EVM address into the 32-byte form CCTP expects. */
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  const hex = address.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 40) {
    throw new Error(`Expected 20-byte address, got ${hex.length / 2} bytes`);
  }
  return `0x${"0".repeat(24)}${hex}`;
}

/** Empty bytes32 — "no destination caller restriction". */
export const ZERO_BYTES32: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Iris attestation polling. Used by the server route.
// ---------------------------------------------------------------------------

export interface IrisMessage {
  attestation: `0x${string}` | "PENDING";
  message: `0x${string}`;
  eventNonce: string;
  status: "pending_confirmations" | "complete";
}

export interface IrisResponse {
  messages: IrisMessage[];
}

export async function fetchAttestation(
  srcChain: ChainId,
  txHash: `0x${string}`
): Promise<IrisResponse> {
  const ctx = getCctpContext(srcChain);
  const url = `${ctx.iris}/v2/messages/${ctx.domain}?transactionHash=${txHash}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Iris ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Iris burn-fee lookup. Used to size depositForBurn's `maxFee` argument.
// ---------------------------------------------------------------------------

export interface IrisFee {
  /** 1000 = Fast Transfer, 2000 = Standard. */
  finalityThreshold: number;
  /** Fee in basis points. May be fractional (Iris returns e.g. 1.3). */
  minimumFee: number;
}

/**
 * Fetches the current Fast/Standard burn fees for a route from Iris.
 * Returns the raw 2-entry array — one per finality threshold.
 */
export async function fetchBurnFees(srcChain: ChainId, dstChain: ChainId): Promise<IrisFee[]> {
  const src = getCctpContext(srcChain);
  const dst = getCctpContext(dstChain);
  const url = `${src.iris}/v2/burn/USDC/fees/${src.domain}/${dst.domain}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Iris ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Sizes the `maxFee` argument for depositForBurn given a raw burn amount
 * and a fee in basis points:
 *
 *   maxFee = ceil(amount * feeBps / 10_000)
 *
 * `feeBps` may be fractional, so we scale by 1e6 before the bigint math
 * to keep sub-bps precision, then ceil-divide.
 */
export function computeMaxFee(amount: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return 0n;
  const SCALE = 1_000_000n;
  const scaledBps = BigInt(Math.ceil(feeBps * Number(SCALE)));
  const numerator = amount * scaledBps;
  const denominator = 10_000n * SCALE;
  return (numerator + denominator - 1n) / denominator; // ceil division
}
