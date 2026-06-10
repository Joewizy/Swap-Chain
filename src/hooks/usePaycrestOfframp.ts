"use client";

/**
 * usePaycrestOfframp — full fiat off-ramp flow (stablecoin → bank / mobile money).
 *
 * Drives the whole off-ramp from the connected wallet, advancing through a
 * status state machine the UI can render:
 *
 *   idle → creating → funding → settling → complete        (or → error)
 *
 * The model: Paycrest issues an order with a provider `receiveAddress`. We
 * create the order (server route holds the API key), send the stablecoin to
 * that address on-chain (the only signature the user makes), then poll the
 * order until the provider settles fiat to the recipient.
 *
 * Pairs with src/rails/paycrest.ts and the /api/paycrest/* routes.
 */

import { useCallback, useState } from "react";
import { erc20Abi, parseUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import {
  isPaycrestFiat,
  paycrestNetworkSlug,
  type PaycrestFiat,
  type PaycrestOrder,
  type PaycrestRecipient,
  type PaycrestToken,
} from "@/rails/paycrest";
import { getChain, getToken, getTokenAddress, type ChainId } from "@/config/network";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaycrestOfframpStatus =
  | "idle"
  | "creating"
  | "funding"
  | "settling"
  | "complete"
  | "error";

export interface PaycrestOfframpParams {
  fromChain: ChainId;
  token: PaycrestToken;
  /** Human decimal amount, e.g. "50". */
  amount: string;
  fiatCurrency: PaycrestFiat;
  recipient: PaycrestRecipient;
  reference?: string;
}

export interface UsePaycrestOfframpReturn {
  status: PaycrestOfframpStatus;
  error: string | null;
  order: PaycrestOrder | null;
  /** Hash of the on-chain transfer that funded the provider's receive address. */
  transferTxHash: `0x${string}` | null;
  /** True while a run is mid-flight (not idle/complete/error). */
  isRunning: boolean;
  offramp: (params: PaycrestOfframpParams) => Promise<PaycrestOrder>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Polling config
// ---------------------------------------------------------------------------

const SETTLE_POLL_INTERVAL_MS = 5_000;
const SETTLE_POLL_ATTEMPTS = 120; // 120 × 5s = 10 min

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaycrestOfframp(): UsePaycrestOfframpReturn {
  const config = useConfig();
  const { address, isConnected } = useAccount();

  const [status, setStatus] = useState<PaycrestOfframpStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PaycrestOrder | null>(null);
  const [transferTxHash, setTransferTxHash] = useState<`0x${string}` | null>(
    null
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setOrder(null);
    setTransferTxHash(null);
  }, []);

  const offramp = useCallback(
    async (params: PaycrestOfframpParams): Promise<PaycrestOrder> => {
      const { fromChain, token, amount, fiatCurrency, recipient, reference } =
        params;

      try {
        setError(null);
        setOrder(null);
        setTransferTxHash(null);

        // --- validate ----------------------------------------------------
        if (!isConnected || !address) {
          throw new Error("Connect a wallet first.");
        }
        if (!isPaycrestFiat(fiatCurrency)) {
          throw new Error(`Unsupported payout currency "${fiatCurrency}".`);
        }
        const network = paycrestNetworkSlug(fromChain);
        if (!network) {
          throw new Error(
            `Off-ramp isn't available from ${getChain(fromChain)?.name ?? fromChain} yet.`
          );
        }
        if (!recipient.institution || !recipient.accountIdentifier || !recipient.accountName) {
          throw new Error("Payout institution, account number and name are required.");
        }

        const srcEntry = getChain(fromChain);
        if (!srcEntry?.viemChain) {
          throw new Error("Off-ramp requires an EVM chain with a configured viem chain.");
        }
        const srcChainId = srcEntry.viemChain.id;

        const tokenAddress = getTokenAddress(token, fromChain) as
          | `0x${string}`
          | undefined;
        const decimals = getToken(token)?.decimals;
        if (!tokenAddress || decimals === undefined) {
          throw new Error(`No ${token} address configured for "${fromChain}".`);
        }

        let units: bigint;
        try {
          units = parseUnits(amount, decimals);
        } catch {
          throw new Error(`Couldn't parse the amount "${amount}".`);
        }
        if (units <= 0n) {
          throw new Error("Amount must be greater than zero.");
        }

        // --- 1. create the order (server proxies Paycrest) ---------------
        setStatus("creating");
        const created = await createOrder({
          amount,
          token,
          network,
          refundAddress: address,
          currency: fiatCurrency,
          recipient,
          reference,
        });
        setOrder(created);

        const receiveAddress = created.receiveAddress as
          | `0x${string}`
          | undefined;
        if (!receiveAddress) {
          throw new Error(
            "Paycrest didn't return a receive address for this order."
          );
        }

        // --- 2. fund the provider's receive address on-chain -------------
        setStatus("funding");
        await switchChain(config, { chainId: srcChainId });
        const transferHash = await writeContract(config, {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "transfer",
          args: [receiveAddress, units],
          chainId: srcChainId,
        });
        setTransferTxHash(transferHash);
        await waitForTransactionReceipt(config, {
          hash: transferHash,
          chainId: srcChainId,
        });

        // --- 3. poll until the provider settles fiat ---------------------
        setStatus("settling");
        const settled = await pollOrder(created.id, setOrder);

        setStatus("complete");
        return settled;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Off-ramp failed.";
        setError(msg);
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    [address, isConnected, config]
  );

  return {
    status,
    error,
    order,
    transferTxHash,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    offramp,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface CreateOrderBody {
  amount: string;
  token: PaycrestToken;
  network: string;
  refundAddress: `0x${string}`;
  currency: PaycrestFiat;
  recipient: PaycrestRecipient;
  reference?: string;
}

async function createOrder(body: CreateOrderBody): Promise<PaycrestOrder> {
  const res = await fetch("/api/paycrest/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Paycrest order failed (${res.status}).`);
  }
  return data as PaycrestOrder;
}

/** Terminal order states — once reached, polling stops. */
const SETTLED = "settled";
const FAILED = new Set(["refunded", "expired"]);

/**
 * Polls /api/paycrest/order/:id until the order settles. Surfaces each
 * fetched order via `onUpdate` so the UI can reflect intermediate states.
 */
async function pollOrder(
  id: string,
  onUpdate: (order: PaycrestOrder) => void
): Promise<PaycrestOrder> {
  for (let attempt = 0; attempt < SETTLE_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`/api/paycrest/order/${id}`);
    if (res.ok) {
      const order = (await res.json()) as PaycrestOrder;
      onUpdate(order);
      if (order.status === SETTLED) return order;
      if (FAILED.has(order.status)) {
        throw new Error(
          `Order ${order.status} — funds are being returned to your refund address.`
        );
      }
    }
    await sleep(SETTLE_POLL_INTERVAL_MS);
  }
  throw new Error(
    "Payout is taking longer than expected. Your transfer went through — " +
      `track order ${id} from your dashboard; it will settle once the provider pays out.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
