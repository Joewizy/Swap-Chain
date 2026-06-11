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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BaseError,
  UserRejectedRequestError,
  erc20Abi,
  getAddress,
  parseUnits,
} from "viem";
import { useAccount, useConfig } from "wagmi";
import { switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import {
  humanizePaycrestError,
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
  | "awaiting_funding"
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
  /** Step 1: create the order. Stops at `awaiting_funding` for user review. */
  offramp: (params: PaycrestOfframpParams) => Promise<PaycrestOrder>;
  /** Step 2: send the stablecoin (wallet signature) once the user confirms. */
  fund: () => Promise<PaycrestOrder>;
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

  // Funding context captured at order time, used when the user taps "Send".
  const fundingRef = useRef<{
    tokenAddress: `0x${string}`;
    receiveAddress: `0x${string}`;
    units: bigint;
    srcChainId: number;
    orderId: string;
  } | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setOrder(null);
    setTransferTxHash(null);
    fundingRef.current = null;
  }, []);

  // --- Step 1: create the order, then wait for the user to confirm -------
  const offramp = useCallback(
    async (params: PaycrestOfframpParams): Promise<PaycrestOrder> => {
      const { fromChain, token, amount, fiatCurrency, recipient, reference } =
        params;

      try {
        setError(null);
        setOrder(null);
        setTransferTxHash(null);
        fundingRef.current = null;

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

        const rawToken = getTokenAddress(token, fromChain);
        const decimals = getToken(token)?.decimals;
        if (!rawToken || decimals === undefined) {
          throw new Error(`No ${token} address configured for "${fromChain}".`);
        }
        // Normalise to a valid EIP-55 address regardless of how it's stored.
        const tokenAddress = getAddress(rawToken.toLowerCase());

        let units: bigint;
        try {
          units = parseUnits(amount, decimals);
        } catch {
          throw new Error(`Couldn't parse the amount "${amount}".`);
        }
        if (units <= 0n) {
          throw new Error("Amount must be greater than zero.");
        }

        // --- create the order (server proxies Paycrest) ------------------
        setStatus("creating");
        const created = await createOrder({
          direction: "offramp",
          amount,
          token,
          network,
          refundAddress: address,
          currency: fiatCurrency,
          recipient,
          reference,
        });
        setOrder(created);

        if (!created.receiveAddress) {
          throw new Error(
            "Paycrest didn't return a receive address for this order."
          );
        }

        // Stash everything fund() needs; wait for explicit user action.
        fundingRef.current = {
          tokenAddress,
          receiveAddress: getAddress(created.receiveAddress.toLowerCase()),
          units,
          srcChainId,
          orderId: created.id,
        };
        setStatus("awaiting_funding");
        return created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Off-ramp failed.";
        setError(humanizePaycrestError(msg));
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    [address, isConnected]
  );

  // --- Step 2: send the stablecoin once the user confirms the invoice ----
  const fund = useCallback(async (): Promise<PaycrestOrder> => {
    const ctx = fundingRef.current;
    if (!ctx) {
      throw new Error("No order to fund — create the order first.");
    }
    try {
      setError(null);

      // Move the stablecoin to the provider's receive address.
      setStatus("funding");
      await switchChain(config, { chainId: ctx.srcChainId });
      const transferHash = await writeContract(config, {
        address: ctx.tokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [ctx.receiveAddress, ctx.units],
        chainId: ctx.srcChainId,
      });
      setTransferTxHash(transferHash);
      await waitForTransactionReceipt(config, {
        hash: transferHash,
        chainId: ctx.srcChainId,
      });

      // Poll until the provider settles fiat to the recipient.
      setStatus("settling");
      const settled = await pollOrder(ctx.orderId, setOrder);

      setStatus("complete");
      return settled;
    } catch (err) {
      // User backed out in the wallet — not an error. Return them to the
      // invoice so they can send when ready; show nothing scary.
      if (isUserRejection(err)) {
        setStatus("awaiting_funding");
        throw err;
      }
      const msg = err instanceof Error ? err.message : "Transfer failed.";
      setError(humanizePaycrestError(msg));
      setStatus("error");
      throw err instanceof Error ? err : new Error(msg);
    }
  }, [config]);

  // While awaiting funds, poll the order so a deposit from ANY source (the
  // wallet button, another wallet, or an exchange) advances the screen.
  // Read-only — no signing, no order creation.
  useEffect(() => {
    if (status !== "awaiting_funding" || !order?.id) return;
    const orderId = order.id;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const tick = async () => {
      try {
        const res = await fetch(`/api/paycrest/order/${orderId}`);
        if (!res.ok || cancelled) return;
        const o = (await res.json()) as PaycrestOrder;
        if (cancelled) return;
        setOrder(o);
        if (o.status === SETTLED) {
          setStatus("complete");
          stop();
        } else if (FAILED.has(o.status)) {
          // Terminal (expired / refunded) — let the UI read order.status.
          stop();
        }
      } catch {
        // transient; keep polling
      }
    };
    timer = setInterval(tick, SETTLE_POLL_INTERVAL_MS);
    tick();
    return () => {
      cancelled = true;
      stop();
    };
  }, [status, order?.id]);

  return {
    status,
    error,
    order,
    transferTxHash,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    offramp,
    fund,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** True when the wallet error is the user declining the signature. */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof BaseError) {
    return Boolean(err.walk((e) => e instanceof UserRejectedRequestError));
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /user rejected|user denied|denied transaction|user cancel/i.test(msg);
}

interface CreateOrderBody {
  direction: "offramp";
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
