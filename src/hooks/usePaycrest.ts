"use client";

/**
 * usePaycrest — fiat off-ramp orders (USDC → bank / mobile money).
 *
 * Posts the off-ramp order to /api/paycrest/order, which proxies
 * Paycrest's v2 Sender API (the API key is server-only). The route
 * returns HTTP 501 until PAYCREST_API_KEY is set in the server env.
 *
 * Pairs with src/rails/paycrest.ts.
 */

import { useCallback, useState } from "react";
import {
  isPaycrestFiat,
  type PaycrestOrder,
  type PaycrestOrderRequest,
} from "@/rails/paycrest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaycrestStatus = "idle" | "creating" | "success" | "error";

export interface UsePaycrestReturn {
  order: PaycrestOrder | null;
  status: PaycrestStatus;
  error: string | null;
  createOrder: (request: PaycrestOrderRequest) => Promise<PaycrestOrder>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaycrest(): UsePaycrestReturn {
  const [order, setOrder] = useState<PaycrestOrder | null>(null);
  const [status, setStatus] = useState<PaycrestStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setOrder(null);
    setStatus("idle");
    setError(null);
  }, []);

  const createOrder = useCallback(
    async (request: PaycrestOrderRequest): Promise<PaycrestOrder> => {
      setStatus("creating");
      setError(null);

      try {
        if (!isPaycrestFiat(request.currency)) {
          throw new Error(
            `Unsupported payout currency "${request.currency}".`
          );
        }

        const res = await fetch("/api/paycrest/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.error || `Paycrest order failed (${res.status}).`
          );
        }

        const created = data as PaycrestOrder;
        setOrder(created);
        setStatus("success");
        return created;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Paycrest order failed.";
        setError(msg);
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    []
  );

  return { order, status, error, createOrder, reset };
}
