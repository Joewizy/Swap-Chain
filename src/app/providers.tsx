'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiConfig } from 'wagmi';
import { mainnet, polygon, arbitrum, optimism } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

const config = getDefaultConfig({
  appName: 'SwapChain',
  projectId: 'YOUR_PROJECT_ID', // WalletConnect Cloud projectId
  chains: [mainnet, polygon, arbitrum, optimism],
  ssr: true, // ✅ important for Next.js app router
});

export function Web3Provider({ children }: { children: ReactNode }) {
  // Create QueryClient only once per app
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={config}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </WagmiConfig>
    </QueryClientProvider>
  );
}
