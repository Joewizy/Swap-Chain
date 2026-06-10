/**
 * Paycrest rail — fiat off-ramp (stablecoin → bank / mobile money).
 *
 * Pure module: no I/O, safe to import from client or server. Holds the
 * single source of truth the intent parser, the API route and the UI
 * all share — supported payout currencies, the API host, the env gate
 * and the order request/response types.
 *
 * The live integration is Paycrest's v2 Sender API. The API key is
 * server-only, so the actual fetch lives in /api/paycrest/order.
 *
 * Docs: https://docs.paycrest.io/implementation-guides/sender-api-integration
 * Note: Paycrest runs on mainnet only — no sandbox; test with the
 * documented $0.50 minimum order size.
 *
 * See ARCHITECTURE.md §"Phase 1 — Local payout MVP".
 */

import type { ChainId } from "@/config/network";

/** Paycrest Sender API host. Auth is the `API-Key` request header. */
export const PAYCREST_BASE_URL = "https://api.paycrest.io";

/** Fiat currencies Paycrest can pay out to (priority launch corridors). */
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

/** Case-insensitive check + type guard for a supported payout currency. */
export function isPaycrestFiat(code: string): code is PaycrestFiat {
  return (PAYCREST_FIAT as readonly string[]).includes(code.toUpperCase());
}

/** Stablecoins Paycrest accepts as off-ramp source funds. */
export type PaycrestToken = "USDC" | "USDT";

// ---------------------------------------------------------------------------
// Networks — map our app ChainId to Paycrest's network slug. Off-ramp funds
// are sent on this chain to the provider's receive address. Slugs mirror
// Paycrest's "Supported Stablecoins & Networks" list; "base" is verified
// against a live order. Chains absent here can't be off-ramp sources.
// ---------------------------------------------------------------------------

export const PAYCREST_NETWORK_SLUGS: Partial<Record<ChainId, string>> = {
  base: "base",
  arbitrum: "arbitrum-one",
  polygon: "polygon",
  bnb: "bnb-smart-chain",
};

/** Paycrest network slug for a chain, or null when it can't off-ramp there. */
export function paycrestNetworkSlug(chainId: ChainId): string | null {
  return PAYCREST_NETWORK_SLUGS[chainId] ?? null;
}

/** A payout institution (bank or mobile-money) from Paycrest's catalogue. */
export interface PaycrestInstitution {
  name: string;
  /** Code passed as recipient.institution, e.g. "GTBINGLA", "OPAYNGPC". */
  code: string;
  type: "bank" | "mobile_money";
}

/**
 * True when the Paycrest API key is present in the server env. Returns
 * false on the client (the key is server-only) — call this inside the
 * API route, not in the hook.
 */
export function isPaycrestConfigured(): boolean {
  return Boolean(process.env.PAYCREST_API_KEY);
}

// ---------------------------------------------------------------------------
// Order types — the request/response shape the hook and route agree on.
// ---------------------------------------------------------------------------

/** Bank or mobile-money payout destination. */
export interface PaycrestRecipient {
  /** Payout institution code (bank or mobile-money provider), e.g. "GTBINGLA". */
  institution: string;
  /** Bank account number or mobile-money phone number. */
  accountIdentifier: string;
  accountName: string;
  /** Optional narration / memo on the payout. */
  memo?: string;
}

/**
 * An off-ramp order as the app submits it — a flat shape the route nests
 * into Paycrest's `{ source, destination }` v2 request body.
 */
export interface PaycrestOrderRequest {
  /** Stablecoin amount to off-ramp, decimal string. */
  amount: string;
  /** Stablecoin being sent. */
  token: PaycrestToken;
  /** Paycrest network slug the stablecoin sits on, e.g. "base". */
  network: string;
  /** Address Paycrest refunds to if the order fails or expires. */
  refundAddress: `0x${string}`;
  /** ISO fiat code to pay out in. */
  currency: PaycrestFiat;
  recipient: PaycrestRecipient;
  /** Optional caller reference, surfaced back on the order. */
  reference?: string;
}

/** Paycrest order lifecycle. Mirrors the status field Paycrest returns. */
export type PaycrestOrderStatus =
  | "initiated"
  | "pending"
  | "processing"
  | "settled"
  | "refunded"
  | "expired";

/** A created off-ramp order, normalised from the Paycrest response. */
export interface PaycrestOrder {
  id: string;
  status: PaycrestOrderStatus;
  /** Stablecoin amount the user must send to fulfil the order. */
  amount: string;
  /** Fiat currency the recipient is paid in. */
  currency: string;
  /** On-chain address the user funds with the stablecoin. */
  receiveAddress?: string;
  /** When the receive address stops accepting funds (ISO timestamp). */
  validUntil?: string;
  createdAt: string;
  /** Untouched Paycrest payload, for fields this typed view omits. */
  raw?: unknown;
}
