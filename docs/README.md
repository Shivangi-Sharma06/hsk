# HashKey documentation library

Retrieved 2026-10-29. English documentation collected for this project.

Start with [project research notes](PROJECT-NOTES.md). Current project design: [PRD](../prd.md), [architecture](../architecture.md), [execution plan](../implementation.md), [loophole review](planning/loopholes.md), [HSP integration](planning/hsp-integration.md), [UI](planning/ui.md), and [verification](planning/verification.md). [Source manifest](sources.json) records every page, source URL, SHA-256, aliases and retrieval failures.

## Reading order

1. Merchant onboarding, authentication, cart mandate, API, webhooks and appendix.
2. Chain network settings, tokens, deployed contracts and developer tools.
3. HashFans HSP guide and additional chain/learning material.
4. Chainlink CCIP configuration if cross-chain functionality is needed.

## Collection rules

- Chain and merchant primary documentation take precedence over the HashFans mirror when facts differ; differences remain visible for review.
- Exact duplicate pages are indexed as aliases. Repeated text blocks link to the first stored occurrence. Similar topics with different content remain separate to avoid losing details.
- English editions are used; source spelling, examples and identifiers are preserved.
- This is a dated snapshot. Recheck addresses, endpoints, supported networks, authentication and fee settings before deployment.
- Only the supplied HashKey CCIP directory entry is collected, not all unrelated Chainlink documentation.
- HashFans URLs are reconstructed from embedded document IDs; its content was extracted from the JavaScript loaded by https://hashfans.io/docs.
- Merchant Markdown URLs are the source backing its English Docsify routes.

## Contents

### 01-chain

- [](01-chain/Build-on-HashKey-Chain/network-info.md)
- [](01-chain/About-HashKey-Chain.md)
- [](01-chain/Developer-QuickStart.md)
- [Jovian Network Upgrade](01-chain/Notices/Jovian-Upgrade.md)
- [Token Contracts](01-chain/Build-on-HashKey-Chain/Token-Contracts.md)
- [Contract Addresses](01-chain/Build-on-HashKey-Chain/Contract-Addresses.md)
- [Block Explorer](01-chain/Build-on-HashKey-Chain/Tools/Explorer.md)
- [Wallet](01-chain/Build-on-HashKey-Chain/Tools/Wallet.md)
- [Faucets](01-chain/Build-on-HashKey-Chain/Tools/Faucet.md)
- [Safe](01-chain/Build-on-HashKey-Chain/Tools/Safe.md)
- [Oracles](01-chain/Build-on-HashKey-Chain/Tools/Oracle.md)
- [](01-chain/Build-on-HashKey-Chain/Tools/Bridges.md)
- [](01-chain/Build-on-HashKey-Chain/Tools/KYC.md)
- [Using Subgraph on HSKChain](01-chain/Build-on-HashKey-Chain/Tools/Subgraph.md)
- [Transaction Fees](01-chain/Build-on-HashKey-Chain/Fee.md)
- [RPC & Node Provider](01-chain/Build-on-HashKey-Chain/RPC-Node-Provider.md)
- [Flashblocks](01-chain/Build-on-HashKey-Chain/Flashblocks.md)
- [](01-chain/Learn/Welcome.md)
- [](01-chain/Learn/Bitcoin-and-Blockchain.md)
- [](01-chain/Learn/Ethereum-More/Introduction.md)
- [](01-chain/Learn/Ethereum-More/Ethereum-Technology.md)
- [](01-chain/Learn/Ethereum-More/Ethereum-Applications.md)
- [](01-chain/Learn/Ethereum-More/Gas-Fee-Calculation.md)
- [](01-chain/Learn/Ethereum-More/Explorer-Wallet.md)
- [](01-chain/Knowledge.md)
- [](01-chain/Knowledge/layer-1.md)
- [](01-chain/Knowledge/layer-2.md)
- [](01-chain/Knowledge/pow.md)
- [](01-chain/Knowledge/pos.md)
- [](01-chain/Knowledge/dpos.md)
- [](01-chain/Knowledge/poa.md)
- [](01-chain/Knowledge/smart-contracts.md)
- [](01-chain/Knowledge/evm.md)
- [](01-chain/Knowledge/gas.md)
- [](01-chain/Knowledge/erc20.md)
- [](01-chain/Knowledge/nft.md)
- [](01-chain/Knowledge/defi.md)
- [](01-chain/Knowledge/optimistic-rollups.md)
- [](01-chain/Knowledge/zk-rollups.md)
- [](01-chain/Knowledge/ens.md)

### 02-hashfans

- [About HashKey Chain](02-hashfans/About-HashKey-Chain.md)
- [Developer QuickStart](02-hashfans/Developer-QuickStart.md)
- [Network Info](02-hashfans/Build-on-HashKey-Chain/network-info.md)
- [Explorer](02-hashfans/Build-on-HashKey-Chain/Tools/Explorer.md)
- [Wallets](02-hashfans/Build-on-HashKey-Chain/Tools/Wallet.md)
- [Faucet](02-hashfans/Build-on-HashKey-Chain/Tools/Faucet.md)
- [Safe](02-hashfans/Build-on-HashKey-Chain/Tools/Safe.md)
- [Oracle](02-hashfans/Build-on-HashKey-Chain/Tools/Oracle.md)
- [Bridges](02-hashfans/Build-on-HashKey-Chain/Tools/Bridges.md)
- [KYC](02-hashfans/Build-on-HashKey-Chain/Tools/KYC.md)
- [Subgraph](02-hashfans/Build-on-HashKey-Chain/Tools/Subgraph.md)
- [Fee](02-hashfans/Build-on-HashKey-Chain/Fee.md)
- [RPC & Node Provider](02-hashfans/Build-on-HashKey-Chain/RPC-Node-Provider.md)
- [Welcome](02-hashfans/Learn/Welcome.md)
- [Bitcoin-and-Blockchain](02-hashfans/Learn/Bitcoin-and-Blockchain.md)
- [Introduction](02-hashfans/Learn/Ethereum-More/Introduction.md)
- [Ethereum-Technology](02-hashfans/Learn/Ethereum-More/Ethereum-Technology.md)
- [Ethereum-Applications](02-hashfans/Learn/Ethereum-More/Ethereum-Applications.md)
- [Gas-Fee-Calculation](02-hashfans/Learn/Ethereum-More/Gas-Fee-Calculation.md)
- [Explorer-Wallet](02-hashfans/Learn/Ethereum-More/Explorer-Wallet.md)
- [Blockchain](02-hashfans/Knowledge/blockchain.md)
- [Cross Chain Bridge](02-hashfans/Knowledge/Cross-Chain-Bridge.md)
- [Cryptography](02-hashfans/Knowledge/cryptography.md)
- [Dao](02-hashfans/Knowledge/dao.md)
- [Defi](02-hashfans/Knowledge/defi.md)
- [Dpos](02-hashfans/Knowledge/dpos.md)
- [Ens](02-hashfans/Knowledge/ens.md)
- [Erc20](02-hashfans/Knowledge/erc20.md)
- [Ethereum Merge](02-hashfans/Knowledge/ethereum-merge.md)
- [Evm](02-hashfans/Knowledge/evm.md)
- [Gas](02-hashfans/Knowledge/gas.md)
- [Gas Optimization](02-hashfans/Knowledge/Gas-optimization.md)
- [Layer 1](02-hashfans/Knowledge/layer-1.md)
- [Layer 2](02-hashfans/Knowledge/layer-2.md)
- [Merkle Tree](02-hashfans/Knowledge/merkle-tree.md)
- [Nft](02-hashfans/Knowledge/nft.md)
- [Optimistic Rollups](02-hashfans/Knowledge/optimistic-rollups.md)
- [Patricia Trie](02-hashfans/Knowledge/Patricia-Trie.md)
- [Percent Attack](02-hashfans/Knowledge/51-percent-attack.md)
- [Poa](02-hashfans/Knowledge/poa.md)
- [Pos](02-hashfans/Knowledge/pos.md)
- [Pow](02-hashfans/Knowledge/pow.md)
- [Reentrancy Attack](02-hashfans/Knowledge/Reentrancy-Attack.md)
- [Risc V](02-hashfans/Knowledge/risc-v.md)
- [Rollups](02-hashfans/Knowledge/rollups.md)
- [RPC](02-hashfans/Knowledge/RPC.md)
- [Smart Contracts](02-hashfans/Knowledge/smart-contracts.md)
- [Zk Proofs](02-hashfans/Knowledge/zk-proofs.md)
- [Zk Rollups](02-hashfans/Knowledge/zk-rollups.md)
- [Zk Snark](02-hashfans/Knowledge/zk-snark.md)
- [Zk Stark](02-hashfans/Knowledge/zk-stark.md)
- [Knowledge](02-hashfans/Knowledge.md)
- [Building on HSP — Developer Guide](02-hashfans/HSP.md)

### 03-merchant

- [HashKey Merchant](03-merchant/README.md)
- [Building a Cart Mandate](03-merchant/cart-mandate.md)
- [API reference](03-merchant/api-reference.md)
- [Merchant onboarding](03-merchant/onboarding.md)
- [Authentication & signing](03-merchant/authentication.md)
- [Webhook payment notifications](03-merchant/webhook.md)
- [Appendix](03-merchant/appendix.md)

### 04-chainlink

- [HashKey Chain CCIP mainnet](04-chainlink/hashkey-mainnet.md)

## Retrieval issues

[
  {
    "url": "https://docs.hskchain.net/docs/Learn/Ethereum%20More/Ethereum%20Dev",
    "error": "404 Client Error: Not Found for url: https://docs.hskchain.net/docs/Learn/Ethereum%20More/Ethereum%20Dev"
  }
]
