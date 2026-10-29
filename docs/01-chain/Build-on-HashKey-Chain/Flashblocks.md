<!-- Source: https://docs.hskchain.net/docs/Build-on-HashKey-Chain/Flashblocks | Retrieved: 2026-10-29 | Language: English -->

# Flashblocks

Flashblocks stream preconfirmed, partial blocks over WebSocket roughly every 200ms — much faster than waiting for a full block. This page lists the HSKChain Flashblocks endpoint and how to connect.

## Overview

Flashblocks are partial blocks streamed by the sequencer roughly every 200ms, before a full block is sealed. By subscribing to the Flashblocks WebSocket stream, applications can observe preconfirmed transactions and state changes with much lower latency than the normal block time.

## WebSocket Endpoint

| Network | WebSocket URL |
| --- | --- |
| HSKChain Testnet | `wss://testnet-flashblocks.hsk.xyz/ws` |

Availability:

The Flashblocks proxy is currently available on HSKChain Testnet only.

## Connecting

You can connect to the stream with any WebSocket client. For a quick test using [websocat](https://github.com/vi/websocat):

```bash
websocat wss://testnet-flashblocks.hsk.xyz/ws
```

Or from Node.js using the `ws` package:

```javascript
import WebSocket from "ws";

const ws = new WebSocket("wss://testnet-flashblocks.hsk.xyz/ws");

ws.on("message", (data) => {
  const flashblock = JSON.parse(data.toString());
  console.log(flashblock);
});
```

The stream emits a new Flashblock payload approximately every 200ms. Each message contains the incremental block diff (state root, block hash, transactions, gas used); the first Flashblock of each block (`index: 0`) also includes the full block header.

Payload schema:

HSKChain Flashblocks follow the OP Stack Flashblocks format. For the full message schema, see the [Base Flashblocks API reference](https://docs.base.org/base-chain/api-reference/flashblocks-api/flashblocks-api-overview).

[PreviousRPC & Node Provider](RPC-Node-Provider.md)

[NextWelcome](../Learn/Welcome.md)
