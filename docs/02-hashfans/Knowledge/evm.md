<!-- Source: https://hashfans.io/docs/Knowledge/evm | Retrieved: 2026-10-29 | Language: English -->

# Ethereum Virtual Machine (EVM)

*Shared source content: see [01-chain/Knowledge/evm.md](../../01-chain/Knowledge/evm.md).*

## Core Functions

- **Contract Execution**: Processes smart contract code in a sandboxed environment
- **State Management**: Maintains the current state of all accounts and contracts
- **Computation Metering**: Measures computational work using "gas" to prevent infinite loops
- **Deterministic Execution**: Ensures identical outputs across all network nodes

## Technical Architecture

The EVM operates as a stack-based machine with the following components:

- **Stack**: A last-in-first-out data structure for operation processing
- **Memory**: Volatile linear memory that exists during contract execution
- **Storage**: Persistent key-value store for maintaining contract state
- **Call Data**: Input data provided with the transaction
- **Program Counter**: Tracks the current execution position in the bytecode

## EVM Bytecode

*Shared source content: see [01-chain/Knowledge/evm.md](../../01-chain/Knowledge/evm.md).*

- Arithmetic operations (ADD, SUB, MUL, DIV)
- Logical operations (AND, OR, XOR)
- Storage operations (SLOAD, SSTORE)
- Control flow operations (JUMP, JUMPI)
- Environment information access (TIMESTAMP, BLOCKHASH)

## Gas Mechanism

To prevent spam and ensure fair resource allocation, EVM uses gas:

- Each operation consumes a predefined amount of gas
- Transactions specify a gas limit and gas price
- Miners receive gas fees as compensation for processing transactions
- If execution exceeds the gas limit, it reverts with "out of gas" error
- Unused gas is refunded to the sender

## EVM Compatibility

The EVM's design has become a standard, with many blockchains now offering EVM compatibility:

- **Layer 1 EVM-Compatible Chains**: Binance Smart Chain, Avalanche C-Chain, Fantom
- **Layer 2 Solutions**: Optimism, Arbitrum, Polygon
- **Sidechains**: xDai, POA Network

*Shared source content: see [01-chain/Knowledge/evm.md](../../01-chain/Knowledge/evm.md).*

## EVM Evolution

The EVM has evolved through Ethereum Improvement Proposals (EIPs):

- **Homestead (2016)**: Initial stable version
- **Byzantium (2017)**: Added new cryptographic primitives
- **Constantinople/Petersburg (2019)**: Optimized gas costs and added bitwise shifting
- **Istanbul (2019)**: Enhanced resistance to denial-of-service attacks
- **Berlin (2021)**: Reduced gas costs for specific operations
- **London (2021)**: Introduced EIP-1559 fee market changes
- **Shanghai (2023)**: Added new EOF format and stack overflow/underflow protection

## Role in Ethereum's Scalability

*Shared source content: see [01-chain/Knowledge/evm.md](../../01-chain/Knowledge/evm.md).*

- **Stateless Ethereum**: Reducing node storage requirements
- **Execution Sharding**: Distributing computation across shards
- **Layer 2 Solutions**: Moving computation off-chain while inheriting Ethereum's security

*Shared source content: see [01-chain/Knowledge/evm.md](../../01-chain/Knowledge/evm.md).*
