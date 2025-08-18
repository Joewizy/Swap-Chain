export interface ChainConfig {
  id: string;
  name: string;
  chainId: number;
  icon: string;
  environment: 'mainnet' | 'testnet';
}

export interface TokenConfig {
  symbol: string;
  name: string;
  icon: string;
  addresses: Record<number, string>;
  decimals: number;
}

export interface RelayConfig {
  chains: ChainConfig[];
  tokens: TokenConfig[];
  apiEndpoint: string;
}

