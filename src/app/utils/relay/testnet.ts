import { RelayConfig } from './types';

export const TESTNET_CONFIG: RelayConfig = {
  apiEndpoint: 'https://api.testnets.relay.link',
  chains: [
    { id: 'sepolia', name: 'Sepolia', chainId: 11155111, icon: '🔷', environment: 'testnet' },
    { id: 'base-sepolia', name: 'Base Sepolia', chainId: 84532, icon: '🔵', environment: 'testnet' },
    { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia', chainId: 421614, icon: '🔵', environment: 'testnet' },
    { id: 'op-sepolia', name: 'OP Sepolia', chainId: 11155420, icon: '🟠', environment: 'testnet' },
    { id: 'polygon-amoy', name: 'Polygon Amoy', chainId: 80002, icon: '🟣', environment: 'testnet' },
    { id: 'solana-devnet', name: 'Solana Devnet', chainId: 1936682084, icon: '🟣', environment: 'testnet' },
    { id: 'eclipse-testnet', name: 'Eclipse Testnet', chainId: 1118190, icon: '🟢', environment: 'testnet' },
  ],
  
  tokens: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      icon: '⟠',
      decimals: 18,
      addresses: {
        11155111: '0x0000000000000000000000000000000000000000',
        84532: '0x0000000000000000000000000000000000000000',
        421614: '0x0000000000000000000000000000000000000000',
        11155420: '0x0000000000000000000000000000000000000000',
        80002: '0x0000000000000000000000000000000000000000',
      }
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      icon: '⟠',
      decimals: 18,
      addresses: {
        11155111: '0xFFf9976782d46Cc05630d1f6EbAb18B2324d6B14',
        84532: '0x4200000000000000000000000000000000000006',
      }
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      icon: '🟣',
      decimals: 9,
      addresses: {
        1936682084: '11111111111111111111111111111111',
        1118190: '11111111111111111111111111111111',
      }
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      icon: '💵',
      decimals: 6,
      addresses: {
        11155111: '0x1C7D4b196cb0C7b01D743fBc6116a902379c7238',
        84532: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
        421614: '0xAf88d065e77C8cC2239327C5EDb3A432268e5831',
        11155420: '0x0B2C639c533813f4Aa9D7837cAf62653d097FF85',
        80002: '0x0000000000000000000000000000000000000000',
        1936682084: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        1118190: '11111111111111111111111111111111'
      }
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      icon: '💴',
      decimals: 6,
      addresses: {
        1936682084: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        1118190: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      }
    },
    {
      symbol: 'WSOL',
      name: 'Wrapped SOL',
      icon: '🟣',
      decimals: 9,
      addresses: {
        1936682084: 'So11111111111111111111111111111111111111112',
        1118190: 'So11111111111111111111111111111111111111112',
      }
    },
    {
      symbol: 'MATIC',
      name: 'Polygon',
      icon: '🟣',
      decimals: 18,
      addresses: {
        80002: '0x0000000000000000000000000000000000000000'
      }
    }
  ]
};

export default TESTNET_CONFIG;

