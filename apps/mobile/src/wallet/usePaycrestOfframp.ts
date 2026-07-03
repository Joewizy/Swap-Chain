// usePaycrestOfframp — stablecoin → fiat. Backend creates an order with a
// provider receiveAddress; the only signature is the on-chain transfer to it;
// then poll until settled.
//   idle → creating → awaiting_funding → funding → settling → complete (or error)
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BaseError,
  UserRejectedRequestError,
  erc20Abi,
  getAddress,
  parseUnits,
} from "viem";
import { useConfig } from "wagmi";
import {
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import {
  getChain,
  getToken,
  getTokenAddress,
  type ChainId,
} from "@railglide/shared/network";
import {
  classifyPaycrestOrder,
  humanizePaycrestError,
  isPaycrestFiat,
  paycrestNetworkSlug,
  type PaycrestFiat,
  type PaycrestOrder,
  type PaycrestRecipient,
  type PaycrestToken,
} from "@/rails/paycrest";
import { createOfframpOrder, getOrder } from "@/api/paycrest";

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
  /** EVM address refunds return to; ties the order to a wallet for History. */
  refundAddress: `0x${string}`;
  reference?: string;
}

/** True when the wallet error is the user declining the signature. */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof BaseError) {
    return Boolean(err.walk((e) => e instanceof UserRejectedRequestError));
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /user rejected|user denied|denied transaction|user cancel/i.test(msg);
}

export function usePaycrestOfframp() {
  const config = useConfig();

  const [status, setStatus] = useState<PaycrestOfframpStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PaycrestOrder | null>(null);
  const [transferTxHash, setTransferTxHash] = useState<`0x${string}` | null>(
    null
  );

  const fundingRef = useRef<{
    tokenAddress: `0x${string}`;
    receiveAddress: `0x${string}`;
    units: bigint;
    srcChainId: number;
    orderId: string;
  } | null>(null);
  const fundedRef = useRef(false);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setOrder(null);
    setTransferTxHash(null);
    fundingRef.current = null;
    fundedRef.current = false;
  }, []);

  // --- Step 1: create the order, then wait for the user to confirm -------
  const offramp = useCallback(
    async (params: PaycrestOfframpParams): Promise<PaycrestOrder> => {
      const {
        fromChain,
        token,
        amount,
        fiatCurrency,
        recipient,
        refundAddress,
        reference,
      } = params;
      try {
        setError(null);
        setOrder(null);
        setTransferTxHash(null);
        fundingRef.current = null;
        fundedRef.current = false;

        if (!isPaycrestFiat(fiatCurrency)) {
          throw new Error(`Unsupported payout currency "${fiatCurrency}".`);
        }
        const network = paycrestNetworkSlug(fromChain);
        if (!network) {
          throw new Error(
            `Off-ramp isn't available from ${getChain(fromChain)?.name ?? fromChain} yet.`
          );
        }
        if (
          !recipient.institution ||
          !recipient.accountIdentifier ||
          !recipient.accountName
        ) {
          throw new Error(
            "Payout institution, account number and name are required."
          );
        }

        const srcEntry = getChain(fromChain);
        if (!srcEntry?.viemChain) {
          throw new Error("Off-ramp requires an EVM chain.");
        }
        const srcChainId = srcEntry.viemChain.id;

        const rawToken = getTokenAddress(token, fromChain);
        const decimals = getToken(token)?.decimals;
        if (!rawToken || decimals === undefined) {
          throw new Error(`No ${token} address configured for "${fromChain}".`);
        }
        const tokenAddress = getAddress(rawToken.toLowerCase());

        let units: bigint;
        try {
          units = parseUnits(amount, decimals);
        } catch {
          throw new Error(`Couldn't parse the amount "${amount}".`);
        }
        if (units <= 0n) throw new Error("Amount must be greater than zero.");

        setStatus("creating");
        const created = await createOfframpOrder({
          direction: "offramp",
          amount,
          token,
          network,
          refundAddress,
          currency: fiatCurrency,
          recipient,
          reference,
        });
        setOrder(created);

        if (!created.receiveAddress) {
          throw new Error("We didn't get a deposit address for this order.");
        }
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
    []
  );

  // --- Step 2: send the stablecoin once the user confirms ----------------
  const fund = useCallback(async (): Promise<void> => {
    const ctx = fundingRef.current;
    if (!ctx) throw new Error("No order to fund — create the order first.");
    try {
      setError(null);
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
      fundedRef.current = true;
      await waitForTransactionReceipt(config, {
        hash: transferHash,
        chainId: ctx.srcChainId,
      });
      setStatus("settling");
    } catch (err) {
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

  // Poll the order across the funding → settling lifecycle until terminal.
  const isPolling =
    status === "awaiting_funding" ||
    status === "funding" ||
    status === "settling";
  useEffect(() => {
    if (!isPolling || !order?.id) return;
    const orderId = order.id;
    let stopped = false;

    const tick = async () => {
      try {
        const latest = await getOrder(orderId);
        if (stopped) return;
        setOrder(latest);
        const outcome = classifyPaycrestOrder(latest, "offramp");
        if (outcome === "success") {
          setStatus("complete");
          return;
        }
        if (outcome === "failed" || outcome === "expired") {
          if (fundedRef.current) {
            setError(
              humanizePaycrestError(
                outcome === "failed"
                  ? "This order was refunded — funds are returning to your refund address."
                  : "Payout is taking longer than expected. Check this order in History."
              )
            );
            setStatus("error");
          }
          // If unfunded, the window just closed — leave the panel up.
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
    transferTxHash,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    offramp,
    fund,
    reset,
  };
}
