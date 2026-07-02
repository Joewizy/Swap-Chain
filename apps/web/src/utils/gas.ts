/**
 * Gas helpers.
 *
 * Per-chain gas-buffer estimates, keyed by numeric chain ID. Used to
 * leave native-token headroom when validating a transaction balance.
 */

/**
 * Get estimated gas buffer for a chain (in ETH equivalent)
 * @param chainId - Chain ID
 * @returns Estimated gas buffer in ETH
 */
export const getGasBufferForChain = (chainId: number): string => {
  const gasBuffers: Record<number, string> = {
    // Mainnet chains
    1: "0.01", // Ethereum mainnet
    137: "0.1", // Polygon
    42161: "0.001", // Arbitrum
    10: "0.001", // Optimism
    8453: "0.001", // Base
    56: "0.001", // BSC
    43114: "0.01", // Avalanche

    // Testnet chains
    11155111: "0.01", // Sepolia
    80001: "0.1", // Mumbai
    421614: "0.001", // Arbitrum Sepolia
    11155420: "0.001", // Optimism Sepolia
    84532: "0.001", // Base Sepolia
    97: "0.001", // BSC Testnet
    43113: "0.01", // Fuji
  };

  return gasBuffers[chainId] || "0.01"; // Default buffer
};
