import { AutoSwappr, TOKEN_ADDRESSES } from 'autoswap-sdk';

export async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: string,
  accountAddress: string
): Promise<{ success: boolean; txHash?: string; receipt?: any; result?: any; error?: string }> {
  try {
    // Initialize the SDK with the provided account address
    // Contract is deployed on mainnet only
    const autoswappr = new AutoSwappr({
      contractAddress: '0x05b08cbdaa6a2338e69fad7c62ce20204f1666fece27288837163c19320b9496',
      rpcUrl: 'https://starknet-mainnet.public.blastapi.io', // Using mainnet since contract is mainnet-only
      accountAddress: accountAddress,
      privateKey: process.env.ARGENT_PRIVATE_KEY || '',
    });

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