"use client";

/**
 * usePaycrestNetwork — resolves which Paycrest chain a fiat flow should use.
 *
 * Priority: a chain the user named in chat → the connected wallet chain (when
 * Paycrest can off/on-ramp it) → the default settlement chain. Also reports
 * when the wallet is on a chain we can't use, so the flow can prompt a switch.
 *
 * Shared by CashoutFlow and BuyFlow.
 */

import { useAccount } from "wagmi";
import {
  DEFAULT_SETTLEMENT_CHAIN_ID,
  getChain,
  getChainByNumericId,
  type ChainId,
} from "@/config/network";
import { paycrestNetworkSlug } from "@/rails/paycrest";

export interface PaycrestNetwork {
  /** The chain the flow should use for the order. */
  chain: ChainId;
  /** Display name of `chain`. */
  chainName: string;
  /** Wallet is on a chain Paycrest can't use (and the user named none). */
  connectedUnsupported: boolean;
  /** Display name of the connected chain (or "this network"). */
  connectedName: string;
}

export function usePaycrestNetwork(seedChain?: ChainId): PaycrestNetwork {
  const { chainId, chain: wagmiChain, isConnected } = useAccount();
  const connectedChain = chainId ? getChainByNumericId(chainId)?.id : undefined;
  const connectedSupported = Boolean(
    connectedChain && paycrestNetworkSlug(connectedChain)
  );

  const chain =
    seedChain ??
    (connectedSupported
      ? (connectedChain as ChainId)
      : DEFAULT_SETTLEMENT_CHAIN_ID);
  const chainName = getChain(chain)?.name ?? chain;

  const connectedUnsupported = isConnected && !seedChain && !connectedSupported;
  const connectedName =
    (connectedChain ? getChain(connectedChain)?.name : wagmiChain?.name) ??
    "this network";

  return { chain, chainName, connectedUnsupported, connectedName };
}
