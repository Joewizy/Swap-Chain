'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAccount, useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';

export default function Transfer() {
  const [amount, setAmount] = useState('0.00');
  const [disconnectBtn, setDisconnectBtn] = useState(false);

  const router = useRouter();
  const { address, status, isConnected } = useAccount();
  const { disconnect } = useDisconnect(); // Wagmi disconnect hook

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

  const shorten = (addr?: string) =>
    addr ? `${addr.slice(0, 6)}....${addr.slice(-4)}` : '';

  return (
    <div className='relative ml-auto'>
      {/* Header */}
      <div className='flex justify-between items-center mx-10 mt-4'>
        <h1 className='text-3xl font-semibold'>Transfer Page</h1>
        <div ref={wrapperRef} className='relative'>
          <div
            onClick={() => setDisconnectBtn(!disconnectBtn)}
            className='flex items-center gap-2 cursor-pointer'>
            <iconify-icon
              icon='lucide:circle-user-round'
              className='text-3xl cursor-pointer'
            />
            {isConnected && address ? shorten(address) : 'Not Connected'}
            <iconify-icon
              icon='ep:arrow-down'
              className='text-xl cursor-pointer'
            />
          </div>
          {disconnectBtn && (
            <button
              onClick={() => {
                disconnect(); // Disconnect wallet
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
        <div className='border-primary-20 border rounded-3xl px-5 pt-5 pb-8 bg-white w-full'>
          <div className='flex justify-between items-center mb-4'>
            <div className='text-primary'>You Send</div>
            <select className='border border-primary-30 rounded-full py-1 px-2'>
              <option value='usd'>USD</option>
              <option value='eur'>EUR</option>
              <option value='gbp'>GBP</option>
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

          <div className='mt-4 text-sm'>
            Available Balance: <span className='text-primary'>1000.00 USD</span>
          </div>

          <div className='absolute w-full left-0 mt-2 flex justify-center items-center'>
            <Image src='/swap.svg' alt='Swapicon' width={55} height={55} />
          </div>
        </div>

        {/* You Receive */}
        <div className='border-primary-20 border rounded-3xl p-5 mt-2 bg-white w-full'>
          <div className='flex justify-between items-center mb-4'>
            <div className='text-primary'>You Receive</div>
            <select className='border border-primary-30 rounded-full py-1 px-2'>
              <option value='usd'>USD</option>
              <option value='eur'>EUR</option>
              <option value='gbp'>GBP</option>
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

          <div className='mt-4 text-sm'>
            New Balance: <span className='text-primary'>1000.00 USD</span>
          </div>
        </div>

        {/* Summary */}
        <div className='border-primary-20 border rounded-3xl p-5 mt-2 bg-white w-full'>
          <div className='text-primary'>Summary</div>

          <div>
            <div className='flex justify-between mt-2'>
              <span className='text-sm font-medium'>Amount Sent:</span>
              <span className='text-sm'>{amount} USD</span>
            </div>
            <div className='flex justify-between mt-2'>
              <span className='font-medium text-sm'>Amount Received:</span>
              <span className='text-sm'>{amount} USD</span>
            </div>
            <div className='flex justify-between mt-2'>
              <span className='font-medium text-sm'>Transaction Fee:</span>
              <span className='text-sm'>0.00 USD</span>
            </div>
          </div>
        </div>

        <button className='mt-4 bg-primary-110 text-xl text-white py-4 rounded-full w-full'>
          Review Swap
        </button>
      </div>

      {/* Chat / Input Box */}
      <div className='fixed bottom-4 left-64 right-0 flex justify-center'>
        <div className='w-[60%] border-primary-20 border rounded-2xl p-4 bg-white shadow-[2px_2px_20px_rgba(0,0,0,0.05)] flex items-center justify-between'>
          <div className='flex flex-1 items-center gap-2'>
            <iconify-icon
              icon='mingcute:ai-line'
              className='text-3xl cursor-pointer text-[#017ECD]'
            />
            <input
              type='text'
              placeholder='Speak or type your request eg. Convert 50USDT to ETH'
              className='w-full outline-none text-sm text-primary-50'
            />
          </div>
          <div className='flex items-center gap-2'>
            <button className='bg-primary-110 text-sm text-white py-2 px-4 rounded-full'>
              Voice
            </button>
            <button className='bg-primary-110 text-sm text-white py-2 px-4 rounded-full'>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
