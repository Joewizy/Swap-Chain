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
    'VET': 'cryptocurrency:vet',
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