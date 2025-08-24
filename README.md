# Swap Chain

A comprehensive cross-chain bridging application with AI intent extraction, real-time quotes from Relay API, and Starknet integration for seamless token swaps.

## 🚀 Features

### **AI Assistant**
- Natural language intent extraction
- Automatic form filling
- Clarification requests for unclear inputs
- Smart chain mapping and validation

### **Cross-Chain Bridge**
- Real quotes from Relay API
- 9 supported chains (including Starknet)
- Multiple supported tokens
- Live fee calculations
- Transaction monitoring

### **Starknet Integration**
- Direct token swaps on Starknet
- AutoSwappr SDK integration
- Ekubo DEX support
- Account balance validation
- Transaction status tracking

### **Same-Chain Swap**
- Mock exchange rates
- Token switching
- Real-time calculations

## 📋 Supported Chains & Tokens

### **Chains (9 total)**
- **EVM Testnets (5):** Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy
- **Solana (2):** Solana Devnet, Eclipse Testnet
- **Bitcoin (1):** Bitcoin Testnet 4
- **Starknet (1):** Starknet Mainnet

### **Tokens (4 total)**
- **ETH** - Ethereum (EVM chains + Starknet)
- **SOL** - Solana (Solana chains)
- **BTC** - Bitcoin (Bitcoin chain)
- **USDC** - USD Coin (Starknet)

## 🛠️ API Endpoints

### **Intent API** (`/api/intent`)
```bash
POST /api/intent
{
  "message": "I want to swap 0.1 ETH from sepolia to base-sepolia"
}
```

### **Routes API** (`/api/routes`)
```bash
POST /api/routes
{
  "sourceChain": "sepolia",
  "targetChain": "base-sepolia", 
  "token": "ETH",
  "amount": "0.1"
}
```

### **Execute API** (`/api/execute`)
```bash
POST /api/execute
{
  "quoteId": "0x...",
  "userAddress": "0x...",
  "sourceChain": "sepolia",
  "targetChain": "base-sepolia",
  "token": "ETH",
  "amount": "0.1"
}
```

### **Starknet Swap API** (`/api/starknet-swap`)
```bash
POST /api/starknet-swap
{
  "fromToken": "ETH",
  "toToken": "USDC",
  "amount": "0.001",
  "accountAddress": "0x..."
}
```

## 🧪 Testing

### **Test API Endpoints**
```bash
# Test intent extraction
node test-intent.js

# Test routes API
node test-routes.js

# Test frontend integration
node test-frontend.js

# Test Starknet swap
curl -X POST http://localhost:3000/api/starknet-swap \
  -H "Content-Type: application/json" \
  -d '{"fromToken": "ETH", "toToken": "USDC", "amount": "0.001", "accountAddress": "0x..."}'
```

### **Manual Testing**
```bash
# Start development server
npm run dev

# Test with curl
curl -X POST http://localhost:3000/api/intent \
  -H "Content-Type: application/json" \
  -d '{"message": "I want to swap 0.1 ETH from sepolia to base-sepolia"}'
```

## 🏗️ Architecture

### **Frontend**
- React with TypeScript
- Tailwind CSS for styling
- Real-time form updates
- Error handling and loading states
- RainbowKit for wallet connection
- Starknet provider integration

### **Backend**
- Next.js API routes
- OpenAI integration for intent extraction
- Relay API integration for quotes
- AutoSwappr SDK for Starknet swaps
- Balance validation and error handling

### **Key Design Decisions**
- **Minimal & Manageable:** Focused on core functionality
- **Real API Integration:** Gets actual quotes from Relay and Starknet
- **Security First:** Private keys handled server-side
- **Clear Error Messages:** Comprehensive error handling
- **Multi-Chain Support:** Seamless cross-chain and same-chain swaps

## 📈 Success Rate

- ✅ **Cross-chain transfers** working perfectly across EVM testnets
- ✅ **Starknet swaps** with AutoSwappr SDK
- ✅ **Real bridge fees** and timing from Relay API
- ✅ **AI intent extraction** with clarification support
- ✅ **Balance validation** and error handling
- ✅ **Clean, maintainable code** structure

## 🎯 Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   # Create .env.local
   OPEN_API_KEY=your_openai_api_key_here
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open browser**
   ```
   http://localhost:3000
   ```

## 🔧 Development

### **Adding New Chains**
1. Update `SUPPORTED_CHAINS` in `/api/routes/route.ts`
2. Add chain to `CHAINS` array in `/app/page.tsx`
3. Update token address mapping in `getNativeTokenAddress()`

### **Adding New Tokens**
1. Update `SUPPORTED_TOKENS` in `/api/routes/route.ts`
2. Add token to `TOKENS` array in `/app/page.tsx`
3. Update decimals mapping in `getTokenDecimals()`

### **Starknet Configuration**
1. Update `TOKEN_ADDRESSES` in `AutoSwap.tsx`
2. Configure RPC endpoints in API routes
3. Set up private keys in environment variables

## 🔐 Security

- **Private Keys:** Handled server-side only
- **Environment Variables:** Sensitive data stored securely
- **Error Handling:** No sensitive information exposed in errors
- **Validation:** Input validation on all API endpoints

### **Environment Setup**
```bash
# Required environment variables
OPEN_API_KEY=your_openai_api_key
```

## 📝 License

MIT License - feel free to use this as a foundation for your own projects!
