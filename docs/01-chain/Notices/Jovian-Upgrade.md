<!-- Source: https://docs.hskchain.net/docs/Notices/Jovian-Upgrade | Retrieved: 2026-10-29 | Language: English -->

# Jovian Network Upgrade

HSKChain is upgrading from the Fjord hardfork to the Jovian hardfork. This notice covers the activation schedule, the required node software versions, the updated rollup.json, the op-geth hardfork override commands, and the new features and protocols enabled by this upgrade.

Action Required:

All node operators (RPC, full, and archive nodes) must update **op-geth** and **op-node**, pull the updated **rollup.json**, and configure the op-geth hardfork override flags **before the activation time**. Nodes that are not upgraded in time will diverge from the network (chain split) and will have to re-sync.

## Overview

HSKChain will perform a network upgrade that advances the chain from the **Fjord** hardfork to the **Jovian** hardfork.

Because HSKChain is jumping across several OP Stack hardforks in a single step, this upgrade activates the following hardforks in sequence over a short window (each fork activates a few minutes after the previous one):

`Fjord` → **`Granite`** → **`Holocene`** → **`Isthmus`** → **`Jovian`**

This means node operators only perform the upgrade once, but the node software must be told the activation time of every intermediate fork.

## Activation Schedule

Both networks activate the hardforks in sequence, 5 minutes (300s) apart. All times are UTC.

* **Testnet** begins at the Granite activation, **2026-07-09 06:30:00 UTC** — all four hardforks activate in this window.
* **Mainnet** already has **Granite** active; this upgrade activates the remaining three hardforks starting **2026-07-29 06:30:00 UTC**.

| Hardfork | Testnet (UTC) | Testnet Unix | Mainnet (UTC) | Mainnet Unix |
| --- | --- | --- | --- | --- |
| Granite | 2026-07-09 06:30:00 | `1783578600` | Already active | — |
| Holocene | 2026-07-09 06:35:00 | `1783578900` | 2026-07-29 06:30:00 | `1785306600` |
| Isthmus | 2026-07-09 06:40:00 | `1783579200` | 2026-07-29 06:35:00 | `1785306900` |
| Jovian | 2026-07-09 06:45:00 | `1783579500` | 2026-07-29 06:40:00 | `1785307200` |

## Component Versions

The following software versions are required for the Jovian upgrade. These are the versions node operators must be running before the activation time.

| Component | Required Version | Docker Image |
| --- | --- | --- |
| op-geth | `v1.101605.0` | `us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101605.0` |
| op-node | `v1.16.5` | `public.ecr.aws/x7e7q5l8/op-node:v1.16.5` |

op-node image change:

The **op-node** image has moved to a new registry. Make sure your `.env` / `docker-compose` uses `public.ecr.aws/x7e7q5l8/op-node:v1.16.5` (not the previous `us-docker.pkg.dev/...` image). The version tag (`v1.16.5`) is unchanged.

## Required Actions for Node Operators

### 1. Update the node software versions

Update the image tags in your `.env` file (see the [RPC & Node Provider](../Build-on-HashKey-Chain/RPC-Node-Provider.md) guide for the full configuration):

```bash
# execution layer
GETH_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101605.0
# consensus layer (new ECR image)
NODE_IMAGE=public.ecr.aws/x7e7q5l8/op-node:v1.16.5
```

### 2. Update the rollup.json

The op-node rollup configuration has been updated to include the new hardfork activation times. Pull the latest `rollup.json` before restarting:

```bash
# Testnet (updated — includes Granite/Holocene/Isthmus/Jovian times)
curl -o rollup.json "https://hashkeychain.s3.ap-southeast-1.amazonaws.com/testnet/rollup.json"

# Mainnet (updated — includes Holocene/Isthmus/Jovian times; Granite already active)
curl -o rollup.json "https://hashkeychain.s3.ap-southeast-1.amazonaws.com/mainnet/rollup.json"
```

If you consume the config directly via `ROLLUP_CONFIG_URL`, no URL change is needed — the file contents at the existing URL are updated in place. Just restart op-node so it reloads the config.

### 3. Configure the op-geth hardfork overrides

Because the chain advances from Fjord all the way through Jovian, **op-geth** must be told when each intervening fork activates. op-node reads the activation times from `rollup.json`, but op-geth needs the times supplied via override flags (or baked into the genesis config).

Add the following override flags to your op-geth start command, using the activation timestamp of each fork.

**Testnet:**

```bash
op-geth \
  --override.granite=1783578600 \
  --override.holocene=1783578900 \
  --override.isthmus=1783579200 \
  --override.jovian=1783579500
```

**Mainnet** (Granite is already active, so only the remaining three forks need overrides):

```bash
op-geth \
  --override.holocene=1785306600 \
  --override.isthmus=1785306900 \
  --override.jovian=1785307200
```

Tip:

op-node reads the activation times from `rollup.json` automatically; the override flags above only need to be set on op-geth. You can confirm the exact flag names supported by your build with `op-geth --help | grep override`.

### 4. Restart and verify

```bash
docker compose up -d
docker compose logs -f
```

Confirm the upgrade is configured correctly:

* **op-node** startup logs show the correct Granite / Holocene / Isthmus / Jovian activation times.
* **op-geth** startup logs show the same activation times for each fork.
* The node continues to follow the chain head after the activation time (no reorg / divergence).

## New Features & Supported Protocols

This upgrade brings HSKChain up to date with the latest OP Stack protocol features. Below is a summary of what each activated hardfork introduces.

### Granite

* **Fault-proof hardening** — caps the input size of the `bn256Pairing` precompile and reduces the channel timeout, shrinking the fault-proof window and improving the robustness of the dispute game.

### Holocene

* **Stricter block derivation** — a simpler, stricter derivation pipeline ("strict batch ordering") that improves worst-case behavior for fault proofs and interoperability.
* **EIP-1559 configurability** — the EIP-1559 elasticity and denominator parameters become configurable via the `SystemConfig` L1 contract, allowing the gas target and gas limit to be tuned independently.
* **Fault-proof (MIPS/FPVM) contract upgrade** to support the new derivation logic.

### Isthmus (Ethereum Pectra / Prague parity)

Isthmus integrates the Ethereum **Prague (Pectra)** features into the OP Stack:

* **EIP-7702** — set-code transactions (account-abstraction capabilities for EOAs).
* **EIP-2537** — BLS12-381 curve precompiles.
* **EIP-2935** — historical block hashes available in state.
* **EIP-7623** — increased calldata cost.
* **L2 Withdrawals Root in the block header** — lowers the operational lift for chain operators and improves scalability.
* **Operator fee** — a new configurable fee parameter.

### Jovian

* **Improved rollup fee calculation** — including a configurable minimum base fee via `SystemConfig`.
* **Block header updates** supporting the new fee model.
* **Fault proof virtual machine (FPVM) maintenance update.**

## Need Help?

If you run into issues during the upgrade, reach out on the [HSKChain Discord](https://discord.com/invite/V7kypNm9cS). For the full node setup and configuration templates, see the [RPC & Node Provider](../Build-on-HashKey-Chain/RPC-Node-Provider.md) guide.

[PreviousDeveloper QuickStart](../Developer-QuickStart.md)

[NextNetwork Info](../Build-on-HashKey-Chain/network-info.md)
