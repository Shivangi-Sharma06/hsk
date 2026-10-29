<!-- Source: https://hashfans.io/docs/Knowledge/zk-rollups | Retrieved: 2026-10-29 | Language: English -->

# ZK Rollups

*Shared source content: see [01-chain/Knowledge/zk-rollups.md](../../01-chain/Knowledge/zk-rollups.md).*

## Core Mechanism

ZK Rollups combine two key technologies:
1. **Rollups**: Batching multiple transactions together and processing them off-chain
2. **Zero-Knowledge Proofs**: Cryptographic methods to prove the validity of statements without revealing all underlying data

## How ZK Rollups Work

### Transaction Processing Flow

*Shared source content: see [01-chain/Knowledge/zk-rollups.md](../../01-chain/Knowledge/zk-rollups.md).*

### Types of Zero-Knowledge Proofs

ZK Rollups typically use one of two main proof systems:

- **zk-SNARKs** (Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge):
  - More compact proofs (typically < 1KB)
  - Faster verification time
  - Requires a trusted setup ceremony
  - Used by: zkSync (Era), Polygon zkEVM

- **zk-STARKs** (Zero-Knowledge Scalable Transparent Arguments of Knowledge):
  - Larger proof sizes but no trusted setup required
  - Post-quantum secure
  - More computationally intensive to verify
  - Used by: StarkNet, zkSync Era (for some operations)

## Technical Components

### Smart Contracts

- **Verifier Contract**: Verifies the validity of zero-knowledge proofs
- **State Contract**: Stores the current state root of the rollup
- **Bridge Contract**: Manages deposits and withdrawals between L1 and L2

### Data Structures

- **Merkle/Verkle Trees**: Efficient representation of the rollup state
- **Transaction Encoding**: Compressed format for storing transaction data
- **Circuit Architecture**: The computational model for proof generation

## Advantages

- **Immediate Finality**: Once a proof is verified on-chain, transactions are final
- **No Withdrawal Delays**: Users can withdraw funds immediately after proof verification
- **Higher Throughput**: 1,000-4,000+ transactions per second (TPS)
- **Lower Costs**: 10-50x cheaper than Layer 1 transactions
- **Strong Privacy Potential**: Can support private transactions (though most implementations don't utilize this)
- **Data Compression**: Efficient data encoding reduces on-chain storage requirements

## Limitations

- **Computational Intensity**: Generating zero-knowledge proofs requires significant computing resources
- **EVM Compatibility Challenges**: Adapting the EVM to ZK proof systems is complex
- **Proof Generation Latency**: Blocks may take minutes to finalize due to proof generation time
- **Specialized Hardware**: Optimal performance may require specialized hardware for proof generation
- **Complex Implementation**: More technically challenging than other scaling solutions

## Major Implementations

### zkSync

- Developed by Matter Labs
- zkSync Era: Full EVM-compatible ZK Rollup
- Uses PLONK-based SNARKs for proof generation
- Recursive proofs for improved scalability
- Native account abstraction support

### StarkNet

- Developed by StarkWare
- Uses Cairo programming language
- STARK-based proof system with no trusted setup
- Account abstraction and custom contract deployment
- Governance through the StarkNet Foundation

### Polygon zkEVM

- Full EVM-equivalent ZK Rollup
- Type 2 zkEVM following the Ethereum Yellow Paper
- Developed by Polygon Labs
- Uses custom proof system with optimized circuits
- Community governance via Polygon ecosystem

## Current and Emerging Applications

- **DeFi Protocols**: Decentralized exchanges, lending platforms
- **NFT Marketplaces**: Lower-cost minting and trading
- **Gaming**: High-throughput applications with immediate finality
- **Enterprise Solutions**: Applications requiring privacy and scalability
- **Identity Systems**: Zero-knowledge proofs for selective disclosure

## Future Developments

The ZK Rollup ecosystem continues to evolve with:

- **Fully EVM-Compatible ZK Circuits**: Complete Ethereum compatibility
- **Recursion Techniques**: Using proofs to verify other proofs, enabling greater scaling
- **Proof Aggregation**: Validating multiple rollups with a single proof
- **Cross-Rollup Interoperability**: Communication protocols between different ZK Rollups
- **Privacy-Preserving Features**: Enhanced confidentiality for transactions and smart contracts

*Shared source content: see [01-chain/Knowledge/zk-rollups.md](../../01-chain/Knowledge/zk-rollups.md).*
