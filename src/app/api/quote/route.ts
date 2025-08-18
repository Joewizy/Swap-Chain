import { NextRequest, NextResponse } from 'next/server';
import { TESTNET_CONFIG } from '@/app/utils/relay/testnet';
import { MAINNET_CONFIG } from '@/app/utils/relay/mainnet';
import { RelayConfig, TokenConfig } from '@/app/utils/relay/types';
import { parseUnits } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const { sourceChain, targetChain, token, destinationToken, amount, userAddress, recipient } = await request.json();

    if (!sourceChain || !targetChain || !token || !amount || !userAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const sellToken = String(token).toUpperCase();
    const buyToken = String(destinationToken || token).toUpperCase();

    // Resolve chains and environment config
    const { config, origin, destination, error } = resolveEnvironmentAndChains(sourceChain, targetChain);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const sourceChainId = origin!.chainId;
    const targetChainId = destination!.chainId;

    // Supported tokens from config (uppercased for case-insensitive checks)
    const supportedSymbols = new Set<string>(
      config!.tokens.map((tokenCfg) => tokenCfg.symbol.toUpperCase())
    );
    if (!supportedSymbols.has(sellToken) || !supportedSymbols.has(buyToken)) {
      return NextResponse.json({ error: `Unsupported token. Supported tokens: ${Array.from(supportedSymbols).join(', ')}` }, { status: 400 });
    }

    // If bridging to Solana, a valid recipient is required
    const isDestinationSolana = isSolanaChain(targetChainId);
    if (isDestinationSolana && (!recipient || typeof recipient !== 'string')) {
      return NextResponse.json({ error: 'Recipient (Solana address) is required when bridging to Solana.' }, { status: 400 });
    }

    // Get quote from Relay API
    const endpoint = config!.apiEndpoint;
    const quoteResponse = await fetch(`${endpoint}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userAddress,
        recipient: isDestinationSolana ? recipient : undefined,
        originChainId: sourceChainId,
        destinationChainId: targetChainId,
        originCurrency: getCurrencyAddressFor(config!, sourceChainId, sellToken),
        destinationCurrency: getCurrencyAddressFor(config!, targetChainId, buyToken),
        amount: convertToSmallestUnit(config!, amount, sellToken),
        tradeType: 'EXACT_INPUT'
      })
    });

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      throw new Error(`Failed to getQuote: ${quoteResponse.status} - ${errorText}`);
    }

    const quoteData = await quoteResponse.json();
    const steps = quoteData.steps;

    return NextResponse.json({
      success: true,
      requestId: quoteData.steps?.[0]?.requestId,
      amount: amount,
      token: sellToken,
      fromChain: sourceChain,
      toChain: targetChain,
      status: 'pending',
      steps: steps,
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

function isSolanaChain(chainId: number): boolean {
  return [792703809, 1936682084, 1118190].includes(chainId);
}

function isEvmChain(chainId: number): boolean {
  return [11155111, 84532, 421614, 11155420, 80002, 1, 10, 8453, 42161, 137].includes(chainId);
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

function convertToSmallestUnit(config: RelayConfig, amount: string, token: string): string {
  const tokenConfig = findToken(config, token);
  const decimals = tokenConfig?.decimals ?? (token.toUpperCase() === 'BTC' ? 8 : 18);
  return parseUnits(amount, decimals).toString();
}

function getCurrencyAddressFor(config: RelayConfig, chainId: number, symbol: string): string {
  const tokenConfig = findToken(config, symbol);
  const fromConfig = tokenConfig?.addresses?.[chainId];
  if (fromConfig) return fromConfig;

  // Fallbacks for native
  if (isEvmChain(chainId) && (symbol === 'ETH' || symbol === 'MATIC')) {
    return '0x0000000000000000000000000000000000000000';
  }
  if (isSolanaChain(chainId) && symbol === 'SOL') {
    return '11111111111111111111111111111111';
  }
  return getNativeTokenAddress(chainId);
}

function findToken(config: RelayConfig, symbol: string): TokenConfig | undefined {
  return config.tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}

function resolveEnvironmentAndChains(sourceChain: string, targetChain: string): { config?: RelayConfig; origin?: { id: string; chainId: number }; destination?: { id: string; chainId: number }; error?: string } {
  const sourceIdLower = sourceChain.toLowerCase();
  const targetIdLower = targetChain.toLowerCase();

  const testnetSourceChain = TESTNET_CONFIG.chains.find(c => c.id === sourceIdLower);
  const testnetTargetChain = TESTNET_CONFIG.chains.find(c => c.id === targetIdLower);
  const mainnetSourceChain = MAINNET_CONFIG.chains.find(c => c.id === sourceIdLower);
  const mainnetTargetChain = MAINNET_CONFIG.chains.find(c => c.id === targetIdLower);

  if (testnetSourceChain && testnetTargetChain) {
    return { config: TESTNET_CONFIG, origin: { id: testnetSourceChain.id, chainId: testnetSourceChain.chainId }, destination: { id: testnetTargetChain.id, chainId: testnetTargetChain.chainId } };
  }
  if (mainnetSourceChain && mainnetTargetChain) {
    return { config: MAINNET_CONFIG, origin: { id: mainnetSourceChain.id, chainId: mainnetSourceChain.chainId }, destination: { id: mainnetTargetChain.id, chainId: mainnetTargetChain.chainId } };
  }
  if ((testnetSourceChain && !testnetTargetChain) || (mainnetSourceChain && !mainnetTargetChain) || (testnetTargetChain && !testnetSourceChain) || (mainnetTargetChain && !mainnetSourceChain)) {
    return { error: 'Cannot bridge between testnet and mainnet environments' };
  }
  return { error: 'Unsupported chain' };
}
