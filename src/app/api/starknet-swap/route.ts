import { NextRequest, NextResponse } from 'next/server';
import { AutoSwappr, TOKEN_ADDRESSES } from 'autoswap-sdk';

export async function POST(request: NextRequest) {
  try {
    const { fromToken, toToken, amount, accountAddress } = await request.json();

    // Validate required fields
    if (!fromToken || !toToken || !amount || !accountAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: fromToken, toToken, amount, accountAddress' },
        { status: 400 }
      );
    }

    // Private key is now server-side only
    const autoswappr = new AutoSwappr({
      contractAddress: '0x05582ad635c43b4c14dbfa53cbde0df32266164a0d1b36e5b510e5b34aeb364b',
      rpcUrl: 'https://starknet-mainnet.public.blastapi.io',
      accountAddress: accountAddress,
      privateKey: process.env.ARGENT_PRIVATE_KEY || '',
    });

    const result = await autoswappr.executeSwap(fromToken, toToken, { amount });

    const txHash = (result as any)?.txHash || (result as any)?.transaction_hash || (result as any)?.transactionHash;
    
    return NextResponse.json({ 
      success: true, 
      txHash, 
      result 
    });

  } catch (error) {
    console.error('Starknet swap error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
