/**
 * LiFi-backed token + chain registry.
 *
 * Why: maintaining our own per-chain token list is a chore (logos, decimals,
 * new pairs, …). LiFi already maintains a comprehensive catalog used by
 * Jumper and others. We pull chains + tokens from there and filter to our
 * `ACTIVE_CHAINS`, so the UI only ever shows things the router can actually
 * serve.
 *
 * Caching: one fetch per browser session per call. The catalogs change
 * slowly; cache invalidation is "reload the page".
 *
 * Mainnet vs testnet: LiFi is mainnet-only. When the network mode is
 * testnet (or LiFi simply has no entry for a chain), we fall back to the
 * tokens declared in `src/config/network.ts`. That keeps testnet usable
 * while still benefiting from LiFi on mainnet.
 */

import {
  getChains as lifiGetChains,
  getTokens as lifiGetTokens,
  type ExtendedChain,
  type Token as LifiToken,
} from "@lifi/sdk";
import {
  ACTIVE_CHAINS,
  ACTIVE_TOKENS,
  getChainByNumericId,
  type ChainId,
} from "@/config/network";

export interface RegistryChain {
  id: ChainId;
  numericId: number;
  name: string;
  logoURI?: string;
}

export interface RegistryToken {
  chain: ChainId;
  /** Contract address. Zero address for the native gas token. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  /** USD spot price from LiFi when available — handy for the form preview. */
  priceUSD?: string;
}

// ---------------------------------------------------------------------------
// In-process cache
// ---------------------------------------------------------------------------

let chainsPromise: Promise<RegistryChain[]> | null = null;
let tokensPromise: Promise<Record<string, RegistryToken[]>> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns every chain in `ACTIVE_CHAINS`, enriched with LiFi metadata
 * (name + logo) when LiFi knows about it. Order matches `ACTIVE_CHAINS`.
 */
export function loadChains(): Promise<RegistryChain[]> {
  if (!chainsPromise) {
    chainsPromise = (async () => {
      const lifi: ExtendedChain[] = await lifiGetChains().catch(() => []);
      const byNumericId = new Map(lifi.map((c) => [c.id, c]));
      return ACTIVE_CHAINS.map((entry) => {
        const lc = byNumericId.get(entry.numericId);
        return {
          id: entry.id,
          numericId: entry.numericId,
          name: lc?.name ?? entry.name,
          logoURI: lc?.logoURI,
        };
      });
    })();
  }
  return chainsPromise;
}

/**
 * Returns a map of `ChainId → tokens on that chain`. LiFi data wins when
 * available; otherwise we synthesise entries from `src/config/network.ts`
 * so testnet (and any chain LiFi doesn't cover) still works.
 */
export function loadTokens(): Promise<Record<string, RegistryToken[]>> {
  if (!tokensPromise) {
    tokensPromise = (async () => {
      const numericIds = ACTIVE_CHAINS.map((c) => c.numericId);
      const lifi = await lifiGetTokens({ chains: numericIds }).catch(() => ({
        tokens: {} as Record<number, LifiToken[]>,
      }));

      const byChain: Record<string, RegistryToken[]> = {};

      // 1. Seed from our local registry — this is what testnet sees.
      for (const chain of ACTIVE_CHAINS) {
        const local: RegistryToken[] = [];
        for (const t of ACTIVE_TOKENS) {
          const address = t.addresses[chain.id];
          if (!address) continue;
          local.push({
            chain: chain.id,
            address,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
          });
        }
        byChain[chain.id] = local;
      }

      // 2. Overlay LiFi's catalog on top — much larger on mainnet chains.
      for (const [numericIdStr, list] of Object.entries(lifi.tokens)) {
        const entry = getChainByNumericId(Number(numericIdStr));
        if (!entry) continue;
        byChain[entry.id] = list.map((t) => ({
          chain: entry.id,
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          logoURI: t.logoURI,
          priceUSD: t.priceUSD,
        }));
      }

      return byChain;
    })();
  }
  return tokensPromise;
}

/** Convenience: tokens for one chain, empty array when unknown. */
export async function tokensForChain(
  chain: ChainId
): Promise<RegistryToken[]> {
  const all = await loadTokens();
  return all[chain] ?? [];
}
