export function calculateUSDValue(amount: string, token: string): string {
    const rates: { [key: string]: number } = {
      'ETH': 3200,
      'SOL': 38.5,
      'BTC': 49200,
      'MATIC': 2.56,
    };
    const rate = rates[token.toUpperCase()] || 1;
    return (parseFloat(amount) * rate).toFixed(2);
  }
  
export function calculateBridgeFee(amountIn: string, amountOut: string): string {
    const fee = parseFloat(amountIn) - parseFloat(amountOut);
    return fee.toFixed(6);
  }