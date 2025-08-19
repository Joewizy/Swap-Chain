import { AutoSwappr, TOKEN_ADDRESSES } from 'autoswap-sdk';

// Initialize the SDK (NOTE: running with a private key on the client is insecure; consider server-side execution)
const autoswappr = new AutoSwappr({
  contractAddress: '0x5b08cbdaa6a2338e69fad7c62ce20204f1666fece27288837163c19320b9496',
  rpcUrl: 'https://starknet-mainnet.public.blastapi.io',
  accountAddress: '0x01dbd76e66F3388C9309dc384FAB8BbAe5c068Ac5e212DFbC4636Bab42f3D502',
  privateKey: process.env.ARGENT_PRIVATE_KEY || '',
});

export async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; receipt?: any; result?: any; error?: string }> {
  try {
    const result = await autoswappr.executeSwap(fromToken, toToken, { amount });
    // Try common shapes
    const txHash = (result as any)?.txHash || (result as any)?.transaction_hash || (result as any)?.transactionHash;
    return { success: true, txHash, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export { TOKEN_ADDRESSES };