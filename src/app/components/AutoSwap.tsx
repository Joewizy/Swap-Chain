/**
 * Starknet swap helper — TEMPORARILY DISABLED.
 *
 * The previous implementation routed through `/api/starknet-swap`, which
 * required a server-held `ARGENT_PRIVATE_KEY` (custodial — unshippable).
 * That endpoint has been deleted in Phase 0a.
 *
 * Phase 2 will reinstate this with client-side signing via Argent / Braavos
 * through `@starknet-react/core` (already a dependency). Until then, the UI
 * surfaces a "coming soon" message instead of attempting a swap.
 *
 * The exports `executeSwap` and `TOKEN_ADDRESSES` are kept so existing
 * callers (e.g. `dashboard/transfer/page.tsx`) compile without changes.
 */

export async function executeSwap(
  _fromToken: string,
  _toToken: string,
  _amount: string,
  _accountAddress: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return {
    success: false,
    error:
      "Starknet swaps are temporarily disabled while we rebuild them with client-side signing. Coming back in Phase 2.",
  };
}

export const TOKEN_ADDRESSES = {
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc8463d2af6f1aef0b9b9b9b9b9b9b9b9b9b9",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
} as const;
