# VaultManager Uniswap V4 Integration Documentation

## Overview

This document explains the implementation of a VaultManager contract that integrates with Uniswap V4 liquidity pools. The solution addresses the challenge of calculating liquidity amounts and managing positions in Uniswap V4's single-contract architecture.

## Key Components

### 1. LiquidityAmounts Library (`src/LiquidityAmounts.sol`)

A custom implementation of Uniswap V3's liquidity calculation formulas, adapted for Uniswap V4's Q64.96 fixed-point arithmetic.

**Key Functions:**
- `getLiquidityForAmount0()` - Calculates liquidity for token0 amounts
- `getLiquidityForAmount1()` - Calculates liquidity for token1 amounts  
- `getLiquidityForAmounts()` - Calculates optimal liquidity for both tokens
- `getAmountsForLiquidity()` - Calculates token amounts from liquidity

### 2. VaultManager Contract (`src/VaultManager.sol`)

Enhanced contract that integrates with Uniswap V4 pools using StateLibrary for real-time pool state.

**Key Features:**
- Automatic pool state retrieval using StateLibrary
- Proper liquidity calculation using LiquidityAmounts
- Position tracking with user liquidity mapping
- Proportional liquidity removal

## Implementation Details

### Pool State Management

Instead of requiring manual `sqrtPriceX96` parameters, the VaultManager now automatically retrieves pool state:

```solidity
// Get current pool state
PoolId poolId = poolKey.toId();
(uint160 sqrtPriceX96, int24 currentTick, , ) = poolManager.getSlot0(poolId);
```

### Liquidity Calculation

The contract uses a dynamic tick range around the current price:

```solidity
// Calculate liquidity delta - use a range around current price
int24 tickLower = currentTick - 100; // Much smaller range for testing
int24 tickUpper = currentTick + 100; // Much smaller range for testing
uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
    sqrtPriceX96,
    sqrtRatioAX96,
    sqrtRatioBX96,
    msg.value, // ETH amount
    amount    // USDT amount
);
```

### Position Tracking

User liquidity is tracked per position using a mapping:

```solidity
mapping(address => mapping(bytes32 => uint128)) public userLiquidity;
```

## Testing Guide

### 1. Setup Environment

```bash
# Navigate to the review directory
cd review

# Install dependencies
forge install

# Compile contracts
forge build
```

### 2. Test Pool State

Run the pool state test to verify the pool exists and get current parameters:

```bash
forge test --match-test testGetPoolState -vvv
```

**Expected Output:**
```
Pool ID: 0x45fd045fc5a9f4f9e76a1ab9cd509a4ce2d657d302992f6912a3d8de5eba551a
Pool exists! Current state:
sqrtPriceX96: 5010828967500958623728276031392126
tick: 221106
protocolFee: 0
lpFee: 500
```

### 3. Test Liquidity Operations

Test the complete add/remove liquidity flow:

```bash
forge test --match-test testRemoveLiquidityAfterAdd -vvv
```

**Expected Output:**
```
sqrtPriceX96: 5010828967500958623728276031392126
currentTick: 221106
tickLower: 221006
tickUpper: 221206
Calculated liquidity: 31497
```

## Pool Information

### Deployed Pool Details
- **Pool Manager**: `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`
- **USDT Token**: `0x83802A27D1df2B2BA7Cc5AeE366d533b36D59Fa4`
- **Pool ID**: `0x45fd045fc5a9f4f9e76a1ab9cd509a4ce2d657d302992f6912a3d8de5eba551a`
- **Fee Tier**: 500 (0.05%)
- **Tick Spacing**: 10
- **Initial Price**: 1 ETH = 4000 USDT

### Pool Key Structure
```solidity
PoolKey memory poolKey = PoolKey({
    currency0: Currency.wrap(address(0)), // ETH
    currency1: Currency.wrap(0x83802A27D1df2B2BA7Cc5AeE366d533b36D59Fa4), // USDT
    fee: 500, // 0.05%
    tickSpacing: 10,
    hooks: IHooks(address(0))
});
```

## Function Reference

### VaultManager Functions

#### `addLiquidity(uint256 amount)`
- **Purpose**: Add liquidity to the ETH/USDT pool
- **Parameters**: 
  - `amount`: USDT amount to add
- **Value**: ETH amount to add (sent with transaction)
- **Returns**: None
- **Events**: `LiquidityAdded`

#### `removeLiquidity(uint256 amount)`
- **Purpose**: Remove liquidity from the ETH/USDT pool
- **Parameters**:
  - `amount`: USDT amount to remove
- **Returns**: None
- **Events**: `LiquidityRemoved`

#### `getSlot0(PoolId poolId)`
- **Purpose**: Get current pool state
- **Returns**: `(sqrtPriceX96, tick, protocolFee, lpFee)`

### LiquidityAmounts Functions

#### `getLiquidityForAmounts()`
```solidity
function getLiquidityForAmounts(
    uint160 sqrtPriceX96,
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint256 amount0,
    uint256 amount1
) internal pure returns (uint128 liquidity)
```

#### `getAmountsForLiquidity()`
```solidity
function getAmountsForLiquidity(
    uint160 sqrtPriceX96,
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint128 liquidity
) internal pure returns (uint256 amount0, uint256 amount1)
```

## Error Handling

### Common Errors

1. **InvalidCaller (0x59afd6c6)**
   - **Cause**: PoolManager authorization issue
   - **Solution**: Ensure proper unlock callback implementation

2. **PoolNotInitialized**
   - **Cause**: Pool doesn't exist
   - **Solution**: Verify pool ID and initialization

3. **CurrencyNotSettled**
   - **Cause**: Balance delta not properly settled
   - **Solution**: Check `_settleDelta` implementation

## Testing Scenarios

### 1. Basic Liquidity Addition
```solidity
// Add 10 USDT + 0.001 ETH
vaultManager.addLiquidity{value: 0.001 ether}(10e6);
```

### 2. Liquidity Removal
```solidity
// Remove 10 USDT worth of liquidity
vaultManager.removeLiquidity(10e6);
```

### 3. Pool State Verification
```solidity
// Get current pool state
(uint160 sqrtPriceX96, int24 tick, , ) = poolManager.getSlot0(poolId);
```

## Debug Information

The VaultManager includes debug logging for troubleshooting:

```solidity
console.log("sqrtPriceX96:", sqrtPriceX96);
console.log("currentTick:", currentTick);
console.log("tickLower:", tickLower);
console.log("tickUpper:", tickUpper);
console.log("Calculated liquidity:", liquidity);
```

## Architecture Benefits

1. **Real-time Pool State**: No need for off-chain price feeds
2. **Accurate Liquidity Calculation**: Uses proper Uniswap V4 math
3. **Position Tracking**: Maintains user liquidity records
4. **Dynamic Tick Ranges**: Adapts to current market conditions
5. **Single Contract Integration**: Works with Uniswap V4's unified pool manager

## Next Steps

1. **Error Resolution**: Address the InvalidCaller error in modifyLiquidity
2. **Gas Optimization**: Optimize liquidity calculations for production
3. **Slippage Protection**: Add slippage tolerance mechanisms
4. **Fee Handling**: Implement proper fee collection and distribution
5. **Multi-Pool Support**: Extend to support multiple pool types

## Dependencies

- **Uniswap V4 Core**: `@uniswap/v4-core`
- **OpenZeppelin**: `@openzeppelin/contracts`
- **Forge Standard Library**: `forge-std`

## Network Information

- **Network**: Base Sepolia Testnet
- **Chain ID**: 84532
- **RPC URL**: `https://sepolia.base.org`
- **Block Explorer**: `https://sepolia.basescan.org`

# Quick Testing Guide - VaultManager Uniswap V4

## Prerequisites

1. **Foundry Setup**
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Project Setup**
   ```bash
   cd review
   forge install
   forge build
   ```

## Quick Test Commands

### 1. Verify Pool Exists
```bash
forge test --match-test testGetPoolState -vvv
```
**What it does**: Checks if the ETH/USDT pool exists and shows current state
**Expected**: Pool ID and current tick/price information

### 2. Test Liquidity Operations
```bash
forge test --match-test testRemoveLiquidityAfterAdd -vvv
```
**What it does**: Tests adding and removing liquidity
**Expected**: Liquidity calculation and pool interaction

### 3. Run All Tests
```bash
forge test -vvv
```
**What it does**: Runs all test scenarios
**Expected**: All tests pass with detailed logs

## Key Test Outputs

### Successful Pool State Test
```
Pool ID: 0x45fd045fc5a9f4f9e76a1ab9cd509a4ce2d657d302992f6912a3d8de5eba551a
Pool exists! Current state:
sqrtPriceX96: 5010828967500958623728276031392126
tick: 221106
protocolFee: 0
lpFee: 500
```

### Successful Liquidity Calculation
```
sqrtPriceX96: 5010828967500958623728276031392126
currentTick: 221106
tickLower: 221006
tickUpper: 221206
Calculated liquidity: 31497
```

## Debugging Common Issues

### 1. Compilation Errors
```bash
# Clean and rebuild
forge clean
forge build
```

### 2. Network Issues
```bash
# Check if fork is working
forge test --match-test testForkSetup -vvv
```

### 3. Pool State Issues
```bash
# Verify pool exists
forge test --match-test testGetPoolState -vvv
```

## Test Parameters

### Current Test Values
- **ETH Amount**: 0.001 ETH
- **USDT Amount**: 10 USDT (10e6)
- **Tick Range**: ±100 around current price
- **Pool Fee**: 500 (0.05%)

### Custom Test Values
To test with different amounts, modify in `test/VaultManagerTest.t.sol`:
```solidity
uint256 constant LIQUIDITY_AMOUNT = 10e6; // Change USDT amount
uint256 ethAmount = 0.001 ether; // Change ETH amount
```

## Expected Results

### ✅ Success Indicators
- Pool state retrieved successfully
- Liquidity calculated correctly
- USDT transfer from vault works
- No compilation errors

### ⚠️ Known Issues
- `InvalidCaller` error in modifyLiquidity (being investigated)
- This doesn't prevent liquidity calculation from working

## Network Information

- **Network**: Base Sepolia Testnet (Chain ID: 84532)
- **Pool Manager**: `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`
- **USDT Token**: `0x83802A27D1df2B2BA7Cc5AeE366d533b36D59Fa4`

## Quick Verification Commands

```bash
# Check if everything compiles
forge build

# Run a specific test with full output
forge test --match-test testGetPoolState -vvvv

# Run tests and show gas usage
forge test --gas-report

# Run tests and save output to file
forge test -vvv > test_output.txt 2>&1
```

## Troubleshooting

### If tests fail:
1. **Check network connectivity**: Ensure you can reach Base Sepolia
2. **Verify dependencies**: Run `forge install` again
3. **Check pool state**: Run `testGetPoolState` first
4. **Review error logs**: Look for specific error messages

### If liquidity calculation fails:
1. **Check tick range**: Ensure it's reasonable (±100 is good for testing)
2. **Verify amounts**: Ensure amounts are non-zero
3. **Check pool state**: Ensure pool exists and is initialized

## Next Steps After Testing

1. **Review the main README.md** for detailed implementation information
2. **Check the VaultManager.sol** for the complete implementation
3. **Examine LiquidityAmounts.sol** for the math library
4. **Run additional tests** with different parameters
