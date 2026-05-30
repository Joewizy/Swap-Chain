/**
 * Rail router — picks which rail handles a given transfer.
 *
 * Pure decision logic, no I/O. Given a normalised transfer request it
 * returns the best rail plus the runners-up, so the API layer and the
 * UI share one source of truth for routing.
 *
 * The four rails (see ARCHITECTURE.md §"The four rails"):
 *   cctp       — Circle's native USDC burn/mint. Cheapest for USDC↔USDC.
 *   chainrails — best-across-bridges aggregator for crypto↔crypto.
 *   relay      — widest-coverage fallback (other tokens, Solana, swaps).
 *   paycrest   — fiat off-ramp (crypto → bank / mobile money).
 */

import { isCctpSupported } from "./cctp";
import { isChainrailsSupported } from "./chainrails";
import { isPaycrestFiat } from "./paycrest";
import type { ChainId, TokenSymbol } from "@/config/network";

export type RailName = "cctp" | "chainrails" | "relay" | "paycrest";

export type RouteAction = "bridge" | "swap" | "offramp" | "onramp";

/** A normalised transfer the router reasons about. */
export interface RouteRequest {
  action: RouteAction;
  fromChain: ChainId;
  fromToken: TokenSymbol;
  /** Decimal amount string. */
  amount: string;
  /** Required for bridge/swap; absent for offramp. */
  toChain?: ChainId;
  /** Defaults to fromToken when omitted. */
  toToken?: TokenSymbol;
  /** ISO fiat code — required for offramp. */
  fiatCurrency?: string;
}

export interface RailDecision {
  rail: RailName;
  /** Human-readable why-this-rail. */
  reason: string;
  /** Other rails that could also serve this route, best-first. */
  alternatives: RailName[];
}

/** Thrown when no rail can serve the request. */
export class NoRailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRailError";
  }
}

/**
 * Picks the rail for a transfer. Throws NoRailError when nothing fits.
 *
 * Order of preference for crypto→crypto:
 *   1. CCTP       — only for USDC→USDC across CCTP chains (cheapest).
 *   2. Chainrails — when both chains are on its aggregator.
 *   3. Relay      — everything else (widest coverage).
 */
export function selectRail(req: RouteRequest): RailDecision {
  // --- 1. fiat off-ramp -> Paycrest --------------------------------------
  if (req.action === "offramp") {
    const fiat = req.fiatCurrency;
    if (!fiat || !isPaycrestFiat(fiat)) {
      throw new NoRailError(
        `No off-ramp rail for fiat "${fiat ?? "(none)"}" — ` +
          `Paycrest supports a fixed set of payout currencies.`
      );
    }
    return {
      rail: "paycrest",
      reason: `Fiat off-ramp to ${fiat.toUpperCase()} via Paycrest.`,
      alternatives: [],
    };
  }

  // --- 2. fiat on-ramp -> Chainrails -------------------------------------
  if (req.action === "onramp") {
    return {
      rail: "chainrails",
      reason: "Fiat on-ramp is served by Chainrails.",
      alternatives: [],
    };
  }

  // --- 3. crypto -> crypto (bridge / swap) -------------------------------
  const { fromChain, toChain, fromToken } = req;
  const toToken = req.toToken ?? req.fromToken;

  if (!toChain) {
    throw new NoRailError(
      `A destination chain is required for a ${req.action}.`
    );
  }

  // 3a. Same-chain swap — cross-chain rails don't apply.
  if (fromChain === toChain) {
    return {
      rail: "relay",
      reason:
        "Same-chain swap — handled by Relay; CCTP and Chainrails are " +
        "cross-chain only.",
      alternatives: [],
    };
  }

  const cctpFits =
    fromToken === "USDC" &&
    toToken === "USDC" &&
    isCctpSupported(fromChain) &&
    isCctpSupported(toChain);

  const chainrailsFits =
    isChainrailsSupported(fromChain) && isChainrailsSupported(toChain);

  // 3b. USDC -> USDC across CCTP chains — native burn/mint, cheapest.
  if (cctpFits) {
    const alternatives: RailName[] = [];
    if (chainrailsFits) alternatives.push("chainrails");
    alternatives.push("relay");
    return {
      rail: "cctp",
      reason:
        "USDC→USDC across CCTP-supported chains — Circle's native " +
        "burn/mint avoids bridge-liquidity fees.",
      alternatives,
    };
  }

  // 3c. Both chains on Chainrails — let its aggregator pick the bridge.
  if (chainrailsFits) {
    return {
      rail: "chainrails",
      reason: "Chainrails' best-across-bridges aggregator covers this route.",
      alternatives: ["relay"],
    };
  }

  // 3d. Fallback — Relay has the widest coverage (Solana, Starknet, …).
  return {
    rail: "relay",
    reason:
      "Falling back to Relay — the widest-coverage rail for routes CCTP " +
      "and Chainrails don't both support.",
    alternatives: [],
  };
}
