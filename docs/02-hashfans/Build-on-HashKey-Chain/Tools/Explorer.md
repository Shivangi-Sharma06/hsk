<!-- Source: https://hashfans.io/docs/Build-on-HashKey-Chain/Tools/Explorer | Retrieved: 2026-10-29 | Language: English -->

## BlockScout Explorer

[BlockScout Explorer (hashkey.blockscout.com)](https://hashkey.blockscout.com)

BlockScout provides a comprehensive set of tools for HashKey Chain developers:

### Key Features

| Feature | Description |
|---------|-------------|
| **Smart Contract Interaction** | View, verify, and interact with smart contract source code directly through the explorer interface. |
| **Transaction Analysis** | Inspect detailed transaction data including execution traces, logs, and gas usage. |
| **Token Tracking** | Monitor ERC-20, ERC-721, and ERC-1155 token transfers and balances across addresses. |
| **API Access** | Access blockchain data programmatically through GraphQL and REST API endpoints. |

<Note title="Testnet Explorer">
  For developers working with HashKey Chain Testnet, a dedicated explorer is available at [https://testnet-explorer.hsk.xyz](https://testnet-explorer.hsk.xyz)
</Note>

## OKLink Explorer

[OKLink Explorer (oklink.com/hashkey)](https://www.oklink.com/zh-hans/hashkey)

OKLink is a multi-chain blockchain explorer that provides advanced analytics and data insights for HashKey Chain users:

### Key Features

1. **Comprehensive Data Access**  
   Search by address, transaction hash, block number, or token identifier to quickly locate on-chain information.

2. **Contract Verification**  
   Verify smart contract source code and interact with contract functions directly through the explorer interface.

3. **Real-time Analytics**  
   Access a comprehensive and real-time stream of on-chain data, including large transactions and significant fund movements.

4. **Address Labeling**  
   View contextual labels for addresses (projects, contracts, risk assessment, blacklisted addresses) to understand the ecosystem better.

## Developer Integration

Block explorers provide valuable resources for developers building on HashKey Chain:

```typescript
// Example: Constructing a link to a transaction on BlockScout
const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const blockscoutUrl = `https://hashkey.blockscout.com/tx/${txHash}`;

// Example: Constructing a link to a contract on OKLink
const contractAddress = "0xabcdef1234567890abcdef1234567890abcdef1234";
const oklinkUrl = `https://www.oklink.com/zh-hans/hashkey/address/${contractAddress}`;
```

*Shared source content: see [01-chain/Build-on-HashKey-Chain/Tools/Explorer.md](../../../01-chain/Build-on-HashKey-Chain/Tools/Explorer.md).*

*Shared source content: see [01-chain/Build-on-HashKey-Chain/Tools/Explorer.md](../../../01-chain/Build-on-HashKey-Chain/Tools/Explorer.md).*
