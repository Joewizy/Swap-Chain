'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { Metadata } from 'next';

export default function Transfer() {
  const [amount, setAmount] = useState('0.00');

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
    <div>
      <h1 className='text-3xl font-semibold'>Transfer Page</h1>

      {/* Relative wrapper for positioning */}
      <div className='flex flex-col items-center justify-center relative w-full max-w-md mx-auto'>
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
        </div>

        {/* Swap icon centered between the two containers */}
        <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10'>
          <Image src='/swap.svg' alt='Swapicon' width={55} height={55} />
        </div>

        {/* Second container */}
        <div className='border-primary-20 border rounded-3xl p-5 bg-white w-full mt-3'>
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

        <button className='mt-4 bg-primary-110 text-xl text-white py-4 rounded-full w-full'>
          Swap Tokens
        </button>
      </div>
    </div>
  );
}
