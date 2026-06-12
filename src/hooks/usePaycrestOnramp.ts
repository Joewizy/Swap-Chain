"use client";

/**
 * usePaycrestOnramp — fiat on-ramp flow (bank / mobile money → stablecoin).
 *
 *   idle → creating → awaiting_deposit → settling → complete   (or → error)
 *
 * Creates an order via /api/paycrest/order, surfaces virtual-account deposit
 * instructions, then polls until USDC lands in the recipient wallet.
 * No wallet signature is required — the user transfers fiat externally.
 */

import { useCallback, useEffect, useState } from "react";
import {
  humanizePaycrestError,
  isPaycrestFiat,
  paycrestNetworkSlug,
  type PaycrestFiat,
  type PaycrestOrder,
  type PaycrestRefundAccount,
  type PaycrestToken,
} from "@/rails/paycrest";
import { getChain, type ChainId } from "@/config/network";

export type PaycrestOnrampStatus =
  | "idle"
  | "creating"
  | "awaiting_deposit"
  | "settling"
  | "complete"
  | "error";

export interface PaycrestOnrampParams {
  toChain: ChainId;
  token: PaycrestToken;
  /** Human decimal amount — fiat or crypto per amountIn. */
  amount: string;
  amountIn?: "fiat" | "crypto";
  fiatCurrency: PaycrestFiat;
  refundAccount: PaycrestRefundAccount;
  recipientAddress: `0x${string}`;
  reference?: string;
}

export interface UsePaycrestOnrampReturn {
  status: PaycrestOnrampStatus;
  error: string | null;
  order: PaycrestOrder | null;
  isRunning: boolean;
  onramp: (params: PaycrestOnrampParams) => Promise<PaycrestOrder>;
  /** Adopt an existing order from History (view settled or finish in-flight). */
  resume: (params: { orderId: string }) => Promise<PaycrestOrder>;
  reset: () => void;
}

const SETTLE_POLL_INTERVAL_MS = 5_000;
const SETTLE_POLL_ATTEMPTS = 120;
const SUCCESS = new Set(["settled", "fulfilled"]);
const FAILED = new Set(["refunded", "expired"]);

export function usePaycrestOnramp(): UsePaycrestOnrampReturn {
  const [status, setStatus] = useState<PaycrestOnrampStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PaycrestOrder | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setOrder(null);
  }, []);

  const onramp = useCallback(
    async (params: PaycrestOnrampParams): Promise<PaycrestOrder> => {
      const {
        toChain,
        token,
        amount,
        amountIn = "fiat",
        fiatCurrency,
        refundAccount,
        recipientAddress,
        reference,
      } = params;

      try {
        setError(null);
        setOrder(null);

        if (!isPaycrestFiat(fiatCurrency)) {
          throw new Error(`Unsupported fiat currency "${fiatCurrency}".`);
        }
        const network = paycrestNetworkSlug(toChain);
        if (!network) {
          throw new Error(
            `On-ramp isn't available on ${getChain(toChain)?.name ?? toChain} yet.`
          );
        }
        if (
          !refundAccount.institution ||
          !refundAccount.accountIdentifier ||
          !refundAccount.accountName
        ) {
          throw new Error(
            "Refund account institution, identifier and name are required."
          );
        }

        setStatus("creating");
        const created = await createOrder({
          direction: "onramp",
          amount,
          amountIn,
          fiatCurrency,
          refundAccount,
          token,
          network,
          recipientAddress,
          reference,
        });
        setOrder(created);

        if (
          !created.depositAccountIdentifier ||
          !created.amountToTransfer
        ) {
          throw new Error(
            "We didn't get deposit instructions for this order."
          );
        }

        setStatus("awaiting_deposit");
        const settled = await pollOrder(created.id, setOrder, () =>
          setStatus("settling")
        );

        setStatus("complete");
        return settled;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "On-ramp failed.";
        setError(humanizePaycrestError(msg));
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    []
  );

  const resume = useCallback(async ({ orderId }: { orderId: string }) => {
    try {
      setError(null);
      setStatus("creating");
      const res = await fetch(`/api/paycrest/order/${orderId}`);
      const fetched = (await res.json()) as PaycrestOrder;
      if (!res.ok || !fetched?.id) {
        throw new Error("Couldn't load this order.");
      }
      setOrder(fetched);

      if (SUCCESS.has(fetched.status)) {
        setStatus("complete");
        return fetched;
      }
      if (FAILED.has(fetched.status)) {
        throw new Error(
          fetched.status === "expired"
            ? "This order expired before your payment arrived."
            : "This order was refunded."
        );
      }
      if (fetched.status === "pending" || fetched.status === "processing") {
        setStatus("settling");
      } else {
        setStatus("awaiting_deposit");
      }
      return fetched;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't resume order.";
      setError(humanizePaycrestError(msg));
      setStatus("error");
      throw err instanceof Error ? err : new Error(msg);
    }
  }, []);

  useEffect(() => {
    if (status !== "awaiting_deposit" && status !== "settling") return;
    if (!order?.id) return;
    const orderId = order.id;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/paycrest/order/${orderId}`);
        if (!res.ok || cancelled) return;
        const next = (await res.json()) as PaycrestOrder;
        if (cancelled) return;
        setOrder(next);
        if (SUCCESS.has(next.status)) {
          setStatus("complete");
          return;
        }
        if (FAILED.has(next.status)) {
          setError(
            humanizePaycrestError(
              next.status === "expired"
                ? "This order expired before your payment arrived."
                : "This order was refunded."
            )
          );
          setStatus("error");
          return;
        }
        if (next.status === "pending" || next.status === "processing") {
          setStatus("settling");
        }
      } catch {
        // Transient poll failure — next tick retries.
      }
    };

    const timer = setInterval(tick, SETTLE_POLL_INTERVAL_MS);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, order?.id]);

  return {
    status,
    error,
    order,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    onramp,
    resume,
    reset,
  };
}

interface CreateOnrampBody {
  direction: "onramp";
  amount: string;
  amountIn?: "fiat" | "crypto";
  fiatCurrency: PaycrestFiat;
  refundAccount: PaycrestRefundAccount;
  token: PaycrestToken;
  network: string;
  recipientAddress: `0x${string}`;
  reference?: string;
}

async function createOrder(body: CreateOnrampBody): Promise<PaycrestOrder> {
  const res = await fetch("/api/paycrest/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Couldn't create this order (${res.status}).`);
  }
  return data as PaycrestOrder;
}

async function pollOrder(
  id: string,
  onUpdate: (order: PaycrestOrder) => void,
  onSettling?: () => void
): Promise<PaycrestOrder> {
  for (let attempt = 0; attempt < SETTLE_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`/api/paycrest/order/${id}`);
    if (res.ok) {
      const next = (await res.json()) as PaycrestOrder;
      onUpdate(next);
      if (next.status === "pending" || next.status === "processing") {
        onSettling?.();
      }
      if (SUCCESS.has(next.status)) return next;
      if (FAILED.has(next.status)) {
        throw new Error(
          `Order ${next.status} — any eligible fiat refund goes to your refund account.`
        );
      }
    }
    await sleep(SETTLE_POLL_INTERVAL_MS);
  }
  throw new Error(
    "On-ramp is taking longer than expected. If you already deposited, " +
      `check this order in History (order ${id.slice(0, 8)}…).`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
