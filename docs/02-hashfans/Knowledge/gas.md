<!-- Source: https://hashfans.io/docs/Knowledge/gas | Retrieved: 2026-10-29 | Language: English -->

# Gas in Ethereum

*Shared source content: see [01-chain/Knowledge/gas.md](../../01-chain/Knowledge/gas.md).*

## Purpose of Gas

- **Resource Allocation**: Ensures fair distribution of network resources
- **Spam Prevention**: Discourages malicious actors from flooding the network
- **Miner/Validator Compensation**: Provides incentives for transaction processing
- **Finite Computation**: Prevents infinite loops and resource exhaustion

## How Gas Works

*Shared source content: see [01-chain/Knowledge/gas.md](../../01-chain/Knowledge/gas.md).*

| Operation | Approximate Gas Cost |
|-----------|----------------------|
| Addition | 3 gas |
| Multiplication | 5 gas |
| Storage write | 20,000+ gas |
| Contract creation | 32,000+ gas |

When sending a transaction, users specify:

*Shared source content: see [01-chain/Knowledge/gas.md](../../01-chain/Knowledge/gas.md).*

*Shared source content: see [01-chain/Knowledge/gas.md](../../01-chain/Knowledge/gas.md).*

## Gas Price Dynamics

Gas prices fluctuate based on network demand, following a market mechanism:

- **High Demand**: Gas prices increase during periods of network congestion
- **Low Demand**: Gas prices decrease when network activity is light

The minimum gas price is determined by:
- **Base Fee**: Algorithmically set by the network based on block fullness
- **Priority Fee**: User-defined tip to validators for faster inclusion

## EIP-1559: Fee Market Change

In August 2021, Ethereum implemented EIP-1559, dramatically changing the fee structure:

- **Base Fee**: Automatically adjusted based on network congestion
- **Burning Mechanism**: Base fee is burned (removed from circulation)
- **More Predictable Fees**: Reduces extreme price volatility
- **Improved User Experience**: Simplifies gas price estimation

## Gas Optimization Techniques

Developers use various techniques to minimize gas costs:

- **Efficient Storage**: Using packed variables and optimized data structures
- **Batch Processing**: Combining multiple operations into a single transaction
- **Gas Tokens**: Tokenizing gas during low-price periods for later use
- **Off-chain Computation**: Moving computation off-chain when possible
- **Assembly**: Using low-level assembly for gas-intensive operations

## Gas Calculation Example

For a simple ERC-20 token transfer:

*Shared source content: see [01-chain/Knowledge/gas.md](../../01-chain/Knowledge/gas.md).*

## Gas in Layer 2 Solutions

Layer 2 solutions significantly reduce gas costs by batching transactions:

- **Optimistic Rollups**: ~10x gas reduction
- **ZK Rollups**: ~20-50x gas reduction
- **State Channels**: Near-zero gas costs for supported operations

*Shared source content: see [01-chain/Knowledge/gas.md](../../01-chain/Knowledge/gas.md).*
