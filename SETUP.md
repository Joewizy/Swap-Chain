# Wallet Integration Setup

This app now includes full wallet integration with RainbowKit and Wagmi for seamless cross-chain swaps.

## Features Added

✅ **Wallet Connection**: Connect any Web3 wallet (MetaMask, WalletConnect, etc.)  
✅ **Quote API**: Get cross-chain swap quotes from Relay  
✅ **Client-Side Execution**: Execute swaps directly from your wallet  
✅ **Transaction Signing**: Sign transactions and messages securely  
✅ **Status Monitoring**: Real-time transaction status updates  

## Setup Instructions

### 1. Get WalletConnect Project ID

1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. Create a new project
3. Copy your Project ID

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# WalletConnect Project ID
NEXT_PUBLIC_WALLET_CONNECT_ID=your_project_id_here
```

### 3. Install Dependencies

All required dependencies are already installed:

- `@rainbow-me/rainbowkit` - Wallet connection UI
- `wagmi` - React hooks for Ethereum
- `@tanstack/react-query` - Data fetching
- `viem` - Ethereum library
- `ethers` - Ethereum utilities

### 4. Start Development Server

```bash
npm run dev
```

## How It Works

### 1. Wallet Connection
- Click "Connect Wallet" button
- Choose your preferred wallet
- Approve connection

### 2. Get Quote
- Select source and target chains
- Choose token and amount
- Click "Get Quote" to receive execution steps

### 3. Execute Swap
- Review quote details
- Click "Execute Swap" to start
- Approve transactions in your wallet
- Monitor progress

## Supported Features

### Chains
- **EVM**: Sepolia, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Polygon Amoy
- **Solana**: Solana Devnet, Eclipse Testnet
- **Bitcoin**: Bitcoin Testnet4

### Tokens
- ETH, SOL, BTC, MATIC

### Wallet Types
- MetaMask
- WalletConnect
- Coinbase Wallet
- Rainbow
- And many more...

## API Endpoints

- `POST /api/quote` - Get swap quotes with execution steps
- Client-side execution using Relay's step-based system

## Troubleshooting

### WalletConnect Error
If you see "WalletConnect not configured":
1. Set `NEXT_PUBLIC_WALLET_CONNECT_ID` in `.env.local`
2. Restart the development server

### Transaction Failures
- Ensure you have sufficient funds for gas fees
- Check that you're on the correct network
- Verify transaction parameters before signing

### Network Issues
- Make sure you're connected to supported testnets
- Check your wallet's network settings

## Development

### Adding New Chains
Update the `SUPPORTED_CHAINS` array in:
- `src/app/api/quote/route.ts`
- `src/app/components/SwapInterface.tsx`
- `src/app/rainbowKitConfig.ts`

### Adding New Tokens
Update the `SUPPORTED_TOKENS` array in:
- `src/app/api/quote/route.ts`
- `src/app/components/SwapInterface.tsx`

### Customizing UI
- Modify `src/app/components/SwapInterface.tsx` for UI changes
- Update `src/app/utils/relay-executor.ts` for execution logic
- Customize theme in `src/app/rainbowKitConfig.ts`

## Security Notes

- Never commit your WalletConnect Project ID to version control
- Always test on testnets before mainnet
- Verify transaction details before signing
- Use hardware wallets for large amounts
