import { NextRequest, NextResponse } from 'next/server';
import { RelayQuoteResponse, QuoteResponse } from '@/app/utils/interfaces';

const SUPPORTED_CHAINS = {
  // EVM Testnets
  'sepolia': 11155111,
  'base-sepolia': 84532,
  'arbitrum-sepolia': 421614,
  'op-sepolia': 11155420,
  'polygon-amoy': 80002,
  
  // Solana
  'solana-devnet': 1936682084,
  'eclipse-testnet': 1118190,
  
  // Bitcoin
  'bitcoin-testnet4': 9092725
};

// Supported tokens (native tokens only for simplicity)
const SUPPORTED_TOKENS = ['ETH', 'SOL', 'BTC', 'MATIC'];

export async function POST(request: NextRequest) {
  try {
    const { sourceChain, targetChain, token, amount } = await request.json();

    if (!sourceChain || !targetChain || !token || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceChain, targetChain, token, amount' },
        { status: 400 }
      );
    }

    // Validate chains
    const sourceChainId = SUPPORTED_CHAINS[sourceChain.toLowerCase() as keyof typeof SUPPORTED_CHAINS];
    const targetChainId = SUPPORTED_CHAINS[targetChain.toLowerCase() as keyof typeof SUPPORTED_CHAINS];
    
    if (!sourceChainId || !targetChainId) {
      return NextResponse.json(
        { 
          error: `Unsupported chain. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}` 
        },
        { status: 400 }
      );
    }

    // Validate token
    if (!SUPPORTED_TOKENS.includes(token.toUpperCase())) {
      return NextResponse.json(
        { error: `Unsupported token. Supported: ${SUPPORTED_TOKENS.join(', ')}` },
        { status: 400 }
      );
    }

    // Get quote from Relay API
    const quoteData = await getRelayQuote({
      sourceChainId,
      targetChainId,
      token: token.toUpperCase(),
      amount
    });

    return NextResponse.json(quoteData);

  } catch (error) {
    console.error('Relay quote error:', error);
    return NextResponse.json(
      { error: `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

async function getRelayQuote(params: {
  sourceChainId: number;
  targetChainId: number;
  token: string;
  amount: string;
}): Promise<QuoteResponse> {
  const { sourceChainId, targetChainId, token, amount } = params;

  try {
    console.log(`Getting quote for ${amount} ${token} from chain ${sourceChainId} to ${targetChainId}`);
    
    // Get token address (native tokens only)
    const sourceTokenAddress = getNativeTokenAddress(sourceChainId);
    const targetTokenAddress = getNativeTokenAddress(targetChainId);
    
    // Convert amount to smallest unit (ensure it's a proper integer string)
    const decimals = getTokenDecimals(token);
    const amountInSmallestUnit = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals))).toString();

    const response = await fetch('https://api.testnets.relay.link/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: '0xa2791e44234Dc9C96F260aD15fdD09Fe9B597FE1', 
        originChainId: sourceChainId,
        destinationChainId: targetChainId,
        originCurrency: sourceTokenAddress,
        destinationCurrency: targetTokenAddress,
        amount: amountInSmallestUnit,
        tradeType: 'EXACT_INPUT'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relay API error: ${response.status} - ${errorText}`);
    }

    const quoteData: RelayQuoteResponse = await response.json();
    
    // Return simplified response structure
    const simplifiedQuote: QuoteResponse = {
      success: true,
      data: {
        from: {
          chain: getChainName(sourceChainId),
          amount: quoteData.details?.currencyIn?.amountFormatted || '0',
          token: token,
          usd: parseFloat(quoteData.details?.currencyIn?.amountUsd || '0').toFixed(2)
        },
        to: {
          chain: getChainName(targetChainId),
          amount: quoteData.details?.currencyOut?.amountFormatted || '0',
          token: token,
          usd: parseFloat(quoteData.details?.currencyOut?.amountUsd || '0').toFixed(2)
        },
        fees: {
          total: Math.abs(parseFloat(quoteData.details?.totalImpact?.usd || '0')).toFixed(2),
          gas: parseFloat(quoteData.fees?.gas?.amountUsd || '0').toFixed(6),
          bridge: parseFloat(quoteData.fees?.relayerService?.amountUsd || '0').toFixed(2)
        },
        rate: quoteData.details?.rate || '0',
        time: `${quoteData.details?.timeEstimate || 0} minutes`,
        impact: (quoteData.details?.totalImpact?.percent || '0').replace('-', '') + '%',
        requestId: quoteData.steps?.[0]?.requestId || `quote_${Date.now()}`,
        txData: quoteData.steps?.[0]?.items?.[0]?.data
      }
    };

    return simplifiedQuote;

  } catch (error) {
    console.error('Quote error:', error);
    throw error;
  }
}

// Optimized native token address mapping
function getNativeTokenAddress(chainId: number): string {
  // Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy
  const evmChains = [11155111, 84532, 421614, 11155420, 80002]; 
  // Solana Devnet, Eclipse Testnet
  const solanaChains = [1936682084, 1118190]; 
  // Bitcoin Testnet 4
  const bitcoinChains = [9092725]; 
  
  if (evmChains.includes(chainId)) {
    return '0x0000000000000000000000000000000000000000';
  }
  
  if (solanaChains.includes(chainId)) {
    return '11111111111111111111111111111111';
  }
  
  if (bitcoinChains.includes(chainId)) {
    return 'tb1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqtlc5af';
  }
  
  console.error(`No address found for chain ${chainId}`);
  return '0x0000000000000000000000000000000000000000'; // Default fallback
}

function getTokenDecimals(token: string): number {
  const decimals: { [key: string]: number } = {
    'ETH': 18,
    'SOL': 9,
    'BTC': 8,
    'MATIC': 18,
  };
  return decimals[token.toUpperCase()] || 18;
}

function getChainName(chainId: number): string {
  const names: { [key: number]: string } = {
    11155111: 'Sepolia',
    84532: 'Base Sepolia',
    421614: 'Arbitrum Sepolia',
    11155420: 'OP Sepolia',
    80002: 'Polygon Amoy',
    1936682084: 'Solana Devnet',
    1118190: 'Eclipse Testnet',
    9092725: 'Bitcoin Testnet 4',
  };
  return names[chainId] || 'Unknown';
}

function calculateUSDValue(amount: string, token: string): string {
  const rates: { [key: string]: number } = {
    'ETH': 3200,
    'SOL': 38.5,
    'BTC': 49200,
    'MATIC': 2.56,
  };
  const rate = rates[token.toUpperCase()] || 1;
  return (parseFloat(amount) * rate).toFixed(2);
}

function calculateBridgeFee(amountIn: string, amountOut: string): string {
  const fee = parseFloat(amountIn) - parseFloat(amountOut);
  return fee.toFixed(6);
}
