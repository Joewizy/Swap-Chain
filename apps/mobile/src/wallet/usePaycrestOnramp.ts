/**
 * usePaycrestOnramp (mobile) — fiat → stablecoin.
 *
 *   idle → creating → awaiting_deposit → settling → complete   (or error)
 *
 * Creates an order, surfaces virtual-account deposit instructions, then polls
 * until USDC lands in the recipient wallet. No wallet signature — the user
 * transfers fiat externally to the provided account.
 */
import { useCallback, useEffect, useState } from "react";
import { getChain, type ChainId } from "@railglide/shared/network";
import {
  classifyPaycrestOrder,
  humanizePaycrestError,
  isPaycrestFiat,
  paycrestNetworkSlug,
  paycrestPayoutInFlight,
  type PaycrestFiat,
  type PaycrestOrder,
  type PaycrestRecipient,
  type PaycrestToken,
} from "@/rails/paycrest";
import { createOnrampOrder, getOrder } from "@/api/paycrest";

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
  /** Human decimal fiat amount. */
  amount: string;
  fiatCurrency: PaycrestFiat;
  refundAccount: PaycrestRecipient;
  recipientAddress: `0x${string}`;
  reference?: string;
}

export function usePaycrestOnramp() {
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
            `Buying isn't available on ${getChain(toChain)?.name ?? toChain} yet.`
          );
        }
        if (
          !refundAccount.institution ||
          !refundAccount.accountIdentifier ||
          !refundAccount.accountName
        ) {
          throw new Error("A refund account is required.");
        }

        setStatus("creating");
        const created = await createOnrampOrder({
          direction: "onramp",
          amount,
          amountIn: "fiat",
          fiatCurrency,
          refundAccount,
          token,
          network,
          recipientAddress,
          reference,
        });
        setOrder(created);
        if (!created.depositAccountIdentifier || !created.amountToTransfer) {
          throw new Error("We didn't get deposit instructions for this order.");
        }
        setStatus("awaiting_deposit");
        return created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Buy failed.";
        setError(humanizePaycrestError(msg));
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    []
  );

  const isPolling = status === "awaiting_deposit" || status === "settling";
  useEffect(() => {
    if (!isPolling || !order?.id) return;
    const orderId = order.id;
    let stopped = false;

    const tick = async () => {
      try {
        const latest = await getOrder(orderId);
        if (stopped) return;
        setOrder(latest);
        if (paycrestPayoutInFlight(latest)) {
          setStatus((s) => (s === "awaiting_deposit" ? "settling" : s));
        }
        const outcome = classifyPaycrestOrder(latest, "onramp");
        if (outcome === "success") {
          setStatus("complete");
        } else if (outcome === "failed" || outcome === "expired") {
          setError(
            humanizePaycrestError(
              outcome === "failed"
                ? "This order was refunded."
                : "This order expired before your payment arrived."
            )
          );
          setStatus("error");
        }
      } catch {
        // transient — keep polling
      }
    };

    void tick();
    const handle = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [isPolling, order?.id]);

  return {
    status,
    error,
    order,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    onramp,
    reset,
  };
}
