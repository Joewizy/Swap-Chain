'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAccount, useDisconnect, useWalletClient, usePublicClient } from 'wagmi';
import { useRouter } from 'next/navigation';
import { TESTNET_CONFIG } from '@/app/utils/relay/testnet';
import { MAINNET_CONFIG } from '@/app/utils/relay/mainnet';
import toast from 'react-hot-toast';
import { executeSwap, TOKEN_ADDRESSES } from '@/app/components/AutoSwap';
import { useAccount as useStarknetAccount, useConnect as useStarknetConnect, useDisconnect as useStarknetDisconnect } from '@starknet-react/core';
import { 
  getTokenIcon, 
  getChainIcon, 
  checkTokenBalance, 
  validateTransactionBalance, 
  getGasBufferForChain 
} from '@/app/utils/utils';
import { RelayExecutionResponse } from '@/app/utils/interfaces';


export default function Transfer() {
  const [swapDomain, setSwapDomain] = useState<'evm' | 'starknet'>('evm');
  const [disconnectBtn, setDisconnectBtn] = useState(false);
  const [environment, setEnvironment] = useState<'testnet' | 'mainnet'>('testnet');

  // Quote state
  const [sellToken, setSellToken] = useState('USDT');
  const [buyToken, setBuyToken] = useState('ETH');
  const [sourceChain, setSourceChain] = useState('base-sepolia');
  const [targetChain, setTargetChain] = useState('arbitrum-sepolia');
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  // Starknet state
  const [starkSellToken, setStarkSellToken] = useState<'STRK' | 'ETH' | 'USDC' | 'USDT'>('STRK');
  const [starkBuyToken, setStarkBuyToken] = useState<'STRK' | 'ETH' | 'USDC' | 'USDT'>('STRK');
  const [starkSellAmount, setStarkSellAmount] = useState('');
  const [starkBuyAmount, setStarkBuyAmount] = useState('');

  // AI state
  const [aiTask, setAiTask] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [extractedIntent, setExtractedIntent] = useState<any>(null);
  
  // Transaction result state
  const [transactionResult, setTransactionResult] = useState<any>(null);

  const router = useRouter();
  const { address, status, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  
  // Starknet wallet hooks
  const { address: starkAddress, status: starkStatus } = useStarknetAccount();
  const { connect: connectStarknet, connectors: starkConnectors = [], error: starkConnectError, isPending: starkIsPending } = useStarknetConnect() as any;
  const { disconnect: disconnectStarknet } = useStarknetDisconnect();

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Configuration based on environment
  const activeConfig = environment === 'testnet' ? TESTNET_CONFIG : MAINNET_CONFIG;
  const getChainById = (id: string | null | undefined) => activeConfig.chains.find(c => c.id === (id || ''));
  const sourceChainCfg = getChainById(sourceChain);
  const targetChainCfg = getChainById(targetChain);
  const availableChains = activeConfig.chains;
  const availableSourceTokens = activeConfig.tokens.filter(t => sourceChainCfg && t.addresses[sourceChainCfg.chainId] !== undefined);
  const availableTargetTokens = activeConfig.tokens.filter(t => targetChainCfg && t.addresses[targetChainCfg.chainId] !== undefined);

  // Explorer base URLs for tx link rendering (both testnet and mainnet)
  const explorerBaseUrlByChainId: Record<number, string> = {
    // Testnet explorers
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
    421614: 'https://sepolia.arbiscan.io',
    11155420: 'https://sepolia-optimism.etherscan.io',
    80002: 'https://www.oklink.com/amoy',
    // Mainnet explorers
    1: 'https://etherscan.io',
    8453: 'https://basescan.org',
    42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io',
    137: 'https://polygonscan.com',
  };

  // Click outside to close disconnect dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setDisconnectBtn(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);

  // Redirect if disconnected
  useEffect(() => {
    if (status === 'disconnected') {
      router.push('/');
    }
  }, [status, router]);

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
    // Reset amounts when environment changes
    setSellAmount('');
    setBuyAmount('');
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

  // Switch tokens function
  const switchTokens = () => {
    if (swapDomain === 'evm') {
      setSellToken(buyToken);
      setBuyToken(sellToken);
      setSellAmount(buyAmount || sellAmount);
      setBuyAmount(sellAmount);
      setSourceChain(targetChain);
      setTargetChain(sourceChain);
    } else {
      setStarkSellToken(starkBuyToken);
      setStarkBuyToken(starkSellToken);
      setStarkSellAmount(starkBuyAmount);
      setStarkBuyAmount(starkSellAmount);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '') {
      setSellAmount('');
      return;
    }
    // Allow any valid number format (including decimals)
    if (/^\d*\.?\d*$/.test(v)) {
      setSellAmount(v);
    }
  };

  const handleBlur = () => {
    if (sellAmount === '' || Number.isNaN(Number(sellAmount))) {
      setSellAmount('');
    } else {
      const num = Math.max(0, parseFloat(sellAmount));
      setSellAmount(num.toString());
    }
  };

  // Extract quote from API(Relay)
  const getQuote = async () => {
    if (!sellAmount || !sellToken || sourceChain === targetChain) {
      setQuoteError(
        'Please enter an amount and select different source and target chains for bridging.'
      );
      return;
    }

    if (!isConnected || !address) {
      setQuoteError('Please connect your wallet first.');
      return;
    }

    // Validate recipient for Solana target
    const isTargetSolana = targetChain === 'solana' || targetChain === 'solana-devnet' || targetChain === 'eclipse-testnet';
    if (isTargetSolana) {
      if (!recipient) {
        setQuoteError('Please enter a Solana recipient address.');
        return;
      }
    }

    setIsLoading(true);
    setQuoteError('');

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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get quote');
      }

      const quoteData = await response.json();
      console.log('Quote data received:', quoteData);

      if (quoteData.success) {
        setQuote(quoteData);
        setBuyAmount(quoteData.quote?.details?.currencyOut?.amountFormatted || quoteData.amount);
        setQuoteError('');
        setAiResponse(`Got your quote! Route: ${quoteData.fromChain} → ${quoteData.toChain}.`);
      } else {
        throw new Error('Invalid quote response');
      }
    } catch (error) {
      setQuoteError(
        `Error getting quote: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      setQuote(null);
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
      for (const step of steps) {
        console.log(`Processing step: ${step.id}`);
        console.log(`Action: ${step.action}`);
        for (const item of step.items) {
          if (item.status === 'incomplete') {
            const { data } = item;
            if (step.kind === 'transaction' && walletClient) {
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
              if (publicClient) {
                try {
                  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
                } catch {}
              }
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

  // Monitor status function 
  async function monitorStatus(endpoint: string) {
    const baseUrl = environment === 'testnet' ? 'https://api.testnets.relay.link' : 'https://api.relay.link';
    let status = 'pending';
    while (status !== 'success' && status !== 'failure') {
      const response = await fetch(`${baseUrl}${endpoint}`);
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
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Check if wallet is on correct network
  const isOnCorrectNetwork = () => {
    if (!chain) return false;
    const targetChainId = sourceChainCfg?.chainId;
    return chain.id === targetChainId;
  };

  // Execute handler - Updated with better error handling
  const handleExecute = async () => {
    if (!quote || !isConnected || !address) {
      setAiResponse('Please connect your wallet and get a quote first.');
      return;
    }

    // Check if wallet is on the correct network
    if (!isOnCorrectNetwork()) {
      setAiResponse(`Please switch your wallet to ${sourceChainCfg?.name || 'the correct network'} before executing. Current network: ${chain?.name || 'Unknown'}`);
      return;
    }

    setIsLoading(true);

    try {
      console.log('Starting execution with quote:', quote);
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
        const errorMessage = result.error || 'Unknown error';
        console.error('Execution failed:', errorMessage);
        toast.error(`Execution failed: ${errorMessage}`);
        setAiResponse(`Sorry, I encountered an error executing your transaction: ${errorMessage}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Execution error:', error);
      toast.error(`Execution failed: ${message}`);
      setAiResponse(`Sorry, I encountered an error executing your transaction: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Starknet execution handler
  const handleStarknetExecute = async () => {
    if (!starkSellAmount || starkStatus !== 'connected' || !starkAddress) {
      setAiResponse('Please connect your Starknet wallet and enter an amount first.');
      return;
    }

    setIsLoading(true);

    try {
      // Use imported TOKEN_ADDRESSES instead of hardcoded values
      const tokenMap: Record<string, string> = {
        STRK: TOKEN_ADDRESSES.STRK,
        ETH: TOKEN_ADDRESSES.ETH,
        USDC: TOKEN_ADDRESSES.USDC,
        USDT: TOKEN_ADDRESSES.USDT,
      };

      const fromAddr = tokenMap[starkSellToken];
      const toAddr = tokenMap[starkBuyToken];

      console.log('Starknet swap attempt:', {
        fromToken: starkSellToken,
        toToken: starkBuyToken,
        fromAddr,
        toAddr,
        amount: starkSellAmount,
        accountAddress: starkAddress
      });

      if (!fromAddr || !toAddr) {
        throw new Error('Invalid token selection');
      }

      if (!starkAddress) {
        throw new Error('Starknet wallet not connected');
      }

      // Call the actual executeSwap function with the connected wallet address
      const result = await executeSwap(starkSellToken, starkBuyToken, starkSellAmount, starkAddress);
      
      if (result.success) {
        // Create Starknet explorer link
        const txHash = result.txHash;
        const explorerLink = txHash ? `https://starkscan.co/tx/${txHash}` : null;
        
        toast.success(
          <div className="flex flex-col gap-2">
            <span>Starknet swap submitted successfully!</span>
            {explorerLink && (
              <a
                href={explorerLink}
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
        
        setAiResponse('Starknet transaction executed successfully!');
        
        // Reset form
        setStarkSellAmount('');
        setStarkBuyAmount('');
      } else {
        throw new Error(result.error || 'Swap failed');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Starknet execution error:', error);
      toast.error(`Starknet swap failed: ${message}`);
      setAiResponse(`Sorry, I encountered an error with your Starknet transaction: ${message}`);
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
        body: JSON.stringify({ message: aiTask }),
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
          const mappedSource = mapChainToSupported(result.sourceChain);
          if (mappedSource) {
            setSourceChain(mappedSource);
          } else {
            setAiResponse(`I parsed your intent, but the source chain "${result.sourceChain}" is not supported. Please choose from the available chains.`);
            return;
          }
        }
        if (result.targetChain) {
          const mappedTarget = mapChainToSupported(result.targetChain);
          if (mappedTarget) {
            setTargetChain(mappedTarget);
          } else {
            setAiResponse(`I parsed your intent, but the target chain "${result.targetChain}" is not supported. Please choose from the available chains.`);
            return;
          }
        }

        setAiResponse(
          `I extracted your intent: ${result.amount} ${result.token} from ${result.sourceChain} to ${result.targetChain}. I've filled in the form for you to review.`
        );

        // Clear the input after processing
        setAiTask('');
      }
    } catch (error) {
      setAiResponse('Sorry, I encountered an error processing your request.');
    } finally {
      setIsLoading(false);
    }
  };

  const shorten = (addr?: string) =>
    addr ? `${addr.slice(0, 6)}....${addr.slice(-4)}` : '';

  return (
    <div className='relative ml-auto'>
      {/* Header */}
      <div className='flex justify-between items-center mx-10 mt-4'>
        <h1 className='text-2xl font-semibold'>Transfer Page</h1>
        <div ref={wrapperRef} className='relative'>
          <div
            onClick={() => setDisconnectBtn(!disconnectBtn)}
            className='flex items-center gap-2 text-sm cursor-pointer'>
            <div
              className='text-2xl cursor-pointer iconify iconify--lucide'
              data-icon='lucide:circle-user-round'
            />
            {isConnected && address ? shorten(address) : 
             starkStatus === 'connected' && starkAddress ? shorten(starkAddress) : 'Not Connected'}
            <div
              className='text-xl cursor-pointer iconify iconify--ep'
              data-icon='ep:arrow-down'
            />
          </div>
          {disconnectBtn && (
            <div className='absolute top-10 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 min-w-[280px] z-50 backdrop-blur-sm'>
              {/* Header */}
              <div className='flex items-center justify-between mb-4 pb-3 border-b border-gray-100'>
                <h3 className='text-sm font-semibold text-gray-800'>Connected Wallets</h3>
                <button 
                  onClick={() => setDisconnectBtn(false)}
                  className='text-gray-400 hover:text-gray-600 transition-colors'
                >
                  <div className="text-lg iconify iconify--material-symbols" data-icon="material-symbols:close"></div>
                </button>
              </div>

              {/* EVM Wallet Section */}
              <div className='mb-4'>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center'>
                    <div className="text-white text-sm iconify iconify--cryptocurrency" data-icon="cryptocurrency:eth"></div>
                  </div>
                  <span className='text-sm font-medium text-gray-700'>EVM Wallet</span>
                </div>
                
                {isConnected && address ? (
                  <div className='bg-gray-50 rounded-xl p-3 border border-gray-100'>
                    <div className='flex items-center justify-between mb-2'>
                      <div className='flex items-center gap-2'>
                        <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                        <span className='text-xs font-medium text-gray-800'>Connected</span>
                      </div>
            <button
              onClick={() => {
                disconnect();
                setDisconnectBtn(false);
              }}
                        className='text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1 rounded-full transition-colors font-medium'>
                        Disconnect
                      </button>
                    </div>
                    <div className='text-xs text-gray-600 font-mono bg-white px-2 py-1 rounded border'>
                      {shorten(address)}
                    </div>
                  </div>
                ) : (
                  <div className='bg-gray-50 rounded-xl p-3 border border-gray-100'>
                    <div className='flex items-center gap-2 mb-2'>
                      <div className='w-2 h-2 bg-gray-400 rounded-full'></div>
                      <span className='text-xs text-gray-500'>Not connected</span>
                    </div>
                    <span className='text-xs text-gray-400'>Connect an EVM wallet to get started</span>
                  </div>
                )}
              </div>
              
              {/* Divider */}
              <div className='border-t border-gray-100 my-4'></div>

              {/* Starknet Wallet Section */}
              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center'>
                    <div className="text-white text-sm iconify iconify--simple-icons" data-icon="simple-icons:starknet"></div>
                  </div>
                  <span className='text-sm font-medium text-gray-700'>Starknet Wallet</span>
                </div>
                
                {starkStatus === 'connected' && starkAddress ? (
                  <div className='bg-gray-50 rounded-xl p-3 border border-gray-100'>
                    <div className='flex items-center justify-between mb-2'>
                      <div className='flex items-center gap-2'>
                        <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                        <span className='text-xs font-medium text-gray-800'>Connected</span>
                      </div>
                      <button
                        onClick={() => {
                          disconnectStarknet();
                          setDisconnectBtn(false);
                        }}
                        className='text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1 rounded-full transition-colors font-medium'>
                        Disconnect
                      </button>
                    </div>
                    <div className='text-xs text-gray-600 font-mono bg-white px-2 py-1 rounded border'>
                      {shorten(starkAddress)}
                    </div>
                  </div>
                ) : (
                  <div className='bg-gray-50 rounded-xl p-3 border border-gray-100'>
                    <div className='flex items-center gap-2 mb-3'>
                      <div className='w-2 h-2 bg-gray-400 rounded-full'></div>
                      <span className='text-xs text-gray-500'>Not connected</span>
                    </div>
                    
                    {/* Starknet Connection Options */}
                    <div className='space-y-2'>
                      {Array.isArray(starkConnectors) && starkConnectors.length > 0 ? (
                        starkConnectors.map((connector: any) => (
                          <button
                            key={connector.id}
                            onClick={() => {
                              connectStarknet({ connector });
                              setDisconnectBtn(false);
                            }}
                            disabled={starkIsPending}
                            className='w-full flex items-center gap-2 text-left text-xs bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
                            <div className="text-sm text-gray-600 iconify iconify--material-symbols" data-icon="material-symbols:account-balance-wallet"></div>
                            <span className='font-medium text-gray-700'>Connect {connector.name}</span>
                          </button>
                        ))
                      ) : (
                        <button
                          onClick={() => {
                            if (Array.isArray(starkConnectors) && starkConnectors[0]) {
                              connectStarknet({ connector: starkConnectors[0] });
                            }
                            setDisconnectBtn(false);
                          }}
                          disabled={starkIsPending}
                          className='w-full flex items-center gap-2 text-left text-xs bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
                          <div className="text-sm text-gray-600 iconify iconify--material-symbols" data-icon="material-symbols:account-balance-wallet"></div>
                          <span className='font-medium text-gray-700'>Connect Argent</span>
            </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Error Display */}
              {starkConnectError && (
                <div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <div className='flex items-center gap-2'>
                    <div className="text-red-500 text-sm iconify iconify--material-symbols" data-icon="material-symbols:error"></div>
                    <span className='text-xs text-red-700 font-medium'>Connection Error</span>
                  </div>
                  <p className='text-xs text-red-600 mt-1'>
                    {String((starkConnectError as Error).message || starkConnectError)}
                  </p>
                </div>
              )}
              
              {/* Footer */}
              <div className='mt-4 pt-3 border-t border-gray-100'>
                <p className='text-xs text-gray-500 text-center'>
                  Manage your wallet connections securely
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main card stack */}
      <div className='flex flex-col items-center w-full max-w-md mx-auto mb-44'>
        <div className='flex mb-4 justify-between w-full px-2'>
          <div>
            <div className='flex items-center gap-3'>
              <span className='text-sm'>TestNet</span>
              <button
                onClick={() => setEnvironment(prev => prev === 'testnet' ? 'mainnet' : 'testnet')}
                className='relative inline-flex h-6 w-12 items-center rounded-full bg-primary-30 border border-primary-30'
                disabled={!isConnected}
              >
              <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${environment === 'mainnet' ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
              <span className='text-sm'>MainNet</span>
            </div>
          </div>
          <div className='flex gap-2'>
            <button 
              onClick={() => setSwapDomain('evm')}
              className={`text-sm rounded-full py-1 px-4 cursor-pointer transition-colors ${
                swapDomain === 'evm' 
                  ? 'bg-primary-110 text-white' 
                  : 'bg-primary-20 text-primary hover:bg-primary-30'
              }`}>
              EVM
            </button>
            <button 
              onClick={() => setSwapDomain('starknet')}
              className={`text-sm rounded-full py-1 px-4 cursor-pointer transition-colors ${
                swapDomain === 'starknet' 
                  ? 'bg-primary-110 text-white' 
                  : 'bg-primary-20 text-primary hover:bg-primary-30'
              }`}>
              StarkNet
            </button>
          </div>
        </div>
        {/* EVM Interface */}
        {swapDomain === 'evm' && (
          <>
        {/* You Send */}
        <div className='border-primary-20 border rounded-3xl px-5 pb-5 pt-3 bg-white w-full'>
          <div className='flex justify-between items-center mb-4'>
            <div className='text-primary text-sm'>You Send</div>
                <div className='flex gap-2'>
                  <select
                    className='border border-primary-30 rounded-full py-1 px-2 text-xs'
                    value={sourceChain}
                    onChange={(e) => setSourceChain(e.target.value)}>
                    {availableChains.map((chain) => (
                      <option key={chain.id} value={chain.id}>
                        {chain.icon} {chain.name}
                      </option>
                    ))}
                  </select>
            {/* Enhanced token select with icon display */}
            <div className="flex items-center gap-1 border border-primary-30 rounded-full py-1 px-2">
              <div className="text-base iconify iconify--lucide" data-icon={getTokenIcon(sellToken)}></div>
              <select
                className='outline-none bg-transparent'
                value={sellToken}
                onChange={(e) => setSellToken(e.target.value)}>
                {availableSourceTokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
                </div>
          </div>

          <div>
            <input
              type='number'
                  value={sellAmount}
              onChange={handleChange}
              onBlur={handleBlur}
              min='0'
                  placeholder='0.0'
              className='text-3xl w-full outline-none font-medium'
            />
          </div>

          <div className='mt-2 text-xs'>
            Available Balance:{' '}
            <span className='text-primary'>
              {(() => {
                // This will be updated when we implement real-time balance checking
                return '1000.00';
              })()} {sellToken}
            </span>
          </div>

          <div className='absolute w-full left-0 flex justify-center items-center'>
                <button
                  onClick={switchTokens}
                  className='p-2 rounded-full bg-primary-110 hover:bg-primary-80 transition-colors border border-primary-30'>
                  <Image src='/swap.svg' alt='Swapicon' width={30} height={30} />
                </button>
              </div>
             </div>
           </>
         )}



         {/* Starknet Interface */}
        {swapDomain === 'starknet' && (
          <>
            {/* You Send - Starknet */}
            <div className='border-primary-20 border rounded-3xl px-5 pb-5 pt-3 bg-white w-full'>
              <div className='flex justify-between items-center mb-4'>
                <div className='text-primary text-sm'>You Send</div>
                {/* Enhanced Starknet token select with icon display */}
                <div className="flex items-center gap-1 border border-primary-30 rounded-full py-1 px-2">
                  <div className="text-base iconify iconify--lucide" data-icon={getTokenIcon(starkSellToken)}></div>
                  <select
                    className='outline-none bg-transparent'
                    value={starkSellToken}
                    onChange={(e) => setStarkSellToken(e.target.value as 'STRK' | 'ETH' | 'USDC' | 'USDT')}>
                    <option value='STRK'>STRK</option>
                    <option value='ETH'>ETH</option>
                    <option value='USDC'>USDC</option>
                    <option value='USDT'>USDT</option>
                  </select>
                </div>
              </div>

              <div>
                <input
                  type='number'
                  value={starkSellAmount}
                  onChange={(e) => setStarkSellAmount(e.target.value)}
                  min='0'
                  step='0.01'
                  className='text-3xl w-full outline-none font-medium'
                  placeholder='0.0'
                />
              </div>

              <div className='mt-2 text-xs'>
                Available Balance:{' '}
                <span className='text-primary'>1000.00 {starkSellToken}</span>
              </div>

              <div className='absolute w-full left-0 flex justify-center items-center'>
                <button
                  onClick={switchTokens}
                  className='p-2 rounded-full bg-primary-110 hover:bg-primary-80 transition-colors border border-primary-30'>
                  <Image src='/swap.svg' alt='Swapicon' width={30} height={30} />
                </button>
          </div>
        </div>
           </>
         )}



        {/* EVM You Receive */}
        {swapDomain === 'evm' && (
        <div className='border-primary-20 border rounded-3xl py-4 px-5 mt-2 bg-white w-full'>
          <div className='flex justify-between items-center mb-4'>
            <div className='text-primary text-sm'>You Receive</div>
              <div className='flex gap-2'>
                <select
                  className='border border-primary-30 rounded-full py-1 px-2 text-xs'
                  value={targetChain}
                  onChange={(e) => setTargetChain(e.target.value)}>
                  {availableChains.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.icon} {chain.name}
                    </option>
                  ))}
                </select>
            {/* Enhanced token select with icon display */}
            <div className="flex items-center gap-1 border border-primary-30 rounded-full py-1 px-2">
              <div className="text-base iconify iconify--lucide" data-icon={getTokenIcon(buyToken)}></div>
              <select
                className='outline-none bg-transparent'
                value={buyToken}
                onChange={(e) => setBuyToken(e.target.value)}>
                {availableTargetTokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
              </div>
          </div>

          <div>
            <input
              type='number'
                value={buyAmount || sellAmount}
              readOnly
              className='text-3xl w-full outline-none font-medium'
            />
          </div>

          <div className='mt-2 text-xs'>
            New Balance:{' '}
            <span className='text-primary'>1000.00 {buyToken}</span>
          </div>

            {/* Recipient for Solana */}
            {(targetChain === 'solana' || targetChain === 'solana-devnet' || targetChain === 'eclipse-testnet') && (
              <div className='mt-2'>
                <input
                  type='text'
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder='Recipient (Solana address)'
                  className='w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-400'
                />
              </div>
            )}
          </div>
        )}

        {/* Starknet You Receive */}
        {swapDomain === 'starknet' && (
          <div className='border-primary-20 border rounded-3xl py-4 px-5 mt-2 bg-white w-full'>
            <div className='flex justify-between items-center mb-4'>
              <div className='text-primary text-sm'>You Receive</div>
              {/* Enhanced Starknet token select with icon display */}
              <div className="flex items-center gap-1 border border-primary-30 rounded-full py-1 px-2">
                <div className="text-base iconify iconify--lucide" data-icon={getTokenIcon(starkBuyToken)}></div>
                <select
                  className='outline-none bg-transparent'
                  value={starkBuyToken}
                  onChange={(e) => setStarkBuyToken(e.target.value as 'STRK' | 'ETH' | 'USDC' | 'USDT')}>
                  <option value='STRK'>STRK</option>
                  <option value='ETH'>ETH</option>
                  <option value='USDC'>USDC</option>
                  <option value='USDT'>USDT</option>
                </select>
              </div>
            </div>

            <div>
              <input
                type='number'
                value={starkBuyAmount}
                readOnly
                className='text-3xl w-full outline-none font-medium'
                placeholder='0.0'
              />
        </div>

            <div className='mt-2 text-xs'>
              New Balance:{' '}
              <span className='text-primary'>1000.00 {starkBuyToken}</span>
            </div>
          </div>
        )}

        {/* Summary - Updated to show quote details */}
        <div className='border-primary-20 border rounded-3xl p-5 mt-2 bg-white w-full'>
          <div className='text-primary font-medium'>Summary</div>

          {!quote ? (
            <div>
              <div className='flex justify-between mt-2'>
                <span className='text-xs font-medium'>Amount Sent:</span>
                <span className='text-xs'>
                  {sellAmount} {sellToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Amount Received:</span>
                <span className='text-xs'>-- {buyToken}</span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Transaction Fee:</span>
                <span className='text-xs'>--</span>
              </div>
            </div>
          ) : (
            <div>
              <div className='flex justify-between mt-2'>
                <span className='text-xs font-medium'>Amount Sent:</span>
                <span className='text-xs'>
                  {sellAmount} {sellToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Amount Received:</span>
                <span className='text-xs'>
                  {buyAmount} {buyToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Route:</span>
                <span className='text-xs'>
                  {quote.fromChain} → {quote.toChain}
                </span>
              </div>

              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Gas Fee:</span>
                <span className='text-xs'>${Number(quote.quote?.fees?.gas?.amountUsd || 0).toFixed(2)}</span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Total Fee:</span>
                <span className='text-xs text-red-500'>
                  ${(() => {
                    const gas = Number(quote.quote?.fees?.gas?.amountUsd || 0);
                    const relayer = Number(quote.quote?.fees?.relayerService?.amountUsd || 0);
                    return (gas + relayer).toFixed(2);
                  })()}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-xs'>Estimated Time:</span>
                <span className='text-xs'>{quote.quote?.details?.timeEstimate ? `${quote.quote.details.timeEstimate} min` : '—'}</span>
              </div>
            </div>
          )}

          {quoteError && (
            <div className='mt-3 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-xs'>
              {quoteError}
            </div>
          )}

          {/* AI Response Display */}
          {aiResponse && (
            <div className='mt-3 p-2 bg-blue-100 border border-blue-300 rounded text-blue-700 text-xs'>
              {aiResponse}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {swapDomain === 'evm' && (
          <>
            {!quote ? (
        <button
          className='mt-4 bg-primary-110 text-xl text-white py-4 rounded-full w-full disabled:opacity-50 disabled:cursor-not-allowed'
          onClick={getQuote}
                disabled={isLoading || !sellAmount || sourceChain === targetChain || !isConnected}>
          {isLoading ? 'Getting Quote...' : 'Review Swap'}
        </button>
            ) : (
              <div className='flex gap-2 mt-4 w-full'>
                <button
                  className='flex-1 bg-primary-110 text-xl text-white py-4 disabled:opacity-50 disabled:cursor-not-allowed rounded-full'
                  onClick={getQuote}
                  disabled={isLoading || !sellAmount || sourceChain === targetChain || !isConnected}>
                  Get Quote
                </button>
                <button
                  className='flex-1 bg-primary-110 text-xl text-white py-4 disabled:opacity-50 disabled:cursor-not-allowed rounded-full'
                  onClick={handleExecute}
                  disabled={isLoading || !isConnected}>
                  {isLoading ? 'Processing...' : 'Execute Swap'}
                </button>
              </div>
            )}
          </>
        )}

        {swapDomain === 'starknet' && (
          <button
            className='mt-4 bg-primary-110 text-xl text-white py-4 rounded-full w-full disabled:opacity-50 disabled:cursor-not-allowed'
            onClick={handleStarknetExecute}
            disabled={!starkSellAmount || starkStatus !== 'connected' || isLoading}>
            {isLoading ? 'Processing...' : 'Execute Starknet Swap'}
          </button>
        )}


      </div>

      {/* Chat / Input Box - Updated with AI functionality */}
      <div className='fixed bottom-4 left-64 right-0 flex justify-center'>
        <div className='w-[60%] border-primary-20 border rounded-2xl px-4 py-3 bg-white shadow-[2px_2px_20px_rgba(0,0,0,0.05)] flex items-center justify-between'>
          <div className='flex flex-1 items-center gap-2'>
            <div className="text-3xl cursor-pointer iconify iconify--mingcute" data-icon="mingcute:ai-line"></div>
            <input
              type='text'
              value={aiTask}
              onChange={(e) => setAiTask(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleAiIntent();
                }
              }}
              placeholder='Speak or type your request eg. Convert 50USDT to ETH'
              className='w-full outline-none text-sm text-primary-50 font-medium'
              disabled={isLoading}
            />
          </div>
          <div className='flex items-center gap-2'>
            <button
              className='bg-primary-110 text-sm text-white py-2 px-4 rounded-full disabled:opacity-50 disabled:cursor-not-allowed'
              disabled={isLoading}>
              Voice
            </button>
            <button
              className='bg-primary-110 text-sm text-white py-2 px-4 rounded-full disabled:opacity-50 disabled:cursor-not-allowed'
              onClick={handleAiIntent}
              disabled={isLoading || !aiTask.trim()}>
              {isLoading ? 'Processing...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}