/**
 * Paycrest endpoint wrappers → the unchanged backend routes (server holds the
 * API key). Off-ramp path: rate → institutions → verify-account → create order
 * → poll order.
 */
import { apiFetch } from "./client";
import type {
  PaycrestFiat,
  PaycrestInstitution,
  PaycrestOrder,
  PaycrestRecipient,
  PaycrestToken,
} from "@/rails/paycrest";

export interface RateResponse {
  rate: number;
  fiat: string;
  token: string;
}

/** Live unit rate (fiat per 1 token). The exact rate locks at order creation. */
export function getRate(
  fiat: PaycrestFiat,
  token: PaycrestToken
): Promise<RateResponse> {
  return apiFetch<RateResponse>(
    `/api/paycrest/rate?fiat=${fiat}&token=${token}`
  );
}

/** Payout institutions (banks + mobile money) for a currency. */
export async function getInstitutions(
  currency: PaycrestFiat
): Promise<PaycrestInstitution[]> {
  const res = await apiFetch<{ institutions: PaycrestInstitution[] }>(
    `/api/paycrest/institutions?currency=${currency}`
  );
  return res.institutions;
}

/** Resolve the real account holder's name for an institution + account number. */
export async function verifyAccount(
  institution: string,
  accountIdentifier: string
): Promise<string> {
  const res = await apiFetch<{ accountName: string }>(
    "/api/paycrest/verify-account",
    {
      method: "POST",
      body: JSON.stringify({ institution, accountIdentifier }),
    }
  );
  return res.accountName;
}

export interface CreateOfframpBody {
  direction: "offramp";
  amount: string;
  token: PaycrestToken;
  /** Paycrest network slug, e.g. "base". */
  network: string;
  refundAddress: `0x${string}`;
  currency: PaycrestFiat;
  recipient: PaycrestRecipient;
  reference?: string;
}

export function createOfframpOrder(
  body: CreateOfframpBody
): Promise<PaycrestOrder> {
  return apiFetch<PaycrestOrder>("/api/paycrest/order", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getOrder(id: string): Promise<PaycrestOrder> {
  return apiFetch<PaycrestOrder>(`/api/paycrest/order/${id}`);
}
