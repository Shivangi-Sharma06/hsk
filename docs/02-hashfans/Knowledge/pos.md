<!-- Source: https://hashfans.io/docs/Knowledge/pos | Retrieved: 2026-10-29 | Language: English -->

# Proof-of-Stake (PoS)

## Introduction

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

## How Proof-of-Stake Operates

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

## Key Concepts in PoS

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

## Comparison: PoS vs. PoW

| Feature           | Proof-of-Work (PoW)                         | Proof-of-Stake (PoS)                                  |
| :---------------- | :------------------------------------------ | :---------------------------------------------------- |
| **Resource Used** | Computational Power (Hashing)               | Capital (Staked Cryptocurrency)                       |
| **Security Basis**| Cost of energy & hardware                  | Value of staked collateral & slashing risk            |
| **Attack Vector** | 51% of Network Hashrate                   | Controlling significant portion (>33% or >50%) of Stake |
| **Energy Use**    | Extremely High                              | Very Low (estimated >99% reduction vs PoW)            |
| **Hardware Req.** | Often requires specialized ASICs            | General purpose hardware (servers)                    |
| **Centralization**| Risk via Mining Pools & Hardware Mfrs.      | Risk via Wealth Concentration & Exchanges Staking     |
| **Incentive**     | Block Rewards + Transaction Fees           | Staking Rewards (Fees +/- Inflation)                  |
| **Penalty**       | Wasted computation/energy                   | Slashing (Loss of Staked Capital)                     |

## Ethereum and The Merge

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

## Variations of Proof-of-Stake

PoS is a broad category, and several variations exist:

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

## Relevance to HashKey Chain

Proof-of-Stake is **highly relevant** to HashKey Chain. According to the provided documentation (`https://documentation-1oqt.vercel.app/docs/About-HashKey-Chain`), HashKey Chain utilizes a combination of **Proof of Stake (PoS)** and **Proof of Authority (PoA)**.

*   **PoS Component:** This implies that validators on the HashKey Chain network are required to stake HSK tokens (the native asset) as collateral. Their participation, potential rewards, and risk of slashing are likely tied to this stake.
*   **PoA Component:** Proof of Authority means that validators are not just chosen based on stake, but they are also pre-approved, known entities considered trustworthy ('Authorities'). This creates a more permissioned or consortium-like structure compared to fully permissionless PoS networks.
*   **Hybrid Benefits:** This hybrid approach aims to combine the energy efficiency and validator incentives of PoS with the potentially higher performance and controlled security environment of PoA, often suitable for enterprise or regulated use cases.

## Code Examples (Conceptual)

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

**1. Staking (Conceptual Smart Contract Interaction):**

```solidity
// Very simplified concept - Real staking is much more complex!
interface StakingContract {
    // Function to deposit and stake HSK tokens
    function depositAndStake(uint256 amount) external payable;

    // Function to signal intent to withdraw stake (often involves unbonding period)
    function unstake(uint256 amount) external;

    // Function for validators to withdraw unlocked stake
    function withdrawStake() external;

    // Function to check a validator's stake
    function getValidatorStake(address validator) external view returns (uint256);
}

// A user (potential validator) interacts with the staking contract:
// Assume 'hskToken' is the ERC20 contract for HSK
// Assume 'stakingContractAddress' is the address of the PoS staking contract
// 1. Approve the staking contract to spend HSK:
//    hskToken.approve(stakingContractAddress, stakeAmount);
// 2. Call the staking contract to deposit:
//    StakingContract(stakingContractAddress).depositAndStake{value: msg.value}(stakeAmount); // msg.value if native token staking
```

**2. Slashing (Conceptual Event):**

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

```solidity
// Solidity event that might be emitted by a slashing mechanism contract
contract SlashingMechanism {
    event ValidatorSlashed(address indexed validator, uint256 amountSlashed, bytes reason);

    function reportMisbehavior(address validator, bytes memory evidence) public {
        // ... Complex logic to verify evidence ...
        if (isMalicious(evidence)) {
            uint256 stakedAmount = getValidatorStake(validator);
            uint256 penalty = calculatePenalty(stakedAmount, evidence);

            // ... Logic to burn or redistribute slashed funds ...
            decreaseValidatorStake(validator, penalty);

            emit ValidatorSlashed(validator, penalty, evidence);
        }
    }
    // ... other functions ...
}
```

## Advantages of PoS

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*

## Disadvantages and Challenges of PoS

*Shared source content: see [01-chain/Knowledge/pos.md](../../01-chain/Knowledge/pos.md).*
