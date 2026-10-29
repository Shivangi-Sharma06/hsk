<!-- Source: https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Tools/Faucet | Retrieved: 2026-10-29 | Language: English -->

# Faucets

Obtain test tokens for development and testing on HSKChain networks

Faucets are essential tools for blockchain developers, allowing you to obtain free test tokens for development, testing, and deployment on test networks. HSKChain provides faucet options for both direct testnet HSK acquisition and bridged tokens.

## HSKChain Testnet Faucet

[HSKChain Testnet Faucet (faucet.hsk.xyz)](https://faucet.hsk.xyz/faucet)

The official HSKChain Testnet Faucet provides free HSK tokens for development and testing. These tokens have no real-world value but allow you to interact with the network without spending real assets.

### Usage Instructions

1. Connect your wallet to the HSKChain Testnet
2. Visit the faucet website and enter your wallet address
3. Complete any verification steps if required
4. Receive testnet HSK directly to your wallet
5. Use these tokens for deploying contracts and sending transactions

Rate Limits:

The HSKChain Testnet Faucet may have request limits to prevent abuse. If you need a larger amount of testnet tokens for development purposes, please contact the HSKChain team directly.

## Alternative: Bridge Method

For developers who need a larger quantity of testnet tokens or who are already working with Sepolia testnet, HSKChain offers a bridge option.

### Step-by-Step Bridge Process

1. **Acquire Sepolia ETH**  
   Obtain Sepolia ETH from a [Sepolia Faucet](https://www.alchemy.com/faucets) or other provider. Sepolia is an Ethereum testnet commonly used for development.
2. **Convert to Wrapped ETH (WETH)**  
   Convert your Sepolia ETH to [Wrapped ETH (WETH)](https://sepolia.etherscan.io/token/0x7b79995e5f793a07bc00c21412e50ecae098e7f9#writeContract) using the contract's `deposit()` function.
3. **Bridge Your Tokens**  
   Use the [HSKChain Testnet Bridge](https://testnet-bridge.hashkeychain.net/) to transfer your WETH from Sepolia to HSKChain Testnet.
4. **Receive Testnet HSK**  
   After the bridge transaction completes, you'll receive testnet HSK on HSKChain Testnet, which can be used for all testing and development activities.

```javascript
// Example: Depositing ETH into WETH contract on Sepolia
const wethContract = new ethers.Contract(
  "0x7b79995e5f793a07bc00c21412e50ecae098e7f9",
  wethAbi,
  signer
);

// Convert 0.1 ETH to WETH
const tx = await wethContract.deposit({ value: ethers.utils.parseEther("0.1") });
await tx.wait();
console.log("Successfully wrapped 0.1 ETH to WETH on Sepolia");
```

## Best Practices for Faucet Usage

> **Development Environment**: Create separate development wallets for testing purposes to keep test tokens separate from your main wallets.

> **Resource Conservation**: Use testnet resources responsibly. Only request tokens when needed, and recycle existing testnet tokens by sending them back to your own accounts for reuse.

> **Transaction Testing**: Start with small transactions to verify functionality before submitting larger transactions or complex contract deployments.

For specific questions about obtaining larger amounts of testnet tokens or issues with the faucet, please reach out to the HSKChain developer support team.

[PreviousWallets](Wallet.md)

[NextSafe](Safe.md)
