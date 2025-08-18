# Relay Cross-Chain Swap Integration

This project integrates with Relay's cross-chain swap API to enable seamless token transfers between different blockchains.

## Overview

The integration follows Relay's new API structure where:
1. **Quote API** (`/api/quote`) - Gets swap quotes and returns execution steps
2. **Client-side Execution** - Executes the steps using the user's wallet

## API Endpoints

### GET Quote
```
POST /api/quote
Content-Type: application/json

{
  "sourceChain": "base-sepolia",
  "targetChain": "sepolia", 
  "token": "ETH",
  "amount": "0.001",
  "userAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "...",
  "amount": "0.001",
  "token": "ETH",
  "fromChain": "base-sepolia",
  "toChain": "sepolia",
  "status": "pending",
  "steps": [...], // Execution steps for client-side processing
  "quote": {...}  // Full quote data from Relay
}
```

## Client-Side Execution

The `RelayExecutor` class handles the execution of quote steps:

### Supported Step Types

1. **Transaction Steps** (`kind: "transaction"`)
   - Submit transactions to the blockchain
   - Poll for completion status

2. **Signature Steps** (`kind: "signature"`)
   - Sign messages with user's wallet
   - Submit signatures to Relay API

### Usage Example

```typescript
import { RelayExecutor } from './utils/relay-executor';

// Initialize with your wallet client
const executor = new RelayExecutor(walletClient);

// Execute quote steps
const result = await executor.executeSteps(quoteResponse);

if (result.success) {
  console.log('Swap executed successfully!');
} else {
  console.error('Execution failed:', result.error);
}
```

### React Hook Usage

```typescript
import { useRelayExecutor } from './utils/relay-executor';

function MyComponent() {
  const { executeQuote } = useRelayExecutor(walletClient);
  
  const handleSwap = async () => {
    const result = await executeQuote(quoteResponse);
    // Handle result
  };
}
```

## Supported Chains

- **EVM Chains**: Sepolia, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Polygon Amoy
- **Solana**: Solana Devnet, Eclipse Testnet  
- **Bitcoin**: Bitcoin Testnet4

## Supported Tokens

- ETH, SOL, BTC, MATIC

## Implementation Details

### Step Execution Flow

1. **Get Quote**: Call `/api/quote` with swap parameters
2. **Process Steps**: For each step in the response:
   - **Transaction Step**: Submit transaction data to blockchain
   - **Signature Step**: Sign message and submit to Relay
3. **Poll Status**: Monitor completion using step check endpoints
4. **Complete**: All steps must complete successfully

### Error Handling

- Network errors during transaction submission
- Signature failures
- Timeout errors during polling
- Invalid quote responses

### Wallet Integration

The executor is designed to work with various wallet clients:
- **Ethers.js**: BrowserProvider integration
- **Wagmi**: writeContract and signMessage hooks
- **Web3Modal**: Generic wallet client support

## Testing

Use the provided `SwapInterface` component to test the integration:

1. Fill in swap parameters
2. Click "Get Quote" to receive execution steps
3. Click "Execute Swap" to process the steps
4. Monitor status updates

## Security Considerations

- Always validate quote responses before execution
- Implement proper error handling for failed transactions
- Use appropriate gas limits and transaction parameters
- Verify user wallet connection before execution

## Troubleshooting

### Common Issues

1. **Quote API Errors**: Check chain/token support and parameters
2. **Transaction Failures**: Verify wallet has sufficient funds and gas
3. **Signature Errors**: Ensure wallet supports message signing
4. **Timeout Errors**: Increase polling intervals or retry logic

### Debug Mode

Enable detailed logging by setting:
```typescript
console.log('Quote response:', quoteResponse);
console.log('Execution steps:', steps);
```

## Resources

- [Relay API Documentation](https://docs.relay.link/)
- [Step Execution Guide](https://docs.relay.link/step-execution-guide)
- [Bridging Guide](https://docs.relay.link/bridging-guide)
