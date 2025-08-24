'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAccount, useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';

const TOKENS = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    icon: '🔷',
    chains: ['sepolia', 'base-sepolia', 'arbitrum-sepolia', 'op-sepolia'],
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    icon: '🟣',
    chains: ['solana-devnet', 'eclipse-testnet'],
  },
  { symbol: 'BTC', name: 'Bitcoin', icon: '🟡', chains: ['bitcoin-testnet4'] },
  { symbol: 'MATIC', name: 'Polygon', icon: '🟣', chains: ['polygon-amoy'] },
  {
    symbol: 'USDT',
    name: 'Tether',
    icon: '🟢',
    chains: ['sepolia', 'base-sepolia', 'arbitrum-sepolia', 'op-sepolia'],
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    icon: '🔵',
    chains: ['sepolia', 'base-sepolia', 'arbitrum-sepolia', 'op-sepolia'],
  },
];

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

export default function Transfer() {
  const [amount, setAmount] = useState('0.00');
  const [disconnectBtn, setDisconnectBtn] = useState(false);

  // Quote state
  const [sellToken, setSellToken] = useState('USDT');
  const [buyToken, setBuyToken] = useState('ETH');
  const [sourceChain, setSourceChain] = useState('base-sepolia');
  const [targetChain, setTargetChain] = useState('arbitrum-sepolia');
  const [quote, setQuote] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  // AI state
  const [aiTask, setAiTask] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [extractedIntent, setExtractedIntent] = useState<any>(null);

  const router = useRouter();
  const { address, status, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '') {
      setAmount('');
      return;
    }
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) return;
    setAmount(v);
  };

  const handleBlur = () => {
    if (amount === '' || Number.isNaN(Number(amount))) {
      setAmount('0.00');
    } else {
      setAmount(Math.max(0, parseFloat(amount)).toFixed(2));
    }
  };

  // Extract quote from API(Relay)
  const getQuote = async () => {
    if (!amount || !sellToken || sourceChain === targetChain) {
      setQuoteError(
        'Please enter an amount and select different source and target chains for bridging.'
      );
      return;
    }

    setIsLoading(true);
    setQuoteError('');

    try {
      const response = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChain,
          targetChain,
          token: sellToken,
          amount: amount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get quote');
      }

      const quoteData = await response.json();

      if (quoteData.success && quoteData.data) {
        setQuote(quoteData.data);
        setQuoteError('');
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
          setAmount(result.amount.toString());
        }
        if (result.sourceChain) {
          setSourceChain(result.sourceChain.toLowerCase());
        }
        if (result.targetChain) {
          setTargetChain(result.targetChain.toLowerCase());
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
            className='flex items-center gap-2 cursor-pointer'>
            <iconify-icon
              icon='lucide:circle-user-round'
              className='text-3xl cursor-pointer'
            />
            {isConnected && address ? shorten(address) : 'Not Connected'}
            <div className='text-xl cursor-pointer'>▼</div>
          </div>
          {disconnectBtn && (
            <button
              onClick={() => {
                disconnect();
                setDisconnectBtn(false);
              }}
              className='absolute top-10 right-0 px-4 py-2 text-white bg-primary-110 cursor-pointer hover:bg-primary rounded-full'>
              Disconnect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Main card stack */}
      <div className='flex flex-col items-center w-full max-w-md mx-auto'>
        {/* You Send */}
        <div className='border-primary-20 border rounded-3xl px-5 pt-4 pb-4 bg-white w-full'>
          <div className='flex justify-between items-center mb-4'>
            <div className='text-primary text-sm'>You Send</div>
            <select
              className='border border-primary-30 rounded-full py-1 px-2'
              value={sellToken}
              onChange={(e) => setSellToken(e.target.value)}>
              {TOKENS.map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.icon} {token.symbol}
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type='number'
              value={amount}
              onChange={handleChange}
              onBlur={handleBlur}
              min='0'
              step='0.01'
              className='text-3xl w-full outline-none font-medium'
            />
          </div>

          <div className='mt-2 text-sm'>
            Available Balance:{' '}
            <span className='text-primary'>1000.00 {sellToken}</span>
          </div>

          <div className='absolute w-full left-0 flex justify-center items-center'>
            <Image src='/swap.svg' alt='Swapicon' width={50} height={50} />
          </div>
        </div>

        {/* You Receive */}
        <div className='border-primary-20 border rounded-3xl py-3 px-5 mt-2 bg-white w-full'>
          <div className='flex justify-between items-center mb-4'>
            <div className='text-primary text-sm'>You Receive</div>
            <select
              className='border border-primary-30 rounded-full py-1 px-2'
              value={buyToken}
              onChange={(e) => setBuyToken(e.target.value)}>
              {TOKENS.map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.icon} {token.symbol}
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type='number'
              value={quote ? quote.to.amount : amount}
              readOnly
              className='text-3xl w-full outline-none font-medium'
            />
          </div>

          <div className='mt-2 text-sm'>
            New Balance:{' '}
            <span className='text-primary'>1000.00 {buyToken}</span>
          </div>
        </div>

        {/* Summary - Updated to show quote details */}
        <div className='border-primary-20 border rounded-3xl p-5 mt-2 bg-white w-full'>
          <div className='text-primary'>Summary</div>

          {!quote ? (
            <div>
              <div className='flex justify-between mt-2'>
                <span className='text-sm font-medium'>Amount Sent:</span>
                <span className='text-sm'>
                  {amount} {sellToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Amount Received:</span>
                <span className='text-sm'>-- {buyToken}</span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Transaction Fee:</span>
                <span className='text-sm'>--</span>
              </div>
            </div>
          ) : (
            <div>
              <div className='flex justify-between mt-2'>
                <span className='text-sm font-medium'>Amount Sent:</span>
                <span className='text-sm'>
                  {amount} {sellToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Amount Received:</span>
                <span className='text-sm'>
                  {quote.to.amount} {buyToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Exchange Rate:</span>
                <span className='text-sm'>
                  1 {sellToken} = {quote.rate} {buyToken}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Route:</span>
                <span className='text-sm'>
                  {quote.from.chain} → {quote.to.chain}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Gas Fee:</span>
                <span className='text-sm'>${quote.fees.gas}</span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Bridge Fee:</span>
                <span className='text-sm'>${quote.fees.bridge}</span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Total Cost:</span>
                <span className='text-sm text-red-500'>
                  ${quote.fees.total}
                </span>
              </div>
              <div className='flex justify-between mt-2'>
                <span className='font-medium text-sm'>Estimated Time:</span>
                <span className='text-sm'>{quote.time}</span>
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

        <button
          className='mt-4 bg-primary-110 text-xl text-white py-4 rounded-full w-full disabled:opacity-50 disabled:cursor-not-allowed'
          onClick={getQuote}
          disabled={isLoading || !amount || sourceChain === targetChain}>
          {isLoading ? 'Getting Quote...' : 'Review Swap'}
        </button>
      </div>

      {/* Chat / Input Box - Updated with AI functionality */}
      <div className='fixed bottom-4 left-64 right-0 flex justify-center'>
        <div className='w-[60%] border-primary-20 border rounded-2xl p-4 bg-white shadow-[2px_2px_20px_rgba(0,0,0,0.05)] flex items-center justify-between'>
          <div className='flex flex-1 items-center gap-2'>
            <div className='text-3xl cursor-pointer text-[#017ECD]'>🤖</div>
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
              className='w-full outline-none text-sm text-primary-50'
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
