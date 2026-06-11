"use client";

/**
 * useTokenBalance — the connected wallet's ERC-20 balance for a token on a
 * chain, as a live read. Used to show "you have X USDC" and to flag when an
 * amount exceeds the balance. Native gas tokens are out of scope here.
 */

import { erc20Abi, formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import {
  getChain,
  getToken,
  getTokenAddress,
  type ChainId,
  type TokenSymbol,
} from "@/config/network";

export interface UseTokenBalanceReturn {
  /** Raw base-unit balance, or undefined until loaded. */
  raw: bigint | undefined;
  /** Human decimal string, e.g. "1234.5". */
  formatted: string | undefined;
  decimals: number;
  isLoading: boolean;
  refetch: () => void;
}

export function useTokenBalance(
  token?: TokenSymbol,
  chain?: ChainId
): UseTokenBalanceReturn {
  const { address } = useAccount();

  const tokenAddress =
    token && chain
      ? (getTokenAddress(token, chain) as `0x${string}` | undefined)
      : undefined;
  const decimals = (token && getToken(token)?.decimals) ?? 6;
  const chainId = chain ? getChain(chain)?.viemChain?.id : undefined;

  const { data, isLoading, refetch } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: Boolean(address && tokenAddress && chainId),
      // Re-read periodically so a top-up reflects without a manual refresh.
      refetchInterval: 12_000,
    },
  });

  const raw = typeof data === "bigint" ? data : undefined;
  const formatted = raw !== undefined ? formatUnits(raw, decimals) : undefined;

  return { raw, formatted, decimals, isLoading, refetch: () => void refetch() };
}
