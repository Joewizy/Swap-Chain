"use client";

/**
 * useRelaySwap — swap / non-USDC bridge execution via Relay.
 *
 * Wraps the lower-level useRelayExecutor (which signs and submits Relay's
 * dynamic step list) in the same status-machine shape the other rails use,
 * so StatusScreen can drive it like CCTP and Paycrest:
 *
 *   idle → quoting → executing → complete        (or → error)
 *
 * Quote comes from our /api/quote proxy (Relay public API); execution is
 * the user's wallet signing each step. CCTP/router/intent are untouched.
 */

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import {
  useRelayExecutor,
  type ExecutionProgress,
  type QuoteResponse,
} from "./useRelayExecutor";
import type { ChainId, TokenSymbol } from "@/config/network";

export type RelaySwapStatus =
  | "idle"
  | "quoting"
  | "executing"
  | "complete"
  | "error";

export interface RelaySwapParams {
  fromChain: ChainId;
  toChain: ChainId;
  fromToken: TokenSymbol;
  toToken: TokenSymbol;
  /** Human decimal amount. */
  amount: string;
  recipient?: string | null;
}

export interface UseRelaySwapReturn {
  status: RelaySwapStatus;
  error: string | null;
  /** Live per-step progress from the Relay executor. */
  progress: ExecutionProgress | null;
  isRunning: boolean;
  swap: (params: RelaySwapParams) => Promise<void>;
  reset: () => void;
}

export function useRelaySwap(): UseRelaySwapReturn {
  const { address, isConnected } = useAccount();
  const { executeQuote } = useRelayExecutor();

  const [status, setStatus] = useState<RelaySwapStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExecutionProgress | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setProgress(null);
  }, []);

  const swap = useCallback(
    async (params: RelaySwapParams) => {
      try {
        setError(null);
        setProgress(null);

        if (!isConnected || !address) {
          throw new Error("Connect a wallet first.");
        }

        // --- 1. quote (Relay step list via our proxy) ------------------
        setStatus("quoting");
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceChain: params.fromChain,
            targetChain: params.toChain,
            token: params.fromToken,
            destinationToken: params.toToken,
            amount: params.amount,
            userAddress: address,
            recipient: params.recipient || address,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `Couldn't price this route (${res.status}).`);
        }
        if (!data?.steps?.length) {
          throw new Error("No execution steps returned for this route.");
        }

        // --- 2. execute each step (wallet signs) -----------------------
        setStatus("executing");
        const result = await executeQuote(data as QuoteResponse, (p) =>
          setProgress(p)
        );
        if (!result.success) {
          throw new Error(result.error || "Swap failed.");
        }

        setStatus("complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Swap failed.";
        setError(msg);
        setStatus("error");
      }
    },
    [address, isConnected, executeQuote]
  );

  return {
    status,
    error,
    progress,
    isRunning:
      status !== "idle" && status !== "complete" && status !== "error",
    swap,
    reset,
  };
}
