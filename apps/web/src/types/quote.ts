/**
 * Quote types.
 *
 * The swap-quote shapes the UI renders. `QuoteDetails` is the flat
 * summary; `QuoteResponse` is the wrapped payload returned by the
 * quote API. Relay's richer quote shape lives in `relay.ts`.
 */

/** Flat quote summary: amounts, fees, route and timing in one object. */
export interface QuoteDetails {
  sourceChain: string;
  targetChain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  amountOutUSD: string;
  bridgeFee: string;
  gasFee: string;
  gasFeeUSD: string;
  totalFeeUSD: string;
  estimatedTime: string;
  route: string;
  quoteId: string;
}

/**
 * Quote API response — just the essentials, grouped into what the user
 * sends (`from`), what they receive (`to`) and the cost breakdown.
 */
export interface QuoteResponse {
  success: boolean;
  data?: {
    // What user is sending
    from: {
      chain: string; // "Base Sepolia"
      amount: string; // "0.01"
      token: string; // "ETH"
      usd: string; // "46.97"
    };

    // What user will receive
    to: {
      chain: string; // "Arbitrum Sepolia"
      amount: string; // "0.0061"
      token: string; // "ETH"
      usd: string; // "28.68"
    };

    // Costs breakdown
    fees: {
      total: string; // "18.29" (USD)
      gas: string; // "0.000276" (USD)
      bridge: string; // "18.28" (USD)
    };

    // Additional info
    rate: string; // "0.611" (1 ETH = 0.611 ETH)
    time: string; // "5 minutes"
    impact: string; // "38.94%" (total cost percentage)

    // For transaction
    requestId: string; // For tracking
    txData?: any; // Transaction data for wallet
  };
  error?: string;
}
