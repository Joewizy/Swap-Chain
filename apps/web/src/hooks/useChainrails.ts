"use client";

/**
 * useChainrails — cross-bridge quote for a Chainrails-funded route.
 *
 * Chainrails covers crypto inbound + fiat on-ramp; this hook surfaces its
 * best-across-bridges quote. The SDK needs the API key, so the call goes
 * through /api/chainrails/quote — the hook only resolves token addresses
 * and maps app ChainIds onto Chainrails enum names.
 *
 * Pairs with src/rails/chainrails.ts.
 */

import { useCallback, useState } from "react";
import { isChainrailsSupported, toChainrailsChain } from "@/rails/chainrails";
import {
  getTokenAddress,
  type ChainId,
  type TokenSymbol,
} from "@/config/network";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainrailsQuoteParams {
  srcChain: ChainId;
  dstChain: ChainId;
  /** Funding token, e.g. "USDC". Resolved to an address on each chain. */
  token: TokenSymbol;
  /** Raw base units, decimal string. */
  amount: string;
  recipient: `0x${string}`;
}

export interface ChainrailsQuote {
  /** Total fee, human-readable (e.g. "0.0055"). */
  totalFeeFormatted: string;
  /** Amount the user must deposit including fees, human-readable. */
  depositAmountFormatted: string;
  /** Settlement asset symbol. */
  assetToken: string;
  route: {
    sourceChain: string;
    destinationChain: string;
    /** Underlying bridge Chainrails picked (CCTP, ACROSS, …). */
    bridge: string;
  };
  /** Untouched SDK payload, for fields the typed view omits. */
  raw: unknown;
}

export type ChainrailsStatus = "idle" | "loading" | "success" | "error";

export interface UseChainrailsReturn {
  quote: ChainrailsQuote | null;
  status: ChainrailsStatus;
  error: string | null;
  getQuote: (params: ChainrailsQuoteParams) => Promise<ChainrailsQuote>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChainrails(): UseChainrailsReturn {
  const [quote, setQuote] = useState<ChainrailsQuote | null>(null);
  const [status, setStatus] = useState<ChainrailsStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setQuote(null);
    setStatus("idle");
    setError(null);
  }, []);

  const getQuote = useCallback(
    async (params: ChainrailsQuoteParams): Promise<ChainrailsQuote> => {
      setStatus("loading");
      setError(null);

      try {
        if (!isChainrailsSupported(params.srcChain)) {
          throw new Error(
            `Chainrails does not support source chain "${params.srcChain}".`
          );
        }
        if (!isChainrailsSupported(params.dstChain)) {
          throw new Error(
            `Chainrails does not support destination chain "${params.dstChain}".`
          );
        }

        const tokenIn = getTokenAddress(params.token, params.srcChain);
        const tokenOut = getTokenAddress(params.token, params.dstChain);
        if (!tokenIn || !tokenOut) {
          throw new Error(
            `${params.token} is not available on both chains.`
          );
        }

        const res = await fetch("/api/chainrails/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceChain: toChainrailsChain(params.srcChain),
            destinationChain: toChainrailsChain(params.dstChain),
            tokenIn,
            tokenOut,
            amount: params.amount,
            recipient: params.recipient,
            amountSymbol: params.token,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.error || `Chainrails quote failed (${res.status}).`
          );
        }

        const next: ChainrailsQuote = {
          totalFeeFormatted: data.totalFeeFormatted,
          depositAmountFormatted: data.depositAmountFormatted,
          assetToken: data.assetToken,
          route: {
            sourceChain: data.route?.sourceChain,
            destinationChain: data.route?.destinationChain,
            bridge: data.route?.bridge,
          },
          raw: data,
        };
        setQuote(next);
        setStatus("success");
        return next;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Chainrails quote failed.";
        setError(msg);
        setStatus("error");
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    []
  );

  return { quote, status, error, getQuote, reset };
}
