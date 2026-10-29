<!-- Source: https://hashfans.io/docs/Knowledge/optimistic-rollups | Retrieved: 2026-10-29 | Language: English -->

# Optimistic Rollups

*Shared source content: see [01-chain/Knowledge/optimistic-rollups.md](../../01-chain/Knowledge/optimistic-rollups.md).*

## Core Mechanism

*Shared source content: see [01-chain/Knowledge/optimistic-rollups.md](../../01-chain/Knowledge/optimistic-rollups.md).*

## How Optimistic Rollups Work

### Transaction Processing Flow

*Shared source content: see [01-chain/Knowledge/optimistic-rollups.md](../../01-chain/Knowledge/optimistic-rollups.md).*

### Fraud Proof System

When a validator suspects a fraudulent state transition:

*Shared source content: see [01-chain/Knowledge/optimistic-rollups.md](../../01-chain/Knowledge/optimistic-rollups.md).*

## Technical Components

### Smart Contracts

- **Bridge Contract**: Manages deposits and withdrawals between L1 and L2
- **State Commitment Chain**: Stores sequential state roots (Merkle roots)
- **Canonical Transaction Chain**: Maintains the official transaction sequence
- **Fraud Proof Contract**: Handles verification of challenges

### Data Availability

Optimistic Rollups post all transaction data on-chain as calldata, ensuring that anyone can:
- Verify the current state
- Reconstruct the state history
- Challenge invalid state transitions
- Exit the system trustlessly if needed

## Advantages

- **High Throughput**: 100-2000 transactions per second (TPS) compared to Ethereum's ~15 TPS
- **Cost Efficiency**: 3-8x lower gas fees than Layer 1
- **EVM Compatibility**: Full support for Ethereum smart contracts and tooling
- **Strong Security**: Inherits the security of the underlying Layer 1
- **Trustless Operation**: No additional trust assumptions beyond the base layer
- **Censorship Resistance**: Ability to force transaction inclusion through Layer 1

## Limitations

- **Withdrawal Delay**: Users must wait through the challenge period (typically 1-7 days) to withdraw funds
- **MEV Vulnerability**: Sequencers can potentially extract value through transaction ordering
- **Centralization Risks**: Current implementations often rely on a single sequencer
- **Liquidity Fragmentation**: Assets locked across multiple rollups create liquidity challenges
- **Fraud Proof Complexity**: Sophisticated mechanism requiring active validators to ensure security

## Major Implementations

### Optimism

- Founded by the team behind Plasma research
- Uses OVM (Optimistic Virtual Machine)
- Focuses on EVM equivalence for seamless compatibility
- Decentralized sequencer roadmap in progress
- Governed by the Optimism Collective

### Arbitrum

- Developed by Offchain Labs
- Uses AVM (Arbitrum Virtual Machine)
- Employs multi-round interactive fraud proofs
- Supports Nitro technology for improved performance
- More complex fraud proof system with multiple validators

## Future Developments

The Optimistic Rollup ecosystem continues to evolve with:

- **Decentralized Sequencing**: Moving from single sequencers to distributed sequencer networks
- **Shortened Challenge Periods**: Research into reducing withdrawal times
- **Cross-Rollup Communication**: Protocols for interoperability between different rollups
- **ZK-Hybrid Systems**: Combining aspects of Optimistic and ZK Rollups
- **Aggregated Proofs**: Validating multiple rollups with a single proof system

*Shared source content: see [01-chain/Knowledge/optimistic-rollups.md](../../01-chain/Knowledge/optimistic-rollups.md).*
