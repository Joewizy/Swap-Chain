/**
 * Paycrest contracts — pure types + helpers the off-ramp flow needs.
 *
 * Mirrors the pure (non-server) parts of the web app's `src/rails/paycrest.ts`.
 * Kept mobile-local for now; hoist into @railglide/shared when we unify the
 * rail contracts across clients. The backend routes (holding the API key) are
 * unchanged — the app is a client, not a fork.
 */
import type { ChainId } from "@railglide/shared/network";

export const PAYCREST_FIAT = [
  "NGN",
  "KES",
  "GHS",
  "UGX",
  "XOF",
  "ZMW",
  "TZS",
  "ZAR",
] as const;

export type PaycrestFiat = (typeof PAYCREST_FIAT)[number];

export function isPaycrestFiat(code: string): code is PaycrestFiat {
  return (PAYCREST_FIAT as readonly string[]).includes(code.toUpperCase());
}

export type PaycrestToken = "USDC" | "USDT";
export type PaycrestDirection = "offramp" | "onramp";

/** App ChainId → Paycrest network slug (mainnet only — Paycrest has no sandbox). */
export const PAYCREST_NETWORK_SLUGS: Partial<Record<ChainId, string>> = {
  base: "base",
  ethereum: "ethereum",
  arbitrum: "arbitrum-one",
  polygon: "polygon",
  bnb: "bnb-smart-chain",
};

export function paycrestNetworkSlug(chainId: ChainId): string | null {
  return PAYCREST_NETWORK_SLUGS[chainId] ?? null;
}

/** ChainIds Paycrest can off-ramp, for the source-chain picker. */
export const PAYCREST_CHAIN_IDS = Object.keys(
  PAYCREST_NETWORK_SLUGS
) as ChainId[];

/** A payout institution (bank or mobile-money) from Paycrest's catalogue. */
export interface PaycrestInstitution {
  name: string;
  /** Code passed as recipient.institution, e.g. "GTBINGLA", "OPAYNGPC". */
  code: string;
  type: "bank" | "mobile_money";
}

/** Bank or mobile-money payout destination. */
export interface PaycrestRecipient {
  institution: string;
  accountIdentifier: string;
  accountName: string;
  memo?: string;
}

export type PaycrestOrderStatus =
  | "initiated"
  | "deposited"
  | "pending"
  | "processing"
  | "validated"
  | "settling"
  | "fulfilled"
  | "settled"
  | "refunding"
  | "refunded"
  | "expired";

/** A created order, normalised by the backend from the Paycrest response. */
export interface PaycrestOrder {
  id: string;
  status: PaycrestOrderStatus;
  direction: PaycrestDirection;
  amount: string;
  currency: string;
  rate?: string;
  /** Off-ramp: on-chain address the user funds with stablecoin. */
  receiveAddress?: string;
  validUntil?: string;
  amountPaid?: string;
  senderFee?: string;
  transactionFee?: string;
  txHash?: string;
  createdAt: string;
  updatedAt?: string;
}

export type PaycrestOutcome = "success" | "failed" | "expired" | "pending";

/** Direction-aware terminal check for the client poller. */
export function classifyPaycrestOrder(
  order: PaycrestOrder,
  direction: PaycrestDirection
): PaycrestOutcome {
  if (order.status === "settled") return "success";
  if (direction === "offramp" && order.status === "fulfilled") return "success";
  if (order.status === "refunded") return "failed";
  if (order.status === "expired") return "expired";
  if (order.validUntil && new Date(order.validUntil).getTime() < Date.now()) {
    // Funding window closed with no deposit credited yet.
    if (!order.amountPaid || Number(order.amountPaid) <= 0) return "expired";
  }
  return "pending";
}

/** Turns a raw Paycrest error into something a non-technical user can act on. */
export function humanizePaycrestError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("no provider available")) {
    return "No provider can fill an order this size right now. Try a smaller amount, or check back shortly.";
  }
  if (m.includes("rate validation") || m.includes("no rate")) {
    return "We couldn't lock a rate for that amount — try a different amount.";
  }
  if (m.includes("insufficient") || m.includes("minimum")) {
    return "That amount is outside the supported range for this payout — try a different amount.";
  }
  if (m.includes("failed to initiate payment order")) {
    return "We couldn't start this payout — please try again in a moment.";
  }
  const cleaned = message
    .replace(/^failed to validate payload\s*\[[^\]]*\]\s*/i, "")
    .replace(/\bpaycrest\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
  return cleaned || "Something went wrong — try again.";
}
