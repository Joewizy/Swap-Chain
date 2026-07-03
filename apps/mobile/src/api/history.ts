/**
 * Order history — GET /api/paycrest/orders (SIWE-protected).
 *
 * The backend derives the wallet from the verified session, filters Paycrest's
 * sender orders to that wallet, and returns the summarized list. We send the
 * session token as a Bearer header. The order shape mirrors web's
 * `PaycrestHistoryOrder` (rails/paycrest.ts) — kept to the fields History
 * renders; hoist to @railglide/shared if it needs to be a hard contract.
 */
import { apiFetch } from "./client";

export type PaycrestDirection = "offramp" | "onramp";

export interface HistoryOrder {
  id: string;
  direction: PaycrestDirection;
  status: string;
  amount: string;
  token: string;
  network: string;
  rate: string | null;
  currency: string | null;
  fiatAmount: number | null;
  recipientName: string | null;
  institution: string | null;
  accountIdentifier: string | null;
  txHash: string | null;
  createdAt: string | null;
}

export interface OrdersResponse {
  orders: HistoryOrder[];
  address: string;
}

export function fetchOrders(token: string): Promise<OrdersResponse> {
  return apiFetch<OrdersResponse>("/api/paycrest/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
