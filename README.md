# Swap Chain

A minimal cross-chain bridging application with AI intent extraction and real-time quotes from Relay API.

## 🚀 Features

### **AI Assistant**
- Natural language intent extraction
- Automatic form filling
- Clarification requests for unclear inputs

### **Cross-Chain Bridge**
- Real quotes from Relay API
- 8 supported testnet chains
- 4 supported tokens
- Live fee calculations

### **Same-Chain Swap**
- Mock exchange rates
- Token switching
- Real-time calculations

## 📋 Supported Chains & Tokens

### **Chains (8 total)**
- **EVM Testnets (5):** Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy
- **Solana (2):** Solana Devnet, Eclipse Testnet
- **Bitcoin (1):** Bitcoin Testnet 4

### **Tokens (4 total)**
- **ETH** - Ethereum (EVM chains)
- **SOL** - Solana (Solana chains)
- **BTC** - Bitcoin (Bitcoin chain)
- **MATIC** - Polygon (Polygon chain)

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

## 🧪 Testing

### **Test API Endpoints**
```bash
# Test intent extraction
node test-intent.js

# Test routes API
node test-routes.js

# Test frontend integration
node test-frontend.js
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

### **Backend**
- Next.js API routes
- OpenAI integration for intent extraction
- Relay API integration for quotes
- Minimal, hardcoded chain/token mappings

### **Key Design Decisions**
- **Minimal & Manageable:** Only 8 chains, 4 tokens
- **No Complex Caching:** Simple hardcoded mappings
- **Real API Integration:** Gets actual quotes from Relay
- **Clear Error Messages:** Shows supported options

## 📈 Success Rate

- ✅ **3/3 ETH transfers** working perfectly across EVM testnets
- ✅ **Real bridge fees** and timing from Relay API
- ✅ **AI intent extraction** with clarification support
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

## 📝 License

MIT License - feel free to use this as a foundation for your own projects!
