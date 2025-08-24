import { NextRequest, NextResponse } from 'next/server';
import { AutoSwappr, TOKEN_ADDRESSES } from 'autoswap-sdk';

export async function POST(request: NextRequest) {
  try {
    const { fromToken, toToken, amount, accountAddress } = await request.json();

    // Validate required fields
    if (!fromToken || !toToken || !amount || !accountAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if private key is available
    if (!process.env.ARGENT_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Starknet private key not configured' },
        { status: 500 }
      );
    }

    // Initialize AutoSwappr
    const autoswappr = new AutoSwappr({
      contractAddress: '0x05582ad635c43b4c14dbfa53cbde0df32266164a0d1b36e5b510e5b34aeb364b',
      rpcUrl: 'https://starknet-mainnet.public.blastapi.io', // Back to mainnet
      accountAddress: accountAddress,
      privateKey: process.env.ARGENT_PRIVATE_KEY,
    });

    // Get contract addresses
    const fromTokenAddr = TOKEN_ADDRESSES[fromToken as keyof typeof TOKEN_ADDRESSES];
    const toTokenAddr = TOKEN_ADDRESSES[toToken as keyof typeof TOKEN_ADDRESSES];

    if (!fromTokenAddr || !toTokenAddr) {
      return NextResponse.json(
        { error: 'Invalid token selection' },
        { status: 400 }
      );
    }

    // Check account balance before attempting swap
    try {
      const { Provider } = require('starknet');
      const provider = new Provider({ rpcUrl: 'https://starknet-mainnet.public.blastapi.io' });
      
      // Check if account exists first
      const accountInfo = await provider.getAccount(accountAddress);
      console.log('Account info:', accountInfo);
      
      // Get balance
      const balance = await provider.getBalance(accountAddress);
      console.log('Account balance:', balance);
      
      if (balance.balance === '0x0') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Insufficient ETH balance for gas fees. Please add some ETH to your account to pay for transaction fees.' 
          },
          { status: 400 }
        );
      }
    } catch (balanceError) {
      console.error('Balance check error:', balanceError);
      
      // If account doesn't exist, return specific error
      if (balanceError instanceof Error && balanceError.message.includes('Contract not found')) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Account ${accountAddress} not found on Starknet mainnet. Please ensure your account is deployed and you're using the correct network.` 
          },
          { status: 400 }
        );
      }
      
      // Continue with swap attempt for other balance check errors
      console.warn('Could not check balance, continuing with swap attempt');
    }

    // Execute swap
    const result = await autoswappr.executeSwap(fromTokenAddr, toTokenAddr, { amount });

    const txHash = (result as any)?.txHash || (result as any)?.transaction_hash || (result as any)?.transactionHash;
    
    return NextResponse.json({ 
      success: true, 
      txHash, 
      result 
    });

  } catch (error) {
    console.error('Starknet swap error:', error);
    
    // Provide more specific error messages
    let errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('fetch failed')) {
      errorMessage = 'Network error - unable to connect to Starknet RPC or Ekubo API. Please check your internet connection and try again.';
    } else if (errorMessage.includes('Contract not found')) {
      errorMessage = 'Account not found on Starknet. The account might not be deployed yet or you might be on the wrong network.';
    } else if (errorMessage.includes('decimals')) {
      errorMessage = 'Token configuration error - please try a different token pair.';
    } else if (errorMessage.includes('Ekubo API')) {
      errorMessage = 'Ekubo API error - insufficient liquidity or invalid token pair.';
    } else if (errorMessage.includes('insufficient funds')) {
      errorMessage = 'Insufficient funds for this swap.';
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage 
      },
      { status: 500 }
    );
  }
}
