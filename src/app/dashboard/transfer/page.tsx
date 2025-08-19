'use client';

import { useState, useEffect } from 'react';
import { ExtractedIntent, TransactionResult } from '@/app/utils/interfaces';

// Updated token data to match our API
const TOKENS = [
  { symbol: 'ETH', name: 'Ethereum', icon: '🔷', chains: ['sepolia', 'base-sepolia', 'arbitrum-sepolia', 'op-sepolia'] },
  { symbol: 'SOL', name: 'Solana', icon: '🟣', chains: ['solana-devnet', 'eclipse-testnet'] },
  { symbol: 'BTC', name: 'Bitcoin', icon: '🟡', chains: ['bitcoin-testnet4'] },
  { symbol: 'MATIC', name: 'Polygon', icon: '🟣', chains: ['polygon-amoy'] },
];

// Updated chains to match our API
const CHAINS = [
  { id: 'sepolia', name: 'Sepolia', icon: '🔷' },
  { id: 'base-sepolia', name: 'Base Sepolia', icon: '🔵' },
  { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia', icon: '🔵' },
  { id: 'op-sepolia', name: 'OP Sepolia', icon: '🟠' },
  { id: 'polygon-amoy', name: 'Polygon Amoy', icon: '🟣' },
  { id: 'solana-devnet', name: 'Solana Devnet', icon: '🟣' },
  { id: 'eclipse-testnet', name: 'Eclipse Testnet', icon: '🟢' },
  { id: 'bitcoin-testnet4', name: 'Bitcoin Testnet 4', icon: '🟡' },
];

export default function Home() {
  // Swap state
  const [sellToken, setSellToken] = useState('ETH');
  const [buyToken, setBuyToken] = useState('ETH');
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [sourceChain, setSourceChain] = useState('base-sepolia');
  const [targetChain, setTargetChain] = useState('arbitrum-sepolia');
  const [walletAddress, setWalletAddress] = useState('0xa2791e44234Dc9C96F260aD15fdD09Fe9B597FE1');
  
  // Quote and transaction state
  const [quote, setQuote] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);
  
  // AI state
  const [aiTask, setAiTask] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [extractedIntent, setExtractedIntent] = useState<ExtractedIntent | null>(null);

  // Switch tokens
  const switchTokens = () => {
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setSellAmount(buyAmount);
    setBuyAmount(sellAmount);
    setSourceChain(targetChain);
    setTargetChain(sourceChain);
  };

  // Get quote from Relay API
  const getQuote = async () => {
    if (!sellAmount || !sellToken || sourceChain === targetChain) {
      setAiResponse('Please enter an amount and select different source and target chains for bridging.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChain,
          targetChain,
          token: sellToken,
          amount: sellAmount
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get quote');
      }

      const quoteData = await response.json();
      
      if (quoteData.success && quoteData.data) {
        setQuote(quoteData.data);
        setBuyAmount(quoteData.data.to.amount);
        setAiResponse(`Got your quote! You'll receive ${quoteData.data.to.amount} ${sellToken} on ${targetChain}.`);
      } else {
        throw new Error('Invalid quote response');
      }
      
    } catch (error) {
      setAiResponse(`Sorry, I encountered an error getting your quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute transaction
  const executeTransaction = async () => {
    if (!quote) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.requestId,
          userAddress: walletAddress,
          sourceChain,
          targetChain,
          token: sellToken,
          amount: sellAmount
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute transaction');
      }

      const result = await response.json();
      
      if (result.success && result.transaction) {
        setTransactionResult(result.transaction);
        setAiResponse('Transaction executed successfully! Check the transaction details below.');
        
        // Reset form
        setSellAmount('');
        setBuyAmount('');
        setQuote(null);
      } else {
        throw new Error('Invalid transaction response');
      }
      
    } catch (error) {
      setAiResponse(`Sorry, I encountered an error executing your transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle AI intent extraction
  const handleAiIntent = async () => {
    if (!aiTask.trim()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiTask })
      });

      if (!response.ok) {
        throw new Error('Failed to extract intent');
      }

      const result = await response.json();
      
      if (result.type === 'clarify') {
        setAiResponse(result.clarifyMessage);
        return;
      }
      
      if (result.type === 'intent') {
        setExtractedIntent(result);
        
        // Auto-fill the form with extracted data
        if (result.token) {
          setSellToken(result.token);
          setBuyToken(result.token);
        }
        if (result.amount) {
          setSellAmount(result.amount.toString());
        }
        if (result.sourceChain) {
          setSourceChain(result.sourceChain.toLowerCase());
        }
        if (result.targetChain) {
          setTargetChain(result.targetChain.toLowerCase());
        }

        setAiResponse(`I extracted your intent: ${result.amount} ${result.token} from ${result.sourceChain} to ${result.targetChain}. I've filled in the form for you to review.`);
      }
      
    } catch (error) {
      setAiResponse('Sorry, I encountered an error processing your request.');
    } finally {
      setIsLoading(false);
    }
  };

  // Quick amount selection
  const setAmountPercentage = (percentage: number) => {
    const maxAmount = 1; // Mock balance, in real app this would come from wallet
    const amount = (maxAmount * percentage / 100).toFixed(6);
    setSellAmount(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 animate-pulse"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,228,255,0.15),transparent_50%)]"></div>
      
      <div className="relative z-10 max-w-6xl mx-auto pt-8 px-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-white">
          Swap Chain
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Swap Interface */}
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-6 text-white">
              Cross-Chain Swap
            </h2>
            
            {/* Source Chain & Token */}
            <div className="bg-slate-700/30 rounded-xl p-4 mb-4 border border-slate-600/30">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">You Pay</label>
                <div className="text-xs text-slate-400">
                  Balance: 1.0 {sellToken}
                </div>
              </div>
              
              {/* Chain Selection */}
              <div className="mb-3">
                <select
                  value={sourceChain}
                  onChange={(e) => setSourceChain(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  {CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.icon} {chain.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Token & Amount */}
              <div className="flex gap-3 mb-3">
                <select
                  value={sellToken}
                  onChange={(e) => setSellToken(e.target.value)}
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  {TOKENS.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.icon} {token.symbol}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400"
                />
              </div>
              
              {/* Quick Amount Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAmountPercentage(25)}
                  className="px-2 py-1 bg-slate-600/50 text-slate-300 rounded-md text-xs hover:bg-slate-600 transition-colors"
                >
                  25%
                </button>
                <button
                  onClick={() => setAmountPercentage(50)}
                  className="px-2 py-1 bg-slate-600/50 text-slate-300 rounded-md text-xs hover:bg-slate-600 transition-colors"
                >
                  50%
                </button>
                <button
                  onClick={() => setAmountPercentage(75)}
                  className="px-2 py-1 bg-slate-600/50 text-slate-300 rounded-md text-xs hover:bg-slate-600 transition-colors"
                >
                  75%
                </button>
                <button
                  onClick={() => setAmountPercentage(100)}
                  className="px-2 py-1 bg-slate-600/50 text-slate-300 rounded-md text-xs hover:bg-slate-600 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Swap Icon */}
            <div className="flex justify-center mb-4">
              <button
                onClick={switchTokens}
                className="p-2 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors border border-cyan-500/30"
              >
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Target Chain & Token */}
            <div className="bg-slate-700/30 rounded-xl p-4 mb-6 border border-slate-600/30">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">You Receive</label>
                <div className="text-xs text-slate-400">
                  Balance: 0.0 {buyToken}
                </div>
              </div>
              
              {/* Chain Selection */}
              <div className="mb-3">
                <select
                  value={targetChain}
                  onChange={(e) => setTargetChain(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  {CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.icon} {chain.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Token & Amount */}
              <div className="flex gap-3">
                <select
                  value={buyToken}
                  onChange={(e) => setBuyToken(e.target.value)}
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  {TOKENS.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.icon} {token.symbol}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={buyAmount}
                  readOnly
                  placeholder="0.0"
                  className="flex-1 bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-300"
                />
              </div>
            </div>

            {/* Quote Details */}
            {quote && (
              <div className="bg-slate-700/30 rounded-xl p-4 mb-6 border border-slate-600/30">
                <h3 className="font-semibold text-cyan-400 mb-4">Quote Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Exchange Rate:</span>
                    <span className="text-white">1 {sellToken} = {quote.rate} {buyToken}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Route:</span>
                    <span className="text-white">{quote.from.chain} → {quote.to.chain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Estimated Time:</span>
                    <span className="text-white">{quote.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gas Fee:</span>
                    <span className="text-white">${quote.fees.gas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bridge Fee:</span>
                    <span className="text-white">${quote.fees.bridge}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Cost:</span>
                    <span className="text-red-400">${quote.fees.total} ({quote.impact})</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={getQuote}
                disabled={!sellAmount || isLoading || sourceChain === targetChain}
                className="flex-1 bg-slate-700/50 text-slate-300 py-3 px-4 rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-600/50"
              >
                Get Quote
              </button>
              {quote && (
                <button
                  onClick={executeTransaction}
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? 'Processing...' : 'Approve & Swap'}
                </button>
              )}
            </div>

            {/* Transaction Result */}
            {transactionResult && (
              <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-xl">
                <h3 className="font-semibold text-green-400 mb-2">Transaction Complete!</h3>
                <div className="text-sm text-green-300 space-y-1">
                  <p>Hash: {transactionResult.txHash}</p>
                  <p>Status: {transactionResult.status}</p>
                  <a 
                    href={transactionResult.transactionLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-green-400 hover:underline"
                  >
                    View on Explorer →
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* AI Assistant */}
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-6 text-white">
              AI Assistant
            </h2>
            
            <div className="mb-6">
              <input
                type="text"
                value={aiTask}
                onChange={(e) => setAiTask(e.target.value)}
                placeholder="e.g., 'I want to swap 0.1 ETH from base-sepolia to arbitrum-sepolia'"
                className="w-full bg-slate-700/30 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400"
              />
            </div>

            {aiResponse && (
              <div className="mb-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300">{aiResponse}</p>
              </div>
            )}

            <button
              onClick={handleAiIntent}
              disabled={!aiTask.trim() || isLoading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? 'Processing...' : 'Extract Intent'}
            </button>

            {/* Wallet Address */}
            <div className="mt-6 p-4 bg-slate-700/30 rounded-lg border border-slate-600/30">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400"
                placeholder="Enter wallet address"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
