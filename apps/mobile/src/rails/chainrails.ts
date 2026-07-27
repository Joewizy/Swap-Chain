// ChainRails pure types + helpers. Mirrors web's rails/chainrails.ts (non-server
// parts); hoist to @railglide/shared when unifying rail contracts.
//
// ChainRails covers the fiat ramp for chains Paycrest can't reach. On-ramp (Buy)
// is live; off-ramp (Sell) is gated behind the flag below until Fiat KYB clears.
import type { ChainId } from "@railglide/shared/network";

/**
 * ChainRails OFF-ramp (Sell → fiat) gate. Driven by env so it flips without a
 * code change; defaults OFF when unset. Off because live payouts 403 ("Fiat KYB
 * is required before using live fiat ramp flows") until RailGlide completes Fiat
 * KYB. Set EXPO_PUBLIC_CHAINRAILS_OFFRAMP_ENABLED=true once KYB is approved.
 * On-ramp (Buy) is unaffected and stays live.
 */
export const CHAINRAILS_OFFRAMP_ENABLED =
  process.env.EXPO_PUBLIC_CHAINRAILS_OFFRAMP_ENABLED === "true";

// ---------------------------------------------------------------------------
// Ramp destinations (on-ramp / Buy).
//
// ChainRails delivers to a pasted address, so a destination needs no connected
// wallet or token registry — only a label, the ChainRails chain enum, and the
// address format to validate. That lets us offer chains the app has no wallet
// support for (Monad, HyperEVM, Tron) as buy destinations.
// ---------------------------------------------------------------------------

export type RampAddressKind = "evm" | "solana" | "starknet" | "tron";

export interface RampDestination {
  /** ChainRails chain enum sent as `destinationChain`. */
  chainrailsChain: string;
  /** Display name. */
  label: string;
  /** Address format the recipient must match. */
  addressKind: RampAddressKind;
  /** App ChainId when the wallet/registry knows this chain, else null. */
  chainId: ChainId | null;
}

/**
 * ChainRails-only ramp chains — the live mainnet chains Paycrest does NOT serve.
 * These are the only chains a Buy routes to ChainRails for.
 */
export const CHAINRAILS_RAMP_DESTINATIONS: RampDestination[] = [
  {
    chainrailsChain: "OPTIMISM_MAINNET",
    label: "Optimism",
    addressKind: "evm",
    chainId: "optimism",
  },
  {
    chainrailsChain: "AVALANCHE_MAINNET",
    label: "Avalanche",
    addressKind: "evm",
    chainId: "avalanche",
  },
  {
    chainrailsChain: "SOLANA_MAINNET",
    label: "Solana",
    addressKind: "solana",
    chainId: "solana",
  },
  {
    chainrailsChain: "MONAD_MAINNET",
    label: "Monad",
    addressKind: "evm",
    chainId: null,
  },
  {
    chainrailsChain: "HYPEREVM_MAINNET",
    label: "HyperEVM",
    addressKind: "evm",
    chainId: null,
  },
  {
    chainrailsChain: "TRON_MAINNET",
    label: "Tron",
    addressKind: "tron",
    chainId: null,
  },
];

/**
 * Block-explorer URL for a ramp order's on-chain delivery tx, or null when we
 * don't have a confirmed explorer for that chain (Monad / HyperEVM mainnet).
 * Keyed on the ChainRails chain enum so the caller doesn't need a registry
 * entry — several ramp-only chains aren't in the shared network config, and the
 * tx path differs (Tron uses /#/transaction/, the rest use /tx/).
 */
export function rampTxUrl(
  chainrailsChain: string,
  txHash: string | null | undefined
): string | null {
  const h = (txHash ?? "").trim();
  if (!h) return null;
  switch (chainrailsChain) {
    case "OPTIMISM_MAINNET":
      return `https://optimistic.etherscan.io/tx/${h}`;
    case "AVALANCHE_MAINNET":
      return `https://snowtrace.io/tx/${h}`;
    case "SOLANA_MAINNET":
      return `https://solscan.io/tx/${h}`;
    case "TRON_MAINNET":
      return `https://tronscan.org/#/transaction/${h}`;
    default:
      return null;
  }
}

/** Validate a recipient address for a ramp destination's address format. */
export function isValidRampAddress(
  kind: RampAddressKind,
  value: string
): boolean {
  const v = value.trim();
  switch (kind) {
    case "solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
    case "starknet":
      return /^0x[0-9a-fA-F]{1,64}$/.test(v);
    case "tron":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v);
    case "evm":
    default:
      return /^0x[0-9a-fA-F]{40}$/.test(v);
  }
}

// ---------------------------------------------------------------------------
// Ramp order status.
//
// The live REST API returns status strings that don't match the SDK enum and
// carry prefixes (ORDER_INITIATED, PAYMENT_PENDING, PAYMENT_EXPIRED, …), so we
// classify by keyword rather than trusting a fixed enum.
// ---------------------------------------------------------------------------

export type RampOrderPhase =
  | "pending" // created, awaiting payment / provider action
  | "processing" // paid, provider is settling / bridging
  | "completed" // crypto delivered — terminal success
  | "expired" // payment window lapsed — terminal
  | "failed" // provider failed / cancelled / refunded — terminal
  | "unknown";

/** True once the order can no longer change — stop polling. */
export function isRampPhaseTerminal(phase: RampOrderPhase): boolean {
  return phase === "completed" || phase === "expired" || phase === "failed";
}

/** Classify a live ChainRails order status into a UI phase (keyword match). */
export function classifyRampStatus(
  status: string | null | undefined
): RampOrderPhase {
  const s = (status ?? "").toUpperCase();
  if (!s) return "unknown";
  if (
    s.includes("COMPLETED") ||
    s.includes("SETTLED") ||
    s.includes("SUCCESS") ||
    // PAYMENT_RECEIVED — once the provider has the fiat we treat the buy as
    // delivered. (Checked before REFUNDED below, but "RECEIVED" can't collide
    // with it; "FUNDED" would, so it stays out of this bucket.)
    s.includes("RECEIVED")
  )
    return "completed";
  if (s.includes("EXPIRED")) return "expired";
  if (s.includes("FAILED") || s.includes("CANCELLED") || s.includes("REFUNDED"))
    return "failed";
  if (
    s.includes("PROCESSING") ||
    s.includes("BRIDGING") ||
    s.includes("PAID") ||
    s.includes("FUNDED")
  )
    return "processing";
  if (s.includes("INITIATED") || s.includes("PENDING") || s.includes("CREATED"))
    return "pending";
  return "unknown";
}
