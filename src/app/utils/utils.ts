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

/**
 * Get the appropriate cryptocurrency icon for a given token symbol
 * @param tokenSymbol - The token symbol (e.g., 'ETH', 'USDC', 'STRK')
 * @returns The iconify icon name for the token
 */
export const getTokenIcon = (tokenSymbol: string): string => {
  const iconMap: Record<string, string> = {
    // Major Tokens
    'ETH': 'cryptocurrency:eth',
    'WETH': 'cryptocurrency:eth',
    'BTC': 'cryptocurrency:btc',
    'USDC': 'cryptocurrency:usdc', 
    'USDT': 'cryptocurrency:usdt',
    'SOL': 'cryptocurrency:sol',
    'MATIC': 'cryptocurrency:matic',
    'AVAX': 'cryptocurrency:avax',
    'BNB': 'cryptocurrency:bnb',
    'ADA': 'cryptocurrency:ada',
    'DOT': 'cryptocurrency:dot',
    
    // DeFi Tokens
    'LINK': 'cryptocurrency:link',
    'UNI': 'cryptocurrency:uni',
    'AAVE': 'cryptocurrency:aave',
    'COMP': 'cryptocurrency:comp',
    'MKR': 'cryptocurrency:mkr',
    'SNX': 'cryptocurrency:snx',
    
    // Layer 2 & Other
    'ARB': 'cryptocurrency:arb',
    'OP': 'cryptocurrency:op',
    'STRK': 'simple-icons:starknet',
    
    // Additional tokens
    'DAI': 'cryptocurrency:dai',
    'SHIB': 'cryptocurrency:shib',
    'LTC': 'cryptocurrency:ltc',
    'XRP': 'cryptocurrency:xrp',
    'DOGE': 'cryptocurrency:doge',
    'TRX': 'cryptocurrency:trx',
    'BCH': 'cryptocurrency:bch',
    'EOS': 'cryptocurrency:eos',
    'XLM': 'cryptocurrency:xlm',
    'VET': 'cryptocurrency:vet',
    'ATOM': 'cryptocurrency:atom',
    'ALGO': 'cryptocurrency:algo',
    'NEAR': 'cryptocurrency:near',
    'FTM': 'cryptocurrency:ftm',
    'ONE': 'cryptocurrency:one',
    'ICP': 'cryptocurrency:icp',
    'FIL': 'cryptocurrency:fil',
    'THETA': 'cryptocurrency:theta',
    'XTZ': 'cryptocurrency:xtz',
    'CAKE': 'cryptocurrency:cake',
    'SUSHI': 'cryptocurrency:sushi',
    'YFI': 'cryptocurrency:yfi',
    'CRV': 'cryptocurrency:crv',
    'BAL': 'cryptocurrency:bal',
    'REN': 'cryptocurrency:ren',
    'ZRX': 'cryptocurrency:zrx',
    'BAT': 'cryptocurrency:bat',
    'MANA': 'cryptocurrency:mana',
    'SAND': 'cryptocurrency:sand',
    'ENJ': 'cryptocurrency:enj',
    'CHZ': 'cryptocurrency:chz',
    'HOT': 'cryptocurrency:hot',
    'HBAR': 'cryptocurrency:hbar',
    'IOTA': 'cryptocurrency:iota',
    'NEO': 'cryptocurrency:neo',
    'QTUM': 'cryptocurrency:qtum',
    'WAVES': 'cryptocurrency:waves',
    'ZEC': 'cryptocurrency:zec',
    'XMR': 'cryptocurrency:xmr',
    'DASH': 'cryptocurrency:dash',
    'ETC': 'cryptocurrency:etc',
    'BTT': 'cryptocurrency:btt',
    'WIN': 'cryptocurrency:win',
    'CRO': 'cryptocurrency:cro',
    'KDA': 'cryptocurrency:kda',
    'KSM': 'cryptocurrency:ksm',
    'GLMR': 'cryptocurrency:glmr',
    'MOVR': 'cryptocurrency:movr',
    'ROSE': 'cryptocurrency:rose',
    'IOTX': 'cryptocurrency:iotx',
    'ANKR': 'cryptocurrency:ankr',
    'STORJ': 'cryptocurrency:storj',
    'SKL': 'cryptocurrency:skl',
    'OCEAN': 'cryptocurrency:ocean',
    'BAND': 'cryptocurrency:band',
    'NMR': 'cryptocurrency:nmr',
    'UMA': 'cryptocurrency:uma',
    'KNC': 'cryptocurrency:knc',
    'ZEN': 'cryptocurrency:zen',
    'RSR': 'cryptocurrency:rsr',
    'OGN': 'cryptocurrency:ogn',
    'ALPHA': 'cryptocurrency:alpha',
    'PERP': 'cryptocurrency:perp',
    'BADGER': 'cryptocurrency:badger',
    'FARM': 'cryptocurrency:farm',
    'PICKLE': 'cryptocurrency:pickle',
    'CREAM': 'cryptocurrency:cream',
    'COVER': 'cryptocurrency:cover',
    'KP3R': 'cryptocurrency:kp3r',
    'HEGIC': 'cryptocurrency:hegic',
  };
  
  // Return the icon for the token symbol (case-insensitive)
  return iconMap[tokenSymbol.toUpperCase()] || 'material-symbols:monetization-on';
};

/**
 * Get the appropriate chain icon for a given chain name
 * @param chainName - The chain name (e.g., 'Ethereum', 'Polygon', 'Arbitrum')
 * @returns The iconify icon name for the chain
 */
export const getChainIcon = (chainName: string): string => {
  const iconMap: Record<string, string> = {
    'ethereum': 'cryptocurrency:eth',
    'mainnet': 'cryptocurrency:eth',
    'polygon': 'cryptocurrency:matic',
    'matic': 'cryptocurrency:matic',
    'arbitrum': 'cryptocurrency:arb',
    'arb': 'cryptocurrency:arb',
    'optimism': 'cryptocurrency:op',
    'op': 'cryptocurrency:op',
    'base': 'cryptocurrency:eth', // Base uses ETH icon
    'bsc': 'cryptocurrency:bnb',
    'binance': 'cryptocurrency:bnb',
    'avalanche': 'cryptocurrency:avax',
    'avax': 'cryptocurrency:avax',
    'solana': 'cryptocurrency:sol',
    'sol': 'cryptocurrency:sol',
    'starknet': 'simple-icons:starknet',
    'cardano': 'cryptocurrency:ada',
    'ada': 'cryptocurrency:ada',
    'polkadot': 'cryptocurrency:dot',
    'dot': 'cryptocurrency:dot',
  };
  
  return iconMap[chainName.toLowerCase()] || 'material-symbols:account-balance-wallet';
};

/**
 * Check user balance for a specific token on a specific chain
 * @param address - User's wallet address
 * @param tokenSymbol - Token symbol (e.g., 'ETH', 'USDC', 'USDT')
 * @param chainId - Chain ID to check balance on
 * @param publicClient - Viem public client for the chain
 * @returns Balance information including raw balance and formatted amount
 */
export const checkTokenBalance = async (
  address: string,
  tokenSymbol: string,
  chainId: number,
  publicClient: any
): Promise<{ 
  balance: bigint; 
  balanceFormatted: string; 
  decimals: number; 
  symbol: string;
  error?: string;
} | null> => {
  try {
    // For native tokens (ETH, MATIC, etc.), use getBalance
    if (tokenSymbol === 'ETH' || tokenSymbol === 'MATIC' || tokenSymbol === 'AVAX' || tokenSymbol === 'BNB') {
      const balance = await publicClient.getBalance({ address: address as `0x${string}` });
      const balanceInEth = Number(balance) / 1e18;
      
      return {
        balance,
        balanceFormatted: balanceInEth.toFixed(6),
        decimals: 18,
        symbol: tokenSymbol
      };
    }
    
    // For ERC-20 tokens, we need to call the token contract
    // This would require token contract addresses and ABI
    // For now, return null for non-native tokens
    console.warn(`Balance checking for ${tokenSymbol} on chain ${chainId} not implemented yet`);
    return null;
    
  } catch (error) {
    console.error(`Failed to get ${tokenSymbol} balance on chain ${chainId}:`, error);
    return {
      balance: BigInt(0),
      balanceFormatted: '0',
      decimals: 18,
      symbol: tokenSymbol,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Check multiple token balances for a user across different chains
 * @param address - User's wallet address
 * @param tokens - Array of tokens to check (symbol and chainId)
 * @param publicClients - Map of chainId to publicClient
 * @returns Map of token balances
 */
export const checkMultipleTokenBalances = async (
  address: string,
  tokens: Array<{ symbol: string; chainId: number }>,
  publicClients: Record<number, any>
): Promise<Record<string, { 
  balance: bigint; 
  balanceFormatted: string; 
  decimals: number; 
  symbol: string;
  chainId: number;
  error?: string;
} | null>> => {
  const results: Record<string, any> = {};
  
  for (const token of tokens) {
    const publicClient = publicClients[token.chainId];
    if (!publicClient) {
      console.warn(`No public client found for chain ${token.chainId}`);
      results[`${token.symbol}-${token.chainId}`] = null;
      continue;
    }
    
    const balance = await checkTokenBalance(
      address,
      token.symbol,
      token.chainId,
      publicClient
    );
    
    if (balance) {
      results[`${token.symbol}-${token.chainId}`] = {
        ...balance,
        chainId: token.chainId
      };
    } else {
      results[`${token.symbol}-${token.chainId}`] = null;
    }
  }
  
  return results;
};

/**
 * Validate if user has sufficient balance for a transaction
 * @param userBalance - User's current balance
 * @param requestedAmount - Amount requested for transaction
 * @param gasBuffer - Additional buffer for gas fees (in same token)
 * @returns Validation result
 */
export const validateTransactionBalance = (
  userBalance: { balance: bigint; balanceFormatted: string; decimals: number },
  requestedAmount: string,
  gasBuffer: string = '0'
): {
  isValid: boolean;
  userBalanceFormatted: string;
  requestedAmountFormatted: string;
  gasBufferFormatted: string;
  totalRequiredFormatted: string;
  shortfallFormatted: string;
  error?: string;
} => {
  try {
    const userBalanceNum = parseFloat(userBalance.balanceFormatted);
    const requestedAmountNum = parseFloat(requestedAmount);
    const gasBufferNum = parseFloat(gasBuffer);
    const totalRequired = requestedAmountNum + gasBufferNum;
    
    const isValid = userBalanceNum >= totalRequired;
    const shortfall = isValid ? 0 : totalRequired - userBalanceNum;
    
    return {
      isValid,
      userBalanceFormatted: userBalance.balanceFormatted,
      requestedAmountFormatted: requestedAmount,
      gasBufferFormatted: gasBuffer,
      totalRequiredFormatted: totalRequired.toFixed(6),
      shortfallFormatted: shortfall.toFixed(6),
      error: isValid ? undefined : `Insufficient balance. Need ${totalRequired.toFixed(6)} but have ${userBalance.balanceFormatted}`
    };
  } catch (error) {
    return {
      isValid: false,
      userBalanceFormatted: userBalance.balanceFormatted,
      requestedAmountFormatted: requestedAmount,
      gasBufferFormatted: gasBuffer,
      totalRequiredFormatted: '0',
      shortfallFormatted: '0',
      error: 'Failed to validate balance'
    };
  }
};

/**
 * Get estimated gas buffer for a chain (in ETH equivalent)
 * @param chainId - Chain ID
 * @returns Estimated gas buffer in ETH
 */
export const getGasBufferForChain = (chainId: number): string => {
  const gasBuffers: Record<number, string> = {
    // Mainnet chains
    1: '0.01',    // Ethereum mainnet
    137: '0.1',   // Polygon
    42161: '0.001', // Arbitrum
    10: '0.001',  // Optimism
    8453: '0.001', // Base
    56: '0.001',  // BSC
    43114: '0.01', // Avalanche
    
    // Testnet chains
    11155111: '0.01', // Sepolia
    80001: '0.1',     // Mumbai
    421614: '0.001',  // Arbitrum Sepolia
    11155420: '0.001', // Optimism Sepolia
    84532: '0.001',   // Base Sepolia
    97: '0.001',      // BSC Testnet
    43113: '0.01',    // Fuji
  };
  
  return gasBuffers[chainId] || '0.01'; // Default buffer
};