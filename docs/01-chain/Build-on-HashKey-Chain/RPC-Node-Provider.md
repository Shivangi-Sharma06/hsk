<!-- Source: https://docs.hskchain.net/docs/Build-on-HashKey-Chain/RPC-Node-Provider | Retrieved: 2026-10-29 | Language: English -->

# RPC & Node Provider

HSKChain relies on a decentralized network of RPC (Remote Procedure Call) nodes that enable developers to interact with the blockchain. This guide covers how to set up and operate your own RPC node for both mainnet and testnet environments.

## Running Your Own Node

Self-hosting a HSKChain node gives you improved reliability, privacy, and control over your blockchain interactions. The following steps will help you set up a full node using Docker.

### Prerequisites

* Git
* Docker and Docker Compose
* OpenSSL
* Access to an Ethereum L1 RPC endpoint
* Access to an Ethereum L1 Beacon endpoint
* Minimum system requirements:
  + 16GB RAM
  + 4 CPU cores
  + 1TB SSD storage (for archive node)
  + 500GB SSD storage (for full node)

### Setup Instructions

1. **Clone the repository and checkout the appropriate version**

```bash
git clone https://github.com/HSKChain/fullnode-sync
cd fullnode-sync
```

2. **Generate JWT secret**

This JWT secret is used for secure communication between the execution and consensus layers.

```bash
openssl rand -hex 32 > ./jwt/jwt.txt
```

3. **Configure environment variables**

Create a `.env` file in the root directory of the cloned repository with the appropriate configuration for either mainnet or testnet.

4. **Start the node**

```bash
docker compose up -d
```

5. **Monitor the node**

```bash
docker compose logs -f
```

Faster sync:

Syncing the execution layer from genesis can take a long time. To bootstrap op-geth from an official chaindata snapshot instead, see the **Syncing from a Snapshot** section below.

## Configuration Templates

### Mainnet Configuration

Create a `.env` file with the following content for HSKChain Mainnet, replacing `<L1_RPC_URL>` and `<BEACON_URL>` with your Ethereum mainnet endpoints:

```bash
# geth image
GETH_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101605.0
# op-l2 geth bootnodes
GETH_STATICNODES='[
    "enode://5ecd6d2054a58fa00729b73396044a35e6aceeafe58373d2f26b3f50a3934175fb56f8efa538381430889771613beaabf1177805910bbd34e4b4840320914690@mainnet-bootnodes.hsk.xyz:30615",
    "enode://bd244da2a066e15f82d4bfb7f2732c5b5bac44cefb36cefef01a4c0e87e72b42004d012c9a294b8402ebf67491777f280ffbcc93a71157921d6d358b19ddac67@mainnet-bootnodes.hsk.xyz:30616",
    "enode://a5bba6459ac3a075a4a8941478a4ef8d167460191c89632004b17e4b2d7beea52cdc1a2d376f35e996ad44ccac8db25f900700aad6991d015bdc4db072832063@mainnet-bootnodes.hsk.xyz:30617"
]'
# genesis file url link
GENESIS_URL="https://hashkeychain.s3.ap-southeast-1.amazonaws.com/mainnet/genesis.json"
# sync mode(full or snap)
GETH_SYNC_MODE=full
# gc mode(archive or full)
GC_MODE=archive
# geth http api
HTTP_API="web3,eth,net,engine"
# geth ws api
WS_API="web3,eth,net,engine"
# tx forward endpoint
SEQUENCER_HTTP=https://mainnet.hsk.xyz

# OP_NODE_LOG_LEVEL=Debug
# l1 rpc url
# node image
NODE_IMAGE=public.ecr.aws/x7e7q5l8/op-node:v1.16.5

L1_RPC=
# l1 rpc kind(standard/basic/quicknode/alchemy/erigon)
# https://docs.optimism.io/builders/node-operators/tutorials/node-from-docker
L1_RPC_KIND=standard

# l1 beacon url
L1_BEACON=

# node libp2p bootnodes dns/ip4
P2P_STATIC="/dns/mainnet-bootnodes.hsk.xyz/tcp/31329/p2p/16Uiu2HAm8itEpr6DRkQhezSWS8WsAGfiLhzv2Y6KK1k2KVGv5PJQ,/dns/mainnet-bootnodes.hsk.xyz/tcp/31330/p2p/16Uiu2HAm79eNjZYakcTmsyifeMQykwArEd6bUU6EQgf3XvCmCKSY,/dns/mainnet-bootnodes.hsk.xyz/tcp/31331/p2p/16Uiu2HAm9WzPWe3szua51vyrj3dZsez89R3fGwAfMexE5568mEyP"
# rollup config file url link
ROLLUP_CONFIG_URL="https://hashkeychain.s3.ap-southeast-1.amazonaws.com/mainnet/rollup.json"
```

### Testnet Configuration

Create a `.env` file with the following content for HSKChain Testnet, replacing `<BEACON_URL>` with your Ethereum Sepolia testnet beacon endpoint:

```bash
# geth image
GETH_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101605.0
# op-l2 geth bootnodes
GETH_STATICNODES='[
  "enode://0492e74fb10579a3c53a327ee42dc70db35e7e0aebd73793a806afccb86b30acecb8fe9d024e06bb3fd154c678926d884df3ae696c71adcbf1339a5762e19c4d@testnet-bootnodes.hsk.xyz:30303",
  "enode://dba82c6b384844a00a54ecdfcb34c209ea714072558db80512d4c65e760846d054cf3f58a826cba33b6b410498559b7e41b147dfa487f8cba3d25d2b5bb9e7bc@testnet-bootnodes.hsk.xyz:30304"
]'
# genesis file url link
GENESIS_URL="https://hashkeychain.s3.ap-southeast-1.amazonaws.com/testnet/genesis.json"
# sync mode(full or snap)
GETH_SYNC_MODE=full
# gc mode(archive or full)
GC_MODE=archive
# geth http api
HTTP_API="web3,eth,net,engine"
# geth ws api
WS_API="web3,eth,net,engine"
# tx forward endpoint
SEQUENCER_HTTP=https://testnet.hsk.xyz

# OP_NODE_LOG_LEVEL=Debug
# l1 rpc url
# node image
NODE_IMAGE=public.ecr.aws/x7e7q5l8/op-node:v1.16.5

L1_RPC=
# l1 rpc kind(standard/basic/quicknode/alchemy/erigon)
# https://docs.optimism.io/builders/node-operators/tutorials/node-from-docker
L1_RPC_KIND=standard

# l1 beacon url
L1_BEACON=
# node libp2p bootnodes dns/ip4
P2P_STATIC='/dns/testnet-bootnodes.hsk.xyz/tcp/9003/p2p/16Uiu2HAmK91SZeGrr7Tv7hKBJsNcbVjzNtZBKmGzq5hLo5AtSoHa,/dns/testnet-bootnodes.hsk.xyz/tcp/9004/p2p/16Uiu2HAmTJHvcpkC8miMRhHr9ionQtEVMbCGshmU2nv4ir5ZA68j'
# rollup config file url link
ROLLUP_CONFIG_URL="https://hashkeychain.s3.ap-southeast-1.amazonaws.com/testnet/rollup.json"
```

## Syncing from a Snapshot

Syncing a HSKChain node from genesis can take a long time — especially for an archive node. To get up and running faster, you can bootstrap your execution client — **op-geth** or **op-reth** — from an official chaindata snapshot instead of syncing the execution layer block by block.

Before you start:

These are **archive** chaindata snapshots compressed with Zstandard (`.tar.zst`), available for both **op-geth** and **op-reth**. Make sure you have `curl`, `tar`, and `zstd` installed, and enough free disk space (see the archive-node storage requirement in the Prerequisites section).

### Restore Steps

1. **Stop the node if it is already running**

```bash
docker compose down
```

2. **Download the snapshot for your network**

Choose the snapshot that matches your execution client.

**op-geth:**

```bash
# Mainnet
curl -fL -o mainnet-archive-chaindata.tar.zst \
  "$(curl -fsSL https://snapshot.hashkeychain.net/mainnet/latest.txt)"

# Testnet
curl -fL -o testnet-archive-chaindata.tar.zst \
  "$(curl -fsSL https://snapshot.hashkeychain.net/testnet/latest.txt)"
```

**op-reth:**

```bash
# Mainnet
curl -fL -o mainnet-archive-chaindata.tar.zst \
  "$(curl -fsSL https://snapshot.hashkeychain.net/mainnet/reth/latest.txt)"

# Testnet
curl -fL -o testnet-archive-chaindata.tar.zst \
  "$(curl -fsSL https://snapshot.hashkeychain.net/testnet/reth/latest.txt)"
```

op-reth data directory:

Steps 3–6 below describe the op-geth data layout (`<GETH_DATA_DIR>/geth/chaindata`). If you run op-reth, extract the snapshot into the op-reth data directory mounted in your `docker-compose.yml` instead — use the archive layout from step 3 to confirm the correct target path.

3. **Inspect the archive layout**

Check the top-level folder inside the archive so you extract it to the right place. op-geth stores its data under `<GETH_DATA_DIR>/geth/chaindata`, where `<GETH_DATA_DIR>` is the host directory mounted as the op-geth data volume in your `docker-compose.yml`.

```bash
tar --use-compress-program=zstd -tvf mainnet-archive-chaindata.tar.zst | head
```

4. **Extract the snapshot into the op-geth data directory**

```bash
# extract directly (requires a tar build with zstd support)
tar --use-compress-program=zstd -xvf mainnet-archive-chaindata.tar.zst -C <GETH_DATA_DIR>
```

If your `tar` does not support zstd, decompress first and then extract:

```bash
zstd -d mainnet-archive-chaindata.tar.zst -o chaindata.tar
tar -xvf chaindata.tar -C <GETH_DATA_DIR>
```

Placement:

The extracted data must end up at `<GETH_DATA_DIR>/geth/chaindata`. If the archive contains a top-level `geth/` folder, extract it at `<GETH_DATA_DIR>`; if it contains a `chaindata/` folder directly, extract it into `<GETH_DATA_DIR>/geth`.

5. **Ensure sync mode is `full`, then start the node**

Keep `GETH_SYNC_MODE=full` in your `.env`, then start:

```bash
docker compose up -d
```

6. **Verify the node resumes from the snapshot**

```bash
docker compose logs -f
```

op-geth should import the snapshot, resume from the snapshot's block height, and then catch up to the chain head via the P2P network.

[PreviousFee](Fee.md)

[NextFlashblocks](Flashblocks.md)
