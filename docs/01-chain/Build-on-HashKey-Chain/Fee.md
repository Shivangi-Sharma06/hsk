<!-- Source: https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Fee | Retrieved: 2026-10-29 | Language: English -->

# Transaction Fees

Understanding and optimizing transaction costs on HSKChain

HSKChain employs a dual-fee structure that provides the security of Ethereum while maintaining cost efficiency. Understanding how fees work is essential for developers building applications on the network.

## Fee Structure Overview

Every transaction on HSKChain includes two distinct cost components, each serving a different purpose in the network's architecture:

| Fee Component | Purpose | Variability | Primary Factor |
| --- | --- | --- | --- |
| L2 Execution Fee | Processing transactions on HSKChain | Medium | HSKChain network congestion |
| L1 Security Fee | Publishing data to Ethereum mainnet | High | Ethereum gas prices |

### L1 Security Fee

The L1 Security Fee represents the cost of posting transaction data to Ethereum mainnet, which is essential for HSKChain's security model as a Layer 2 solution.

#### Key Characteristics

* Fluctuates significantly based on Ethereum mainnet gas prices
* Often constitutes the larger portion of the total transaction cost
* Calculated based on the data size of your transaction
* Benefits from Ethereum's data compression techniques

### L2 Execution Fee

The L2 Execution Fee covers the computational resources required to execute your transaction on HSKChain itself.

#### Key Characteristics

* Based on a gas model similar to Ethereum
* Typically more stable and predictable than L1 fees
* Adjusts dynamically based on HSKChain network utilization
* Generally much lower than equivalent transactions on Ethereum mainnet

[PreviousSubgraph](Tools/Subgraph.md)

[NextRPC & Node Provider](RPC-Node-Provider.md)
