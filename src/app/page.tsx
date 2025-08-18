'use client';

import { useState, useEffect } from 'react';
import { ExtractedIntent, TransactionResult, RelayExecutionResponse } from '@/app/utils/interfaces';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import toast from 'react-hot-toast';

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
  { id: 'abstract-testnet',	name: 'Abstract Testnet', icon: '🔵' },
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
  
  // Quote and transaction state
  const [quote, setQuote] = useState<RelayExecutionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);
  
  // AI state
  const [aiTask, setAiTask] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [extractedIntent, setExtractedIntent] = useState<ExtractedIntent | null>(null);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const explorerBaseUrlByChainId: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
    421614: 'https://sepolia.arbiscan.io',
    11155420: 'https://sepolia-optimism.etherscan.io',
    80002: 'https://www.oklink.com/amoy',
  };

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

    if (!isConnected || !address) {
      setAiResponse('Please connect your wallet first.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChain,
          targetChain,
          token: sellToken,
          amount: sellAmount,
          userAddress: address
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get quote');
      }
      const quoteData: RelayExecutionResponse = await response.json();
      
      if (quoteData.success) {
        setQuote(quoteData);
        setBuyAmount(quoteData.amount);
        setAiResponse(`Got your quote! You'll receive ${quoteData.amount} ${sellToken} on ${targetChain}.`);
      } else {
        throw new Error('Invalid quote response');
      }
      
    } catch (error) {
      setAiResponse(`Sorry, I encountered an error getting your quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Simple execute handler that calls executeQuote and toasts a tx link
  const handleExecute = async () => {
    if (!quote || !isConnected || !address) {
      setAiResponse('Please connect your wallet and get a quote first.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await executeQuote(quote);

      if (result.success) {
        toast.success(
          <div className="flex flex-col gap-2">
            <span>Transaction confirmed!</span>
            {result.txLink && (
              <a
                href={result.txLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline text-sm flex items-center gap-1"
              >
                View transaction
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="inline-block"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>,
          { duration: 6000 }
        );

        setTransactionResult({
          txHash: 'Transaction executed successfully',
          status: 'success',
          transactionLink: result.txLink || '#',
          quoteId: quote.requestId || '',
          userAddress: address,
          sourceChain: sourceChain,
          targetChain: targetChain,
          token: sellToken,
          amount: sellAmount,
          timestamp: new Date().toISOString(),
          estimatedCompletion: (() => {
            const minutes = Number(quote.quote?.details?.timeEstimate) || 5;
            return new Date(Date.now() + minutes * 60 * 1000).toISOString();
          })()
        });
        setAiResponse('Transaction executed successfully! Check the transaction details below.');

        // Reset form
        setSellAmount('');
        setBuyAmount('');
        setQuote(null);
      } else {
        toast.error(`Failed: ${result.error || 'Unknown error'}`);
        setAiResponse(`Sorry, I encountered an error executing your transaction: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed: ${message}`);
      setAiResponse(`Sorry, I encountered an error executing your transaction: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  async function executeQuote(
    quote: RelayExecutionResponse
  ): Promise<{ success: boolean; txHash?: string; txLink?: string; error?: string }> {
    try {
      const { steps } = quote;
      let lastTxHash: string | undefined;
      let lastTxLink: string | undefined;
      // Process each step
      for (const step of steps) {
        console.log(`Processing step: ${step.id}`);
        console.log(`Action: ${step.action}`);
        
        // Process each item in the step
        for (const item of step.items) {
          if (item.status === 'incomplete') {
            const { data } = item;
            
            if (step.kind === 'transaction' && walletClient) {
              // Submit the transaction
              const txHash = await walletClient.sendTransaction({
                to: data.to as `0x${string}`,
                data: (data.data || '0x') as `0x${string}`,
                value: data.value ? BigInt(data.value) : undefined,
                gas: data.gas ? BigInt(data.gas) : undefined,
                maxFeePerGas: data.maxFeePerGas ? BigInt(data.maxFeePerGas) : undefined,
                maxPriorityFeePerGas: data.maxPriorityFeePerGas ? BigInt(data.maxPriorityFeePerGas) : undefined
              });

              console.log(`Transaction submitted: ${txHash}`);
              lastTxHash = txHash;
              const chainForTx = data.chainId;
              if (chainForTx) {
                const base = explorerBaseUrlByChainId[chainForTx];
                lastTxLink = base ? `${base}/tx/${txHash}` : undefined;
              }
              
              // Wait for receipt if possible
              if (publicClient) {
                try {
                  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
                } catch {}
              }

              // Monitor the status using the check endpoint
              if (item.check) {
                await monitorStatus(item.check.endpoint);
              }
            }
          }
        }
      }

      return { success: true, txHash: lastTxHash, txLink: lastTxLink };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Function to monitor execution status
    async function monitorStatus(endpoint: string) {
      let status = 'pending';
      
      while (status !== 'success' && status !== 'failure') {
        const response = await fetch(`https://api.testnets.relay.link${endpoint}`);
        const result = await response.json();
        status = result.status;
        
        console.log(`Status: ${status}`);
        
        if (status === 'success') {
          console.log('Execution completed successfully!');
          break;
        } else if (status === 'failure') {
          console.log('Execution failed');
          break;
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

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
      console.log("AI result", result);
      
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 animate-pulse"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,228,255,0.15),transparent_50%)]"></div>
      
      <div className="relative z-10 max-w-5xl mx-auto pt-6 px-4">
        {/* Global Toaster is provided in layout.tsx */}
        {/* Header with wallet connection */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">
            Swap Chain
          </h1>
          <ConnectButton />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Swap Interface */}
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-4">
            <h2 className="text-lg font-semibold mb-4 text-white">
              Cross-Chain Swap
            </h2>
            
            {/* Source Chain & Token */}
            <div className="bg-slate-700/30 rounded-xl p-3 mb-3 border border-slate-600/30">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">You Pay</label>
                <div className="text-xs text-slate-400">
                  Balance: 1.0 {sellToken}
                </div>
              </div>
              
              {/* Chain Selection */}
              <div className="mb-2">
                <select
                  value={sourceChain}
                  onChange={(e) => setSourceChain(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={!isConnected}
                >
                  {CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.icon} {chain.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Token & Amount */}
              <div className="flex gap-2 mb-2">
                <select
                  value={sellToken}
                  onChange={(e) => setSellToken(e.target.value)}
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={!isConnected}
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
                  disabled={!isConnected}
                />
              </div>
            </div>
            
            {/* Swap Icon */}
            <div className="flex justify-center mb-3">
              <button
                onClick={switchTokens}
                className="p-2 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors border border-cyan-500/30"
                disabled={!isConnected}
              >
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Target Chain & Token */}
            <div className="bg-slate-700/30 rounded-xl p-3 mb-4 border border-slate-600/30">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">You Receive</label>
                <div className="text-xs text-slate-400">
                  Balance: 0.0 {buyToken}
                </div>
              </div>
              
              {/* Chain Selection */}
              <div className="mb-2">
                <select
                  value={targetChain}
                  onChange={(e) => setTargetChain(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={!isConnected}
                >
                  {CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.icon} {chain.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Token & Amount */}
              <div className="flex gap-2">
                <select
                  value={buyToken}
                  onChange={(e) => setBuyToken(e.target.value)}
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={!isConnected}
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
              <div className="bg-slate-700/30 rounded-xl p-3 mb-4 border border-slate-600/30">
                <h3 className="font-semibold text-cyan-400 mb-3 text-sm">Quote Details</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Route:</span>
                    <span className="text-white">{quote.fromChain} → {quote.toChain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Request ID:</span>
                    <span className="text-white font-mono">{quote.requestId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Steps:</span>
                    <span className="text-white">{quote.steps?.length || 0} steps</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={getQuote}
                disabled={!sellAmount || isLoading || sourceChain === targetChain || !isConnected}
                className="flex-1 bg-slate-700/50 text-slate-300 py-2 px-3 rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-600/50 text-sm"
              >
                Get Quote
              </button>
              {quote && (
                <button
                  onClick={handleExecute}
                  disabled={isLoading || !isConnected}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white py-2 px-3 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {isLoading ? 'Processing...' : 'Execute Swap'}
                </button>
              )}
            </div>

            {/* Transaction Result */}
            {transactionResult && (
              <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-xl">
                <h3 className="font-semibold text-green-400 mb-2 text-sm">Transaction Complete!</h3>
                <div className="text-xs text-green-300 space-y-1">
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
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-4">
            <h2 className="text-lg font-semibold mb-4 text-white">
              AI Assistant
            </h2>
            
            <div className="mb-4">
              <input
                type="text"
                value={aiTask}
                onChange={(e) => setAiTask(e.target.value)}
                placeholder="e.g., 'I want to swap 0.1 ETH from base-sepolia to arbitrum-sepolia'"
                className="w-full bg-slate-700/30 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400"
              />
            </div>

            {aiResponse && (
              <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300">{aiResponse}</p>
              </div>
            )}

            <button
              onClick={handleAiIntent}
              disabled={!aiTask.trim() || isLoading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white py-2 px-3 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {isLoading ? 'Processing...' : 'Extract Intent'}
            </button>

            {/* Wallet Status */}
            {!isConnected ? (
              <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-300">Please connect your wallet to start swapping</p>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-300">Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
