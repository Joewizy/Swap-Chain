import { useAccount, useWalletClient, usePublicClient, useWriteContract, useSignMessage, useSwitchChain } from 'wagmi';

export interface RelayStep {
  id: string;
  kind: 'transaction' | 'signature';
  chainId: number;
  items: RelayStepItem[];
  requestId?: string;
}

export interface RelayStepItem {
  // Transaction data
  data?: {
    to: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    // Contract interaction fields
    abi?: any[];
    functionName?: string;
    args?: any[];
  };
  // Status checking
  check?: {
    endpoint: string;
  };
  // Signature requirements
  signature?: {
    message: string;
    endpoint: string;
  };
}

export interface QuoteResponse {
  success: boolean;
  steps: RelayStep[];
  requestId?: string;
  amount: string;
  token: string;
  fromChain: any;
  toChain: any;
  status: string;
  quote: any;
}

export interface ExecutionProgress {
  currentStep: number;
  totalSteps: number;
  stepName: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  txHash?: string;
  txLink?: string;
  error?: string;
}

/**
 * Hook-based Relay executor that properly handles Relay steps
 */
export function useRelayExecutor() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  const executeQuote = async (
    quoteResponse: QuoteResponse,
    onProgress?: (progress: ExecutionProgress) => void
  ) => {
    if (!isConnected || !address || !walletClient) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const { steps } = quoteResponse;
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        onProgress?.({
          currentStep: i + 1,
          totalSteps: steps.length,
          stepName: getStepName(step, i),
          status: 'executing'
        });

        const result = await executeStep(step);
        
        onProgress?.({
          currentStep: i + 1,
          totalSteps: steps.length,
          stepName: getStepName(step, i),
          status: 'completed',
          txHash: result.txHash,
          txLink: result.txLink
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error executing steps:', error);
      onProgress?.({
        currentStep: 0,
        totalSteps: 0,
        stepName: 'Failed',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };

  const executeStep = async (step: RelayStep): Promise<{ txHash?: string; txLink?: string }> => {
    // Switch to the correct chain if needed (only for transaction steps)
    if (step.kind === 'transaction' && step.chainId && chainId !== step.chainId) {
      await switchChainAsync({ chainId: step.chainId });
    }

    if (step.kind === 'transaction') {
      return await executeTransactionStep(step);
    } else if (step.kind === 'signature') {
      await executeSignatureStep(step);
      return {};
    }

    return {};
  };

  const executeTransactionStep = async (step: RelayStep): Promise<{ txHash?: string; txLink?: string }> => {
    let lastTxHash: string | undefined;
    let lastTxLink: string | undefined;

    for (const item of step.items) {
      if (item.data) {
        // Submit transaction
        const txHash = await submitTransaction(item.data);
        lastTxHash = txHash;
        lastTxLink = txHash ? getExplorerTxUrl(step.chainId, txHash) : undefined;
        
        // Wait for transaction confirmation
        if (publicClient && txHash) {
          await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        }
        
        // Poll for completion if check endpoint provided
        if (item.check?.endpoint) {
          await pollForCompletion(item.check.endpoint);
        }
      }
    }

    return { txHash: lastTxHash, txLink: lastTxLink };
  };

  const executeSignatureStep = async (step: RelayStep): Promise<void> => {
    for (const item of step.items) {
      if (item.signature) {
        // Sign the message using Wagmi
        const signature = await signMessageAsync({ 
          message: item.signature.message 
        });
        
        // Submit signature to Relay API
        await submitSignature(item.signature.endpoint, signature);
      }
    }
  };

  const submitTransaction = async (transactionData: any): Promise<string> => {
    try {
      // Handle contract interactions
      if (transactionData.abi && transactionData.functionName) {
        const hash = await writeContractAsync({
          address: transactionData.to as `0x${string}`,
          abi: transactionData.abi,
          functionName: transactionData.functionName,
          args: transactionData.args || [],
          value: transactionData.value ? BigInt(transactionData.value) : BigInt(0),
        });
        return hash;
      } 
      // Handle raw transactions
      else {
        const hash = await walletClient!.sendTransaction({
          to: transactionData.to as `0x${string}`,
          data: (transactionData.data || '0x') as `0x${string}`,
          value: transactionData.value ? BigInt(transactionData.value) : BigInt(0),
          gas: transactionData.gas ? BigInt(transactionData.gas) : undefined,
          gasPrice: transactionData.gasPrice ? BigInt(transactionData.gasPrice) : undefined,
        });
        return hash;
      }
    } catch (error) {
      console.error('Error submitting transaction:', error);
      throw error;
    }
  };

  const submitSignature = async (endpoint: string, signature: string): Promise<void> => {
    try {
      const response = await fetch(`https://api.testnets.relay.link${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to submit signature: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error submitting signature:', error);
      throw error;
    }
  };

  const pollForCompletion = async (endpoint: string): Promise<void> => {
    const maxAttempts = 60; // 10 minutes with 10-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`https://api.testnets.relay.link${endpoint}`, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        
        const status = await response.json();

        if (status.status === 'success' || status.status === 'completed') {
          return;
        } else if (status.status === 'failed' || status.status === 'error') {
          throw new Error(`Transaction failed: ${status.error || status.message || 'Unknown error'}`);
        }

        // Wait 10 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
      } catch (error) {
        console.error('Error polling for completion:', error);
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
      }
    }

    throw new Error('Transaction timeout - polling exceeded maximum attempts');
  };

  const getStepName = (step: RelayStep, index: number): string => {
    // Try to infer step name from the step data
    if (step.kind === 'signature') {
      return 'Sign Message';
    }
    
    // Check if it's likely an approval step
    const hasApproval = step.items.some(item => 
      item.data?.functionName === 'approve' || 
      item.data?.data?.includes('095ea7b3') // approve function selector
    );
    
    if (hasApproval) {
      return 'Token Approval';
    }
    
    // Default names based on position
    if (index === 0) return 'Initiate Bridge';
    if (index === step.items.length - 1) return 'Complete Bridge';
    
    return `Step ${index + 1}`;
  };

  // Helper function to estimate gas for transactions
  const estimateGas = async (transactionData: any) => {
    if (!publicClient) return undefined;

    try {
      if (transactionData.abi && transactionData.functionName) {
        return await publicClient.estimateContractGas({
          address: transactionData.to as `0x${string}`,
          abi: transactionData.abi,
          functionName: transactionData.functionName,
          args: transactionData.args || [],
          value: transactionData.value ? BigInt(transactionData.value) : BigInt(0),
          account: address as `0x${string}`
        });
      } else {
        return await publicClient.estimateGas({
          to: transactionData.to as `0x${string}`,
          data: transactionData.data as `0x${string}`,
          value: transactionData.value ? BigInt(transactionData.value) : BigInt(0),
          account: address as `0x${string}`
        });
      }
    } catch (error) {
      console.warn('Gas estimation failed:', error);
      return undefined;
    }
  };

  // Explorer URL helper
  const getExplorerTxUrl = (id: number, hash: string): string | undefined => {
    const base = explorerBaseUrlByChainId[id];
    return base ? `${base}/tx/${hash}` : undefined;
  };

  const explorerBaseUrlByChainId: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
    421614: 'https://sepolia.arbiscan.io',
    11155420: 'https://sepolia-optimism.etherscan.io',
    80002: 'https://www.oklink.com/amoy', 
  };

  return { 
    executeQuote,
    isConnected, 
    address,
    chainId,
    walletClient,
    estimateGas
  };
}
