import { NextRequest, NextResponse } from 'next/server';

const SUPPORTED_CHAINS = {
  'sepolia': 11155111,
  'base-sepolia': 84532,
  'arbitrum-sepolia': 421614,
  'op-sepolia': 11155420,
  'polygon-amoy': 80002,
  'abstract-testnet': 11124,
  'solana-devnet': 1936682084,
  'eclipse-testnet': 1118190,
  'bitcoin-testnet4': 9092725
};

const SUPPORTED_TOKENS = ['ETH', 'SOL', 'BTC', 'MATIC'];

export async function POST(request: NextRequest) {
  try {
    const { sourceChain, targetChain, token, amount, userAddress } = await request.json();

    if (!sourceChain || !targetChain || !token || !amount || !userAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const sourceChainId = SUPPORTED_CHAINS[sourceChain.toLowerCase() as keyof typeof SUPPORTED_CHAINS];
    const targetChainId = SUPPORTED_CHAINS[targetChain.toLowerCase() as keyof typeof SUPPORTED_CHAINS];
    
    if (!sourceChainId || !targetChainId) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    if (!SUPPORTED_TOKENS.includes(token.toUpperCase())) {
      return NextResponse.json({ error: `Unsupported token. Supported tokens: ${SUPPORTED_TOKENS.join(', ')}` }, { status: 400 });
    }

    // Get quote from Relay API
    const quoteResponse = await fetch('https://api.testnets.relay.link/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userAddress,
        originChainId: sourceChainId,
        destinationChainId: targetChainId,
        originCurrency: getNativeTokenAddress(sourceChainId),
        destinationCurrency: getNativeTokenAddress(targetChainId),
        amount: convertToSmallestUnit(amount, token),
        tradeType: 'EXACT_INPUT'
      })
    });

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      throw new Error(`Failed to getQuote: ${quoteResponse.status} - ${errorText}`);
    }

    const quoteData = await quoteResponse.json();
    const steps = quoteData.steps;

    // Return the quote with steps for client-side execution
    return NextResponse.json({
      success: true,
      requestId: quoteData.steps?.[0]?.requestId,
      amount: amount,
      token: token,
      fromChain: sourceChain,
      toChain: targetChain,
      status: 'pending',
      steps: steps, // Client needs to execute these steps
      quote: quoteData
    });
  } catch (error) {
    console.error('Quote error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

function getNativeTokenAddress(chainId: number): string {
  const evmChains = [11155111, 84532, 421614, 11155420, 80002];
  const solanaChains = [1936682084, 1118190];
  const bitcoinChains = [9092725];
  
  if (evmChains.includes(chainId)) return '0x0000000000000000000000000000000000000000';
  if (solanaChains.includes(chainId)) return '11111111111111111111111111111111';
  if (bitcoinChains.includes(chainId)) return 'tb1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqtlc5af';
  
  return '0x0000000000000000000000000000000000000000';
}

function convertToSmallestUnit(amount: string, token: string): string {
  const decimals: { [key: string]: number } = { 'ETH': 18, 'SOL': 9, 'BTC': 8, 'MATIC': 18 };
  const decimal = decimals[token.toUpperCase()] || 18;
  return BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimal))).toString();
}
