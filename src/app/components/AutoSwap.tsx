import { AutoSwappr, TOKEN_ADDRESSES } from 'autoswap-sdk';

// Initialize the SDK
const autoswappr = new AutoSwappr({
  contractAddress: '0x5b08cbdaa6a2338e69fad7c62ce20204f1666fece27288837163c19320b9496',
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