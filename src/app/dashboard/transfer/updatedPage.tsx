'use client';

import { useState, useEffect } from 'react';
import { ExtractedIntent, TransactionResult, RelayExecutionResponse } from '@/app/utils/interfaces';
import { validateSolanaAddress } from '@/app/utils/solana';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import toast from 'react-hot-toast';
import { TESTNET_CONFIG } from '@/app/utils/relay/testnet';
import { MAINNET_CONFIG } from '@/app/utils/relay/mainnet';
import { useRelayExecutor } from '@/app/utils/relay-executor';
import { executeSwap as executeStarknetSwap, TOKEN_ADDRESSES as ST_TOKENS } from '@/app/components/AutoSwap';
import { useAccount as useStarknetAccount, useConnect as useStarknetConnect, useDisconnect as useStarknetDisconnect } from '@starknet-react/core';
import { 
  getTokenIcon, 
  getChainIcon, 
  checkTokenBalance, 
  validateTransactionBalance, 
  getGasBufferForChain 
} from '@/app/utils/utils';


export default function Home() {
  // Swap state
  const [sellToken, setSellToken] = useState('ETH');
  const [buyToken, setBuyToken] = useState('ETH');
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [environment, setEnvironment] = useState<'testnet' | 'mainnet'>('testnet');
  const [swapDomain, setSwapDomain] = useState<'evm' | 'starknet'>('evm');
  // Starknet swap state
  const [starkSellToken, setStarkSellToken] = useState<'STRK' | 'ETH' | 'USDC' | 'USDT'>('STRK');
  const [starkBuyToken, setStarkBuyToken] = useState<'STRK' | 'ETH' | 'USDC' | 'USDT'>('STRK');
  const [starkSellAmount, setStarkSellAmount] = useState('');
  const [starkBuyAmount, setStarkBuyAmount] = useState('');
  const [sourceChain, setSourceChain] = useState('base-sepolia');
  const [targetChain, setTargetChain] = useState('arbitrum-sepolia');
  const [recipient, setRecipient] = useState('');
  
  // Quote and transaction state
  const [quote, setQuote] = useState<RelayExecutionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);
  
  // AI state
  const [aiTask, setAiTask] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [extractedIntent, setExtractedIntent] = useState<ExtractedIntent | null>(null);
  const [aiSessionId, setAiSessionId] = useState<string>('default');

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { executeQuote: executeRelayQuote } = useRelayExecutor();
  const { address: starkAddress, status: starkStatus } = useStarknetAccount();

  const activeConfig = environment === 'testnet' ? TESTNET_CONFIG : MAINNET_CONFIG;
  const getChainById = (id: string | null | undefined) => activeConfig.chains.find(c => c.id === (id || ''));
  const sourceChainCfg = getChainById(sourceChain);
  const targetChainCfg = getChainById(targetChain);
  const availableChains = activeConfig.chains;
  const availableSourceTokens = activeConfig.tokens.filter(t => sourceChainCfg && t.addresses[sourceChainCfg.chainId] !== undefined);
  const availableTargetTokens = activeConfig.tokens.filter(t => targetChainCfg && t.addresses[targetChainCfg.chainId] !== undefined);

  // Explorer base URLs for tx link rendering (testnets currently used)
  const explorerBaseUrlByChainId: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
    421614: 'https://sepolia.arbiscan.io',
    11155420: 'https://sepolia-optimism.etherscan.io',
    80002: 'https://www.oklink.com/amoy',
  };

  // Execute quote function - Updated based on Relay API documentation
  async function executeQuote(
    quote: RelayExecutionResponse
  ): Promise<{ success: boolean; txHash?: string; txLink?: string; error?: string; userRejected?: boolean }> {
    try {
      const { steps } = quote;
      let lastTxHash: string | undefined;
      let lastTxLink: string | undefined;
      
      console.log('Starting quote execution with steps:', steps);
      
      for (const step of steps) {
        console.log(`Processing step: ${step.id}`);
        console.log(`Action: ${step.action}`);
        console.log(`Description: ${step.description}`);
        
        // Skip steps with no items or empty items array
        if (!step.items || step.items.length === 0) {
          console.log(`Skipping step ${step.id} - no items to process`);
          continue;
        }
        
        for (const item of step.items) {
          console.log(`Processing item with status: ${item.status}`);
          
          if (item.status === 'incomplete') {
            const { data } = item;
            
                          if (step.kind === 'transaction' && walletClient) {
                console.log('Executing transaction step');
                
                // Validate required transaction data
                if (!data.to) {
                  throw new Error('Transaction missing "to" address');
                }
                
                // Log transaction details for debugging
                console.log('Transaction details:', {
                  to: data.to,
                  value: data.value ? `${data.value} wei (${Number(data.value) / 1e18} ETH)` : '0',
                  gas: data.gas,
                  maxFeePerGas: data.maxFeePerGas,
                  maxPriorityFeePerGas: data.maxPriorityFeePerGas,
                  data: data.data
                });
                
                try {
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
                  
                  // Create explorer link
                  if (data.chainId && explorerBaseUrlByChainId[data.chainId]) {
                    lastTxLink = `${explorerBaseUrlByChainId[data.chainId]}/tx/${txHash}`;
                  }
                  
                  // Wait for transaction receipt
                  if (publicClient) {
                    try {
                      console.log('Waiting for transaction receipt...');
                      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
                      console.log('Transaction receipt confirmed');
                    } catch (error) {
                      console.warn('Failed to wait for transaction receipt:', error);
                    }
                  }
                  
                  // Monitor status if check endpoint exists
                  if (item.check) {
                    console.log('Monitoring execution status...');
                    await monitorStatus(item.check.endpoint, item.check.method);
                  }
                } catch (txError: any) {
                  console.error('Transaction error:', txError);
                  
                  // Check if user rejected the transaction
                  if (txError.code === 4001 || 
                      txError.message?.includes('User denied') ||
                      txError.message?.includes('User rejected') ||
                      txError.message?.includes('User cancelled')) {
                    console.log('User rejected the transaction');
                    return { 
                      success: false, 
                      error: 'Transaction was cancelled by user', 
                      userRejected: true 
                    };
                  }
                  
                  // Check for insufficient funds
                  if (txError.message?.includes('insufficient funds') ||
                      txError.message?.includes('exceeds balance')) {
                    throw new Error('Insufficient funds for this transaction. Please check your balance and try again.');
                  }
                  
                  // Re-throw other errors
                  throw txError;
                }
            } else if (step.kind === 'signature') {
              console.log('Signature step detected - this should be handled by the wallet');
              // Note: Signature steps are typically handled by the wallet automatically
              // If manual signature is needed, additional logic would be required here
            }
          } else {
            console.log(`Skipping item with status: ${item.status}`);
          }
        }
      }
      
      console.log('Quote execution completed successfully');
      return { success: true, txHash: lastTxHash, txLink: lastTxLink };
    } catch (err) {
      console.error('Quote execution failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Monitor status function - Updated based on Relay API documentation
  async function monitorStatus(endpoint: string, method: string = 'GET') {
    const baseUrl = environment === 'testnet' ? 'https://api.testnets.relay.link' : 'https://api.relay.link';
    let attempts = 0;
    const maxAttempts = 30; // 1 minute max (30 * 2 seconds)
    
    console.log(`Starting status monitoring for endpoint: ${endpoint}`);
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: method,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(`Status check ${attempts + 1}: ${result.status}`);
        
        // Check for expected statuses according to Relay documentation
        switch (result.status) {
          case 'waiting':
            console.log('Deposit transaction not yet indexed');
            break;
          case 'pending':
            console.log('Deposit indexed, fill is pending');
            break;
          case 'success':
            console.log('Relay completed successfully!');
            return true;
          case 'failure':
            throw new Error('Relay failed, attempting to refund');
          case 'refund':
            throw new Error('Funds were refunded due to failure');
          default:
            console.log(`Unknown status: ${result.status}`);
        }
        
        // If not success, wait before next check
        if (result.status !== 'success') {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        attempts++;
      } catch (error) {
        console.error(`Status check failed (attempt ${attempts + 1}):`, error);
        
        // If it's a failure or refund status, throw the error
        if (error instanceof Error && (error.message.includes('failure') || error.message.includes('refund'))) {
          throw error;
        }
        
        // For other errors, continue retrying
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error(`Status monitoring timed out after ${maxAttempts} attempts`);
  }

  // Persist an AI session id for follow-ups
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('aiSessionId') : null;
      if (stored) {
        setAiSessionId(stored);
      } else {
        const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
        if (typeof window !== 'undefined') localStorage.setItem('aiSessionId', id);
        setAiSessionId(id);
      }
    } catch {}
  }, []);

  // Reset defaults on environment change
  useEffect(() => {
    const cfg = activeConfig;
    const first = cfg.chains[0]?.id;
    const second = cfg.chains[1]?.id || cfg.chains[0]?.id;
    if (first) setSourceChain(first);
    if (second) setTargetChain(second);
    const eth = cfg.tokens.find(t => t.symbol === 'ETH');
    setSellToken(eth ? 'ETH' : (cfg.tokens[0]?.symbol || ''));
    setBuyToken(eth ? 'ETH' : (cfg.tokens[0]?.symbol || ''));
  }, [environment]);

  // Ensure token selections remain valid when chains change
  useEffect(() => {
    if (sourceChainCfg && !availableSourceTokens.find(t => t.symbol === sellToken)) {
      setSellToken(availableSourceTokens[0]?.symbol || sellToken);
    }
  }, [sourceChain, sourceChainCfg, sellToken, availableSourceTokens]);

  useEffect(() => {
    if (targetChainCfg && !availableTargetTokens.find(t => t.symbol === buyToken)) {
      setBuyToken(availableTargetTokens[0]?.symbol || buyToken);
    }
  }, [targetChain, targetChainCfg, buyToken, availableTargetTokens]);

  // Map model-normalized chain names to supported ids used in the UI
  const mapChainToSupported = (chain: string | undefined | null): string | null => {
    if (!chain) return null;
    const normalized = chain.toLowerCase();
    const map: Record<string, string> = {
      ethereum: environment === 'testnet' ? 'sepolia' : 'ethereum',
      mainnet: environment === 'testnet' ? 'sepolia' : 'ethereum',
      eth: environment === 'testnet' ? 'sepolia' : 'ethereum',
      base: environment === 'testnet' ? 'base-sepolia' : 'base',
      arbitrum: environment === 'testnet' ? 'arbitrum-sepolia' : 'arbitrum',
      arb: environment === 'testnet' ? 'arbitrum-sepolia' : 'arbitrum',
      optimism: environment === 'testnet' ? 'op-sepolia' : 'optimism',
      op: environment === 'testnet' ? 'op-sepolia' : 'optimism',
      polygon: environment === 'testnet' ? 'polygon-amoy' : 'polygon',
      matic: environment === 'testnet' ? 'polygon-amoy' : 'polygon',
      solana: environment === 'testnet' ? 'solana-devnet' : 'solana',
      eclipse: 'eclipse-testnet',
    };
    return map[normalized] || null;
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

    // Validate recipient for Solana target
    const isTargetSolana = targetChain === 'solana' || targetChain === 'solana-devnet' || targetChain === 'eclipse-testnet';
    if (isTargetSolana) {
      if (!recipient) {
        setAiResponse('Please enter a Solana recipient address.');
        return;
      }
      if (!validateSolanaAddress(recipient)) {
        setAiResponse('Invalid Solana address. Please check and try again.');
        return;
      }
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
          destinationToken: buyToken,
          amount: sellAmount,
          userAddress: address,
          recipient: isTargetSolana ? recipient : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get quote');
      }
      const quoteData: RelayExecutionResponse = await response.json();
      
      if (quoteData.success) {
        setQuote(quoteData);
        setBuyAmount(quoteData.quote?.details?.currencyOut?.amountFormatted || quoteData.amount);
        setAiResponse(`Got your quote! Route: ${quoteData.fromChain} → ${quoteData.toChain}.`);
      } else {
        throw new Error('Invalid quote response');
      }
      
    } catch (error) {
      setAiResponse(`Sorry, I encountered an error getting your quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute handler using custom executor (restored)
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

  // Handle AI intent extraction
  const handleAiIntent = async () => {
    if (!aiTask.trim()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiTask, sessionId: aiSessionId })
      });

      if (!response.ok) {
        throw new Error('Failed to extract intent');
      }

      const result = await response.json();
      console.log("AI result", result);
      
      if (result.type === 'clarify') {
        const suggestions = Array.isArray(result.suggestions) && result.suggestions.length
          ? ` Suggestions: ${result.suggestions.join(' | ')}`
          : '';
        setAiResponse((result.clarifyMessage || 'Please provide more details.') + suggestions);
        return;
      }

      if (result.type === 'route_suggestion') {
        const text = result.message
          || `Suggested route: ${result.suggestedRoute || 'N/A'} | Time: ${result.estimatedTime || '—'} | Fees: ${result.estimatedFees || '—'}`;
        setAiResponse(text);
        return;
      }

      if (result.type === 'partial') {
        if (result.token) setSellToken(result.token);
        if (result.amount) setSellAmount(String(result.amount));
        const src = mapChainToSupported(result.sourceChain);
        if (src) setSourceChain(src);
        const suggestions = Array.isArray(result.suggestions) && result.suggestions.length
          ? ` Suggestions: ${result.suggestions.join(' | ')}`
          : '';
        setAiResponse((result.clarifyMessage || 'I need a bit more info to proceed.') + suggestions);
        return;
      }

      if (result.type === 'intent') {
        setExtractedIntent(result);
        if (result.token) {
          setSellToken(result.token);
          setBuyToken(result.token);
        }
        if (result.amount) setSellAmount(String(result.amount));
        const mappedSource = mapChainToSupported(result.sourceChain);
        const mappedTarget = mapChainToSupported(result.targetChain);
        if (mappedSource) setSourceChain(mappedSource);
        if (mappedTarget) setTargetChain(mappedTarget);
        if (!mappedSource || !mappedTarget) {
          setAiResponse('I parsed your intent, but one or both chains are not supported on testnets here. Please choose from the dropdowns.');
          return;
        }
        setAiResponse(result.message || `I extracted your intent: ${result.amount} ${result.token} from ${result.sourceChain} to ${result.targetChain}. I've filled in the form for you to review.`);
        return;
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
      {/* Fixed wallet connect at top-right */}
      <div className="fixed top-4 right-4 z-20">
        <ConnectButton />
      </div>
      
      <div className="relative z-10 max-w-3xl mx-auto pt-6 px-4">
        {/* Global Toaster is provided in layout.tsx */}
        {/* Header */}
        <div className="flex justify-start items-center mb-6">
          <h1 className="text-3xl font-bold text-white">
            Swap Chain
          </h1>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Domain Tabs */}
          <div className="lg:col-span-2 flex items-center gap-2">
            <button
              onClick={() => setSwapDomain('evm')}
              className={`px-3 py-1 text-sm rounded-lg border ${swapDomain === 'evm' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
            >
              EVM
            </button>
            <button
              onClick={() => setSwapDomain('starknet')}
              className={`px-3 py-1 text-sm rounded-lg border ${swapDomain === 'starknet' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
            >
              Starknet
            </button>
          </div>

          {/* Swap Interface */}
          {swapDomain === 'evm' ? (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-4">
            <h2 className="text-lg font-semibold mb-4 text-white">
              Cross-Chain Swap
            </h2>
            {/* Environment Toggle */}
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs ${environment === 'testnet' ? 'text-cyan-300' : 'text-slate-400'}`}>Testnet</span>
              <button
                onClick={() => setEnvironment(prev => prev === 'testnet' ? 'mainnet' : 'testnet')}
                className="relative inline-flex h-6 w-12 items-center rounded-full bg-slate-700 border border-slate-600"
                disabled={!isConnected}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${environment === 'mainnet' ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
              <span className={`text-xs ${environment === 'mainnet' ? 'text-cyan-300' : 'text-slate-400'}`}>Mainnet</span>
            </div>
            
            
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
                  {availableChains.map((chain) => (
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
                  {availableSourceTokens.map((token) => (
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
                  {availableChains.map((chain) => (
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
                  {availableTargetTokens.map((token) => (
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

              {/* Recipient for Solana */}
              {(targetChain === 'solana' || targetChain === 'solana-devnet' || targetChain === 'eclipse-testnet') && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Recipient (Solana address)"
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400"
                  />
                </div>
              )}
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
                  <div className="flex justify-between break-all">
                    <span className="text-slate-400">Request ID:</span>
                    <span className="text-white font-mono break-all">{quote.requestId}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-slate-800/40 rounded-lg p-2">
                      <div className="text-slate-400">Gas Fees</div>
                      <div className="text-white font-medium">${Number(quote.quote?.fees?.gas?.amountUsd || 0).toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-2">
                      <div className="text-slate-400">Total Fees</div>
                      <div className="text-white font-medium">
                        ${(() => {
                          const gas = Number(quote.quote?.fees?.gas?.amountUsd || 0);
                          const relayer = Number(quote.quote?.fees?.relayerService?.amountUsd || 0);
                          return (gas + relayer).toFixed(2);
                        })()}
                      </div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-2">
                      <div className="text-slate-400">Est. Time</div>
                      <div className="text-white font-medium">{quote.quote?.details?.timeEstimate ? `${quote.quote.details.timeEstimate} min` : '—'}</div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-2">
                      <div className="text-slate-400">Steps</div>
                      <div className="text-white font-medium">{quote.steps?.length || 0}</div>
                    </div>
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
          ) : (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-4">
            <h2 className="text-lg font-semibold mb-4 text-white">Starknet Swap</h2>
            <StarknetConnectPanel />
            <div className="mt-4 text-sm text-slate-300">
              <p>Supported tokens: STRK, ETH, USDC, USDT</p>
            </div>
            {/* Starknet form */}
            <div className="mt-4 bg-slate-700/30 rounded-xl p-3 border border-slate-600/30">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">You Pay</label>
                <div className="text-xs text-slate-400">Balance: — {starkSellToken}</div>
              </div>
              <div className="flex gap-2 mb-2">
                {/* Enhanced token select with icon display */}
                <div className="flex items-center gap-1 flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2">
                  <div 
                    className={`text-base text-white iconify iconify--${getTokenIcon(starkSellToken).split(':')[0]}`}
                    data-icon={getTokenIcon(starkSellToken)}
                  ></div>
                  <select
                    value={starkSellToken}
                    onChange={(e) => setStarkSellToken(e.target.value as any)}
                    className="flex-1 bg-transparent text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {['STRK','ETH','USDC','USDT'].map((sym) => (
                      <option key={sym} value={sym}>{sym}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="number"
                  value={starkSellAmount}
                  onChange={(e) => setStarkSellAmount(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400"
                />
              </div>
            </div>

            <div className="flex justify-center my-3">
              <button
                onClick={() => {
                  const s = starkSellToken; const b = starkBuyToken;
                  const sa = starkSellAmount; const ba = starkBuyAmount;
                  setStarkSellToken(b); setStarkBuyToken(s);
                  setStarkSellAmount(ba); setStarkBuyAmount(sa);
                }}
                className="p-2 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors border border-cyan-500/30"
                disabled={starkStatus !== 'connected'}
              >
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            <div className="bg-slate-700/30 rounded-xl p-3 border border-slate-600/30">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">You Receive</label>
                <div className="text-xs text-slate-400">Balance: — {starkBuyToken}</div>
              </div>
              <div className="flex gap-2">
                {/* Enhanced token select with icon display */}
                <div className="flex items-center gap-1 flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2">
                  <div 
                    className={`text-base text-white iconify iconify--${getTokenIcon(starkBuyToken).split(':')[0]}`}
                    data-icon={getTokenIcon(starkBuyToken)}
                  ></div>
                  <select
                    value={starkBuyToken}
                    onChange={(e) => setStarkBuyToken(e.target.value as any)}
                    className="flex-1 bg-transparent text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {['STRK','ETH','USDC','USDT'].map((sym) => (
                      <option key={sym} value={sym}>{sym}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="number"
                  value={starkBuyAmount}
                  readOnly
                  placeholder="0.0"
                  className="flex-1 bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-300"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                disabled={starkStatus !== 'connected' || !starkSellAmount}
                className="flex-1 bg-slate-700/50 text-slate-300 py-2 px-3 rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-600/50 text-sm"
              >
                Get Quote
              </button>
              <button
                onClick={async () => {
                  if (starkStatus !== 'connected' || !starkSellAmount) return;
                  const tokenMap: Record<string, string> = {
                    STRK: ST_TOKENS.STRK,
                    ETH: ST_TOKENS.ETH,
                    USDC: ST_TOKENS.USDC,
                    USDT: ST_TOKENS.USDT,
                  };
                  const fromAddr = tokenMap[starkSellToken];
                  const toAddr = tokenMap[starkBuyToken];
                  if (!starkAddress) {
                    toast.error('Starknet wallet not connected');
                    return;
                  }
                  setIsLoading(true);
                  try {
                    const res = await executeStarknetSwap(fromAddr, toAddr, starkSellAmount, starkAddress);
                    if (res.success) {
                      toast.success('Starknet swap submitted' + (res.txHash ? `: ${res.txHash}` : ''));
                      setStarkSellAmount('');
                      setStarkBuyAmount('');
                    } else {
                      toast.error('Swap failed: ' + (res.error || 'Unknown error'));
                    }
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Unknown error';
                    toast.error('Swap failed: ' + msg);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={starkStatus !== 'connected'}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white py-2 px-3 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
              >
                Execute Swap
              </button>
            </div>
          </div>
          )}

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
// Minimal Starknet connect/disconnect panel
function StarknetConnectPanel() {
  const { address, status } = useStarknetAccount();
  const { connect, connectors = [], error: connectError, isPending } = useStarknetConnect() as any;
  const { disconnect } = useStarknetDisconnect();

  if (status === 'connected' && address) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-green-600/40 bg-green-900/20">
        <span className="text-green-300 text-sm">Connected: {address.slice(0, 6)}...{address.slice(-4)}</span>
        <button onClick={() => disconnect()} className="px-3 py-1 text-sm rounded-md bg-slate-700 text-slate-200 border border-slate-600">Disconnect</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-slate-300 text-sm">Connect a Starknet wallet:</p>
      <div className="flex flex-wrap gap-2">
        {Array.isArray(connectors) && connectors.length > 0 ? (
          connectors.map((c: any) => (
            <button
              key={c.id}
              onClick={() => connect({ connector: c })}
              disabled={isPending}
              className="px-3 py-1 text-sm rounded-md bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600"
            >
              {c.name}
            </button>
          ))
        ) : (
          <button
            onClick={() => {
              // fallback: try ready() connector implicitly via first available or noop
              if (Array.isArray(connectors) && connectors[0]) {
                connect({ connector: connectors[0] });
              }
            }}
            disabled={isPending}
            className="px-3 py-1 text-sm rounded-md bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600"
          >
            Connect Wallet
          </button>
        )}
      </div>
      {connectError && <p className="text-red-400 text-xs">{String((connectError as Error).message || connectError)}</p>}
    </div>
  );
}
