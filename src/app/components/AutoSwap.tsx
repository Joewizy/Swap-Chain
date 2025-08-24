export async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: string,
  accountAddress: string
): Promise<{ success: boolean; txHash?: string; receipt?: any; result?: any; error?: string }> {
  try {
    const response = await fetch('/api/starknet-swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromToken,
        toToken,
        amount,
        accountAddress,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to execute swap');
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// Import TOKEN_ADDRESSES from the SDK for use in the frontend
import { TOKEN_ADDRESSES } from 'autoswap-sdk';
export { TOKEN_ADDRESSES };