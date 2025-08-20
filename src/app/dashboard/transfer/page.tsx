'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { Metadata } from 'next';

export default function Transfer() {
  const [amount, setAmount] = useState('0.00');
  const [summary, setSummary] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;

    // Allow empty while typing
    if (v === '') {
      setAmount('');
      return;
    }

    // Ignore negatives and non-numbers
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) return;

    setAmount(v);
  };

  const handleBlur = () => {
    // On leaving the field, normalize to 0.00 minimum
    if (amount === '' || Number.isNaN(Number(amount))) {
      setAmount('0.00');
    } else {
      setAmount(Math.max(0, parseFloat(amount)).toFixed(2));
    }
  };

  return (
    <div className='relative ml-auto'>
      <div className='flex justify-between items-center mx-10 my-4'>
        <h1 className='text-3xl font-semibold'>Transfer Page</h1>
        <div className='flex items-center gap-4'>
          <iconify-icon
            icon='lucide:circle-user-round'
            className='text-3xl cursor-pointer'
          />
          0x1234....abcd
        </div>
      </div>

      <div className='flex flex-col items-center justify-center relative w-full max-w-md mx-auto relative'>
        {/* First container */}
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

          {/* Swap icon centered between the two containers */}
          <div className='absolute w-full left-0 mt-2 flex justify-center items-center'>
            <Image src='/swap.svg' alt='Swapicon' width={55} height={55} />
          </div>
        </div>

        {/* Second container */}
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

        {/* Summary container */}
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

      {/* Chat or Input Box */}
      <div className='fixed bottom-4 w-[60%]'>
        <div className='border-primary-20 border rounded-2xl p-4 bg-white shadow-[2px_2px_20px_rgba(0,0,0,0.05)] flex items-center justify-between'>
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
