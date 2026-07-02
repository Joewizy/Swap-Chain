/**
 * Swap & intent types.
 *
 * The shapes the swap UI and the AI intent extractor pass around before
 * a route is priced. Live-quote types live in `quote.ts`; Relay-specific
 * execution types live in `relay.ts`.
 */

/** A submitted swap form, before it is turned into a quote request. */
export interface SwapFormData {
  sourceChain: string;
  targetChain: string;
  token: string;
  amount: string;
}

/** The result of an AI intent extraction from natural-language input. */
export interface ExtractedIntent {
  sourceChain: string;
  targetChain: string;
  token: string;
  amount: string;
  amountUnit: string;
  intentType: string;
  confidence: string;
}

/** A completed transaction, as surfaced to the user after a swap. */
export interface TransactionResult {
  txHash: string;
  transactionLink: string;
  quoteId: string;
  userAddress: string;
  sourceChain: string;
  targetChain: string;
  token: string;
  amount: string;
  status: string;
  timestamp: string;
  estimatedCompletion: string;
}
