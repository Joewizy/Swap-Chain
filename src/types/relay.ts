/**
 * Relay types.
 *
 * The slice of the Relay intent/quote/execution API the app UI needs.
 * `RelayQuoteResponse` is the priced quote; `RelayExecutionResponse`
 * wraps the executable steps. `relay-executor.ts` keeps its own
 * narrower, hook-coupled copies of `RelayStep`/`RelayStepItem`.
 */

/** A priced Relay quote: steps to execute plus the cost breakdown. */
export interface RelayQuoteResponse {
  steps: Array<{
    kind: string;
    requestId: string;
    items: Array<{
      status: string;
      data: {
        to: string;
        data: string;
        value: string;
        gas?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      };
    }>;
  }>;
  details: {
    currencyIn: {
      currency: {
        chainId: number;
        symbol: string;
      };
      amountFormatted: string;
      amountUsd: string;
    };
    currencyOut: {
      currency: {
        chainId: number;
        symbol: string;
      };
      amountFormatted: string;
      amountUsd: string;
    };
    timeEstimate: number;
    rate: string;
    totalImpact: {
      usd: string;
      percent: string;
    };
  };
  fees: {
    gas: {
      amountUsd: string;
    };
    relayerService: {
      amountUsd: string;
    };
  };
}

/** Polling result for an in-flight Relay transaction. */
export interface RelayStatusResponse {
  status: string;
  txHashes?: string[];
}

/** A status-check endpoint attached to a Relay step item. */
export interface RelayCheck {
  endpoint: string;
  method?: string;
}

/** The transaction payload inside a Relay step item. */
export interface RelayItemData {
  from?: string;
  to: string;
  data?: string;
  value?: string;
  chainId?: number;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  abi?: any[];
  functionName?: string;
  args?: any[];
}

/** One item within a Relay step (a single tx or signature). */
export interface RelayStepItem {
  status: string; // e.g. 'incomplete' | 'complete'
  data: RelayItemData;
  check?: RelayCheck;
}

/** A single step in a Relay route (approval, deposit, …). */
export interface RelayStep {
  id: string; // e.g. 'deposit'
  action?: string;
  description?: string;
  kind: string; // e.g. 'transaction' | 'signature'
  items: RelayStepItem[];
  requestId?: string;
  depositAddress?: string;
  chainId?: number;
}

/** Executable Relay quote: the steps the wallet must run, in order. */
export interface RelayExecutionResponse {
  success: boolean;
  requestId?: string;
  amount: string;
  token: string;
  fromChain: string;
  toChain: string;
  status: string; // e.g. 'pending'
  steps: RelayStep[];
  // Raw quote payload from Relay; structure is large, so keep as any
  quote: any;
  error?: string;
}
