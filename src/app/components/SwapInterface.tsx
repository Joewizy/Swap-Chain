'use client';

import React, { useState } from 'react';
import { useRelayExecutor, QuoteResponse } from '../utils/relay-executor';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { SwapFormData } from '../utils/interfaces';

const SUPPORTED_CHAINS = [
  { value: 'sepolia', label: 'Sepolia', icon: '🔷' },
  { value: 'base-sepolia', label: 'Base Sepolia', icon: '🔵' },
  { value: 'arbitrum-sepolia', label: 'Arbitrum Sepolia', icon: '🔵' },
  { value: 'op-sepolia', label: 'OP Sepolia', icon: '🔵' },
  { value: 'polygon-amoy', label: 'Polygon Amoy', icon: '🔵' },
  { value: 'solana-devnet', label: 'Solana Devnet', icon: '🟣' },
  { value: 'eclipse-testnet', label: 'Eclipse Testnet', icon: '🟣' },
  { value: 'bitcoin-testnet4', label: 'Bitcoin Testnet4', icon: '🟡' }
];

const SUPPORTED_TOKENS = [
  { value: 'ETH', label: 'ETH', icon: '🔷' },
  { value: 'SOL', label: 'SOL', icon: '🟣' },
  { value: 'BTC', label: 'BTC', icon: '🟡' },
  { value: 'MATIC', label: 'MATIC', icon: '🟣' }
];

export default function SwapInterface() {
  const [formData, setFormData] = useState<SwapFormData>({
    sourceChain: 'base-sepolia',
    targetChain: 'sepolia',
    token: 'ETH',
    amount: '0.001'
  });

  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState<string>('');

  // Wallet integration
  const { address, isConnected } = useAccount();
  const { executeQuote } = useRelayExecutor();

  const handleInputChange = (field: keyof SwapFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getQuote = async () => {
    if (!isConnected || !address) {
      setStatus('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setStatus('Getting quote...');

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          userAddress: address
        })
      });

      const data = await response.json();

      if (data.success) {
        setQuoteResponse(data);
        setStatus('Quote received! Ready to execute.');
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!quoteResponse) {
      setStatus('No quote available');
      return;
    }

    if (!isConnected || !address) {
      setStatus('Please connect your wallet first');
      return;
    }

    setIsExecuting(true);
    setStatus('Executing swap...');

    try {
      const result = await executeQuote(quoteResponse);
      
      if (result.success) {
        setStatus('Swap executed successfully!');
      } else {
        setStatus(`Execution failed: ${result.error}`);
      }
    } catch (error) {
      setStatus(`Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const switchTokens = () => {
    setFormData(prev => ({
      ...prev,
      sourceChain: prev.targetChain,
      targetChain: prev.sourceChain
    }));
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Main Swap Card */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Swap</h2>
            <ConnectButton />
          </div>
        </div>

        {/* Swap Form */}
        <div className="p-6 space-y-4">
          {/* From Section */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600">From</span>
              <span className="text-xs text-gray-500">Balance: 1.0 {formData.token}</span>
            </div>
            
            <div className="space-y-3">
              {/* Chain Selection */}
              <select
                value={formData.sourceChain}
                onChange={(e) => handleInputChange('sourceChain', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!isConnected}
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain.value} value={chain.value}>
                    {chain.icon} {chain.label}
                  </option>
                ))}
              </select>

              {/* Token and Amount */}
              <div className="flex gap-2">
                <select
                  value={formData.token}
                  onChange={(e) => handleInputChange('token', e.target.value)}
                  className="w-24 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!isConnected}
                >
                  {SUPPORTED_TOKENS.map(token => (
                    <option key={token.value} value={token.value}>
                      {token.icon} {token.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', e.target.value)}
                  placeholder="0.0"
                  className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!isConnected}
                />
              </div>
            </div>
          </div>

          {/* Switch Button */}
          <div className="flex justify-center">
            <button
              onClick={switchTokens}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              disabled={!isConnected}
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Section */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600">To</span>
              <span className="text-xs text-gray-500">Balance: 0.0 {formData.token}</span>
            </div>
            
            <div className="space-y-3">
              {/* Chain Selection */}
              <select
                value={formData.targetChain}
                onChange={(e) => handleInputChange('targetChain', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!isConnected}
              >
                {SUPPORTED_CHAINS.map(chain => (
                  <option key={chain.value} value={chain.value}>
                    {chain.icon} {chain.label}
                  </option>
                ))}
              </select>

              {/* Token Display */}
              <div className="flex gap-2">
                <div className="w-24 p-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-600 flex items-center justify-center">
                  {SUPPORTED_TOKENS.find(t => t.value === formData.token)?.icon} {formData.token}
                </div>
                <div className="flex-1 p-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-600">
                  {quoteResponse ? quoteResponse.amount : '0.0'}
                </div>
              </div>
            </div>
          </div>

          {/* Quote Details */}
          {quoteResponse && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3">Quote Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">Route:</span>
                  <span className="text-blue-900">{quoteResponse.fromChain} → {quoteResponse.toChain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Request ID:</span>
                  <span className="text-blue-900 font-mono text-xs">{quoteResponse.requestId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Steps:</span>
                  <span className="text-blue-900">{quoteResponse.steps?.length || 0} steps</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {!isConnected ? (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-3">Connect your wallet to start swapping</p>
                <ConnectButton />
              </div>
            ) : (
              <>
                <button
                  onClick={getQuote}
                  disabled={isLoading || !formData.amount}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Getting Quote...' : 'Get Quote'}
                </button>

                {quoteResponse && (
                  <button
                    onClick={executeSwap}
                    disabled={isExecuting}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-4 rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isExecuting ? 'Executing...' : 'Execute Swap'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Status */}
          {status && (
            <div className="p-3 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-700">{status}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
