/**
 * Config descriptor types.
 *
 * Display/metadata shapes for chains and tokens. The live source of
 * truth for the active network is `src/config/network.ts`; these are
 * the generic descriptor types the UI binds against.
 */

/** Metadata describing a single chain. */
export interface ChainConfig {
  id: number;
  name: string;
  displayName: string;
  icon: string;
  rpcUrl?: string;
  explorerUrl?: string;
}

/** Metadata describing a single token and the chains it lives on. */
export interface TokenConfig {
  symbol: string;
  name: string;
  icon: string;
  address: string;
  decimals: number;
  chains: string[];
}
