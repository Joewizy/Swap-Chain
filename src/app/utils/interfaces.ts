export interface QuoteResponse {
    details: {
      currencyIn: {
        amountFormatted: string;
      };
      currencyOut: {
        amountFormatted: string;
      };
      timeEstimate: number;
      totalImpact: {
        usd: string;
        percent: string;
      };
    };
    fees: {
      gas: {
        amountFormatted: string;
        amountUsd: string;
      };
      relayer: {
        amountFormatted: string;
        amountUsd: string;
        currency: {
          symbol: string;
        };
      };
    };
  }
  
  export interface userResponse {
    sourceChain: string,
    targetChain: "string",
    token: string,
    amount: string,
    amountUnit: string,
    intentType: string,
    confidence: string
  }