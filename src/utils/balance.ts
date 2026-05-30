/**
 * Balance helpers.
 *
 * On-chain balance reads and the transaction-affordability check. These
 * touch a viem public client, so they are async and chain-aware.
 */

/**
 * Check user balance for a specific token on a specific chain
 * @param address - User's wallet address
 * @param tokenSymbol - Token symbol (e.g., 'ETH', 'USDC', 'USDT')
 * @param chainId - Chain ID to check balance on
 * @param publicClient - Viem public client for the chain
 * @returns Balance information including raw balance and formatted amount
 */
export const checkTokenBalance = async (
  address: string,
  tokenSymbol: string,
  chainId: number,
  publicClient: any
): Promise<{
  balance: bigint;
  balanceFormatted: string;
  decimals: number;
  symbol: string;
  error?: string;
} | null> => {
  try {
    // For native tokens (ETH, MATIC, etc.), use getBalance
    if (
      tokenSymbol === "ETH" ||
      tokenSymbol === "MATIC" ||
      tokenSymbol === "AVAX" ||
      tokenSymbol === "BNB"
    ) {
      const balance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });
      const balanceInEth = Number(balance) / 1e18;

      return {
        balance,
        balanceFormatted: balanceInEth.toFixed(6),
        decimals: 18,
        symbol: tokenSymbol,
      };
    }

    // For ERC-20 tokens, we need to call the token contract
    // This would require token contract addresses and ABI
    // For now, return null for non-native tokens
    console.warn(
      `Balance checking for ${tokenSymbol} on chain ${chainId} not implemented yet`
    );
    return null;
  } catch (error) {
    console.error(
      `Failed to get ${tokenSymbol} balance on chain ${chainId}:`,
      error
    );
    return {
      balance: BigInt(0),
      balanceFormatted: "0",
      decimals: 18,
      symbol: tokenSymbol,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Check multiple token balances for a user across different chains
 * @param address - User's wallet address
 * @param tokens - Array of tokens to check (symbol and chainId)
 * @param publicClients - Map of chainId to publicClient
 * @returns Map of token balances
 */
export const checkMultipleTokenBalances = async (
  address: string,
  tokens: Array<{ symbol: string; chainId: number }>,
  publicClients: Record<number, any>
): Promise<
  Record<
    string,
    {
      balance: bigint;
      balanceFormatted: string;
      decimals: number;
      symbol: string;
      chainId: number;
      error?: string;
    } | null
  >
> => {
  const results: Record<string, any> = {};

  for (const token of tokens) {
    const publicClient = publicClients[token.chainId];
    if (!publicClient) {
      console.warn(`No public client found for chain ${token.chainId}`);
      results[`${token.symbol}-${token.chainId}`] = null;
      continue;
    }

    const balance = await checkTokenBalance(
      address,
      token.symbol,
      token.chainId,
      publicClient
    );

    if (balance) {
      results[`${token.symbol}-${token.chainId}`] = {
        ...balance,
        chainId: token.chainId,
      };
    } else {
      results[`${token.symbol}-${token.chainId}`] = null;
    }
  }

  return results;
};

/**
 * Validate if user has sufficient balance for a transaction
 * @param userBalance - User's current balance
 * @param requestedAmount - Amount requested for transaction
 * @param gasBuffer - Additional buffer for gas fees (in same token)
 * @returns Validation result
 */
export const validateTransactionBalance = (
  userBalance: { balance: bigint; balanceFormatted: string; decimals: number },
  requestedAmount: string,
  gasBuffer: string = "0"
): {
  isValid: boolean;
  userBalanceFormatted: string;
  requestedAmountFormatted: string;
  gasBufferFormatted: string;
  totalRequiredFormatted: string;
  shortfallFormatted: string;
  error?: string;
} => {
  try {
    const userBalanceNum = parseFloat(userBalance.balanceFormatted);
    const requestedAmountNum = parseFloat(requestedAmount);
    const gasBufferNum = parseFloat(gasBuffer);
    const totalRequired = requestedAmountNum + gasBufferNum;

    const isValid = userBalanceNum >= totalRequired;
    const shortfall = isValid ? 0 : totalRequired - userBalanceNum;

    return {
      isValid,
      userBalanceFormatted: userBalance.balanceFormatted,
      requestedAmountFormatted: requestedAmount,
      gasBufferFormatted: gasBuffer,
      totalRequiredFormatted: totalRequired.toFixed(6),
      shortfallFormatted: shortfall.toFixed(6),
      error: isValid
        ? undefined
        : `Insufficient balance. Need ${totalRequired.toFixed(6)} but have ${userBalance.balanceFormatted}`,
    };
  } catch (error) {
    return {
      isValid: false,
      userBalanceFormatted: userBalance.balanceFormatted,
      requestedAmountFormatted: requestedAmount,
      gasBufferFormatted: gasBuffer,
      totalRequiredFormatted: "0",
      shortfallFormatted: "0",
      error: "Failed to validate balance",
    };
  }
};
