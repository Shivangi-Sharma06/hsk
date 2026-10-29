<!-- Source: https://docs.hskchain.net/docs/Developer-QuickStart | Retrieved: 2026-10-29 | Language: English -->

# 

# Developer QuickStart

With HSKChain, you can use familiar Ethereum development tools since it maintains EVM compatibility. Your existing smart contract development and testing tools will work seamlessly - you'll just need to point them to a HSKChain RPC Provider.

## Acquiring Native Token

HSKChain uses HSK as its native currency, which is needed to pay transaction fees for deploying and interacting with the network.

To start building on HSKChain, we recommend beginning with the HSKChain Testnet. You'll first need to:

1. Acquire some Sepolia ETH from a Sepolia faucet
2. Bridge your tokens to HSKChain Testnet using our bridge interface
3. You'll receive testnet HSK for development and testing

## Network Configuration

### HSKChain Testnet

Use the table below to configure your Ethereum tools to the HSKChain Testnet:

| Network Name | HSKChain Testnet | Ethereum Sepolia |
| --- | --- | --- |
| RPC URL | <https://testnet.hsk.xyz> | <https://rpc2.sepolia.org> |
| Chain ID | 133 | 11155111 |
| Currency Symbol | HSK | ETH |
| Block Explorer URL | <https://testnet-explorer.hsk.xyz> | <https://sepolia.etherscan.io> |

## Configure your tooling

### Hardhat

Modify your Hardhat config file `hardhat.config.ts`:

```typescript
const config: HardhatUserConfig = {
  networks: {
    hashkeyTestnet: {
      url: "https://testnet.hsk.xyz" || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 133
    },
  },
};
```

### Foundry

To deploy using the HSKChain Testnet, run:

```bash
forge create ... --rpc-url=https://testnet.hsk.xyz --chain-id 133
```

### Remix Web IDE

1. Set up MetaMask with HSKChain Testnet using these parameters:
   * Network Name: HSKChain Testnet
   * RPC URL: <https://testnet.hsk.xyz>
   * Chain ID: 133
   * Currency Symbol: HSK
2. In Remix's "Deploy and Run Transactions" tab, select "Injected Provider - MetaMask"
3. Connect your wallet and select the HSKChain Testnet
4. Deploy your contract

### Truffle

Configure your `truffle.js`:

```javascript
const HDWalletProvider = require("@truffle/hdwallet-provider")

module.exports = {
  networks: {
    hashkeyTestnet: {
      provider: () =>
        new HDWalletProvider(process.env.PRIVATE_KEY, "https://testnet.hsk.xyz"),
      network_id: 133,
    },
  }
}
```

### ethers.js

Set up a HSKChain Testnet provider:

```javascript
import { ethers } from "ethers"

const provider = new ethers.providers.JsonRpcProvider("https://testnet.hsk.xyz")
```

## Additional Resources

* Visit our documentation portal for detailed guides
* Check out the block explorer at <https://hashkey.blockscout.com> to verify transactions and contracts
* Use our bridge interface to move tokens between Ethereum Sepolia and HSKChain Testnet

[PreviousAbout HSKChain](About-HashKey-Chain.md)

[NextJovian Network Upgrade](Notices/Jovian-Upgrade.md)
