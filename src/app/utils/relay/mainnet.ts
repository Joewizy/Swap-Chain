import { RelayConfig } from './types';

export const MAINNET_CONFIG: RelayConfig = {
  apiEndpoint: 'https://api.relay.link',
  chains: [
    { id: 'ethereum', name: 'Ethereum', chainId: 1, icon: '🔷', environment: 'mainnet' },
    { id: 'base', name: 'Base', chainId: 8453, icon: '🔵', environment: 'mainnet' },
    { id: 'arbitrum', name: 'Arbitrum', chainId: 42161, icon: '🔵', environment: 'mainnet' },
    { id: 'optimism', name: 'Optimism', chainId: 10, icon: '🟠', environment: 'mainnet' },
    { id: 'polygon', name: 'Polygon', chainId: 137, icon: '🟣', environment: 'mainnet' },
    { id: 'solana', name: 'Solana', chainId: 792703809, icon: '🟣', environment: 'mainnet' },
  ],

  tokens: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      icon: '⟠',
      decimals: 18,
      addresses: {
        1: '0x0000000000000000000000000000000000000000',
        8453: '0x0000000000000000000000000000000000000000',
        42161: '0x0000000000000000000000000000000000000000',
        10: '0x0000000000000000000000000000000000000000',
        137: '0x0000000000000000000000000000000000000000',
      }
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      icon: '⟠',
      decimals: 18,
      addresses: {
        1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        8453: '0x4200000000000000000000000000000000000006',
        42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      }
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      icon: '🟣',
      decimals: 9,
      addresses: {
        792703809: '11111111111111111111111111111111'
      }
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      icon: '💵',
      decimals: 6,
      addresses: {
        1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        8453: '0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913',
        42161: '0xAf88d065e77C8cC2239327C5EDb3A432268e5831',
        10: '0x0B2C639c533813f4Aa9D7837cAf62653d097FF85',
        137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
      }
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      icon: '💴',
      decimals: 6,
      addresses: {
        1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        8453: '0xFDE4c96c8593536e31F229EA8F37B2adA2699bB2',
        10: '0x94B008aA00579c1307B0EF2C499aD98A8ce58E58',
        137: '0xC2132D05D31c914a87c6611C10748AEb04B58e8F',
        42161: '0xfd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9',
        792703809: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      }
    },
    {
      symbol: 'MATIC',
      name: 'Polygon',
      icon: '🟣',
      decimals: 18,
      addresses: {
        137: '0x0000000000000000000000000000000000000000'
      }
    }
  ]
};

export default MAINNET_CONFIG;

