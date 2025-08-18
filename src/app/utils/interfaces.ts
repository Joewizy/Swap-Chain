export interface SwapFormData {
  sourceChain: string;
  targetChain: string;
  token: string;
  amount: string;
}
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

export interface RelayStatusResponse {
  status: string;
  txHashes?: string[];
}

// AI Intent Extraction Types
export interface ExtractedIntent {
  sourceChain: string;
  targetChain: string;
  token: string;
  amount: string;
  amountUnit: string;
  intentType: string;
  confidence: string;
}

// Chain Configuration
export interface ChainConfig {
  id: number;
  name: string;
  displayName: string;
  icon: string;
  rpcUrl?: string;
  explorerUrl?: string;
}

// Token Configuration
export interface TokenConfig {
  symbol: string;
  name: string;
  icon: string;
  address: string;
  decimals: number;
  chains: string[];
}

// Transaction Result
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

// Quote Details
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

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Quote response (matches Relay intent/quote response used in the app UI)
export interface RelayCheck {
  endpoint: string;
  method?: string;
}

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

export interface RelayStepItem {
  status: string; // e.g. 'incomplete' | 'complete'
  data: RelayItemData;
  check?: RelayCheck;
}

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

// Simple response structure - just the essentials (older type you use elsewhere)
export interface QuoteResponse {
  success: boolean;
  data?: {
    // What user is sending
    from: {
      chain: string;        // "Base Sepolia"
      amount: string;       // "0.01"
      token: string;        // "ETH"
      usd: string;         // "46.97"
    };
    
    // What user will receive
    to: {
      chain: string;        // "Arbitrum Sepolia" 
      amount: string;       // "0.0061"
      token: string;        // "ETH"
      usd: string;         // "28.68"
    };
    
    // Costs breakdown
    fees: {
      total: string;        // "18.29" (USD)
      gas: string;         // "0.000276" (USD)
      bridge: string;      // "18.28" (USD)
    };
    
    // Additional info
    rate: string;           // "0.611" (1 ETH = 0.611 ETH)
    time: string;          // "5 minutes"
    impact: string;        // "38.94%" (total cost percentage)
    
    // For transaction
    requestId: string;     // For tracking
    txData?: any;         // Transaction data for wallet
  };
  error?: string;
}
