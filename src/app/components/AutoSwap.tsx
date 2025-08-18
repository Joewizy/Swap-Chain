import { AutoSwappr, TOKEN_ADDRESSES } from 'autoswap-sdk';

// Initialize the SDK
const autoswappr = new AutoSwappr({
  contractAddress: 'AUTOSWAPPR_CONTRACT_ADDRESS',
  rpcUrl: 'https://starknet-mainnet.public.blastapi.io',
  accountAddress: 'YOUR_ACCOUNT_ADDRESS',
  privateKey: 'YOUR_PRIVATE_KEY',
});

// Execute swap
const result = await autoswappr.executeSwap(
  TOKEN_ADDRESSES.STRK,
  TOKEN_ADDRESSES.USDC,
  {
    amount: '1000000000000000000', // 1 STRK
    isToken1: false,
  }
);

console.log('Swap result:', result);