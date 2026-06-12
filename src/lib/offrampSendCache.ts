"use client";

import {
  paycrestFundingWindowClosed,
  type PaycrestOrder,
} from "@/rails/paycrest";

/**
 * Client-side cache of the user's on-chain send for an off-ramp order (USDC,
 * USDT, or any other order token). Used after refresh/resume for explorer links
 * and "already sent" UX only — never for payout status; the provider API is
 * the source of truth for that.
 */

const txKey = (orderId: string) => `offramp:send-tx:${orderId}`;
const sentAtKey = (orderId: string) => `offramp:send-at:${orderId}`;

/** Legacy keys from paycrestDepositMemory — read once on recall. */
const legacyTxKey = (orderId: string) => `paycrest:deposit:${orderId}`;
const legacySentAtKey = (orderId: string) => `paycrest:deposit-at:${orderId}`;

export function saveOrderSendTx(orderId: string, txHash: string): void {
  try {
    localStorage.setItem(txKey(orderId), txHash);
    localStorage.setItem(sentAtKey(orderId), String(Date.now()));
    localStorage.removeItem(legacyTxKey(orderId));
    localStorage.removeItem(legacySentAtKey(orderId));
  } catch {
    // localStorage unavailable — non-fatal
  }
}

export function getOrderSendTxHash(orderId: string): string | null {
  try {
    return (
      localStorage.getItem(txKey(orderId)) ??
      localStorage.getItem(legacyTxKey(orderId))
    );
  } catch {
    return null;
  }
}

export function getOrderSendAt(orderId: string): number | null {
  try {
    const raw =
      localStorage.getItem(sentAtKey(orderId)) ??
      localStorage.getItem(legacySentAtKey(orderId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function clearOrderSendTx(orderId: string): void {
  try {
    localStorage.removeItem(txKey(orderId));
    localStorage.removeItem(sentAtKey(orderId));
    localStorage.removeItem(legacyTxKey(orderId));
    localStorage.removeItem(legacySentAtKey(orderId));
  } catch {
    // non-fatal
  }
}

/** Poll stop helper — provider API only, no localStorage override. */
export function isOrderFundingWindowClosed(order: PaycrestOrder): boolean {
  return paycrestFundingWindowClosed(order);
}
