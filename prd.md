# ProofBid — Product Requirements Document (PRD)

**Track:** Agent Payments & A2A Settlement (HSP)
**Chain:** HashKey Chain (HSK)
**Settlement rail:** HashKey Settlement Protocol (HSP) Gateway — https://hashkey-merchant.github.io/#/
**Version:** 1.0 (Hackathon MVP)

---

## 1. Overview

### 1.1 One-liner
ProofBid is a decentralized B2B procurement protocol that cryptographically binds an RFQ, an EIP-712 signed vendor bid, and an HSP Payment Mandate, so no funds move unless all three match exactly.

### 1.2 Problem
Autonomous agents are moving to direct Account-to-Account (A2A) settlement. On-chain transfers are instant and irreversible, which creates three systemic risks:

| Risk | Description |
|---|---|
| **Quote Drift** | Vendor wins an auction with a low quote, then submits a higher price when payment conditions are sent for mandate construction. |
| **Mandate Tampering** | Destination account or delivery terms are altered between bidding and payment. |
| **Invoice Fraud** | A compromised vendor agent presents a forged or modified invoice that the Payment Agent builds a mandate from. |

Existing protocols have **no cryptographic binding between the bidding phase and the HSP Payment Mandate**.

### 1.3 Solution
A **Cryptographic 3-Way Match** enforced before any A2A transfer:

```
RFQ  <->  EIP-712 Signed Vendor Bid  <->  HSP Payment Mandate
                     |
          bidHash committed on-chain (ProofBidRegistry.sol)
```

Plus multi-variable bid scoring, vendor bonds with slashing, and an interactive attack-simulation mode for demos.

---

## 2. Goals and Non-Goals

### 2.1 Goals
- G1. Eliminate post-selection tampering of price, payee, token, SLA or expiry.
- G2. Run the full procurement lifecycle (intent -> RFQ -> bids -> selection -> mandate -> settlement -> fulfilment) agent-to-agent.
- G3. Use the **existing HSP Gateway** for settlement. We construct mandates; we do not replace the gateway.
- G4. Make tampering **visibly fail** in a live demo (Attack Simulation Mode).
- G5. Provide on-chain, auditable vendor reputation and bond accounting.

### 2.2 Non-Goals (MVP)
- Fiat on/off-ramps.
- Multi-currency routing (USDC on HSK only).
- Decentralized arbitration or DAO governance for disputes (MVP uses a designated arbiter address).
- Partial or milestone payments (post-MVP).
- Production-grade vendor KYC.

---

## 3. Personas

| Persona | Description | Needs |
|---|---|---|
| **Enterprise Buyer** | Human operator who states procurement intent in natural language. | Cheapest *safe* deal, spend limits, audit trail. |
| **Buyer Payment Agent** | Autonomous agent that issues RFQs, scores bids, constructs and signs the mandate. | Verifiable inputs, deterministic matching. |
| **Vendor (Receiving) Agent** | Agent that quotes and delivers resources (API credits, licences, compute). | Fair auction, guaranteed payment, simple signing flow. |
| **Arbiter** (MVP) | Address authorised to confirm non-delivery and trigger slashing. | Evidence of settlement and delivery SLA. |
| **Judge / Demo Viewer** | Hackathon evaluator. | Clear demonstration of the attack being blocked. |

---

## 4. User Stories

**Buyer**
- US-1. As a buyer, I enter "Procure 50,000 LLM API credits, max 25 USDC, latency < 150ms" and the system parses it into a structured RFQ.
- US-2. As a buyer, I see all bids ranked with score breakdown (price / reputation / latency).
- US-3. As a buyer, I am guaranteed the paid amount and payee equal what the vendor signed.
- US-4. As a buyer, I can approve the mandate with my wallet signature before settlement.
- US-5. As a buyer, I get the delivered credentials automatically after settlement.

**Vendor**
- US-6. As a vendor, I register by staking a performance bond.
- US-7. As a vendor, I receive RFQs and respond with an EIP-712 signed quote.
- US-8. As a vendor, I am notified via HSP webhook when I'm paid and then release goods.

**Security / Demo**
- US-9. As a judge, I toggle "Attack Mode" and watch a vendor tamper with price/payee and see the registry reject, the mandate fail, and the bond slash.

---

## 5. Functional Requirements

### 5.1 RFQ Management (FR-1x)
| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Parse natural-language intent into RFQ JSON: `rfqId, requiredSku, quantity, maxPrice, maxLatency, expiryTimestamp`. | P0 |
| FR-1.2 | Generate unique `rfqId` (bytes32). | P0 |
| FR-1.3 | Broadcast RFQ to registered vendors via HTTP and WebSocket. | P0 |
| FR-1.4 | Reject bids received after `expiryTimestamp`. | P0 |

### 5.2 Vendor Bidding (FR-2x)
| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Vendor agent evaluates inventory/capacity and decides eligibility. | P0 |
| FR-2.2 | Vendor signs quote with EIP-712 (typed data below). | P0 |
| FR-2.3 | Quote returned with signature (v, r, s) to the Buyer Payment Agent. | P0 |
| FR-2.4 | Vendor must have an active bond in the registry to bid. | P0 |

**EIP-712 Quote struct (canonical):**
```json
{
  "rfqId": "bytes32",
  "vendorAddress": "address",
  "tokenAddress": "address",
  "unitPrice": "uint256",
  "totalAmount": "uint256",
  "slaHash": "bytes32",
  "expiry": "uint256"
}
```
Domain: `{ name: "ProofBid", version: "1", chainId: <HSK chainId>, verifyingContract: <ProofBidRegistry> }`

### 5.3 Verification and Scoring (FR-3x)
| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Recover signer from each signature and require it equals `vendorAddress`. | P0 |
| FR-3.2 | Filter bids violating budget (`totalAmount > maxPrice`), SLA latency, expiry, or blacklist. | P0 |
| FR-3.3 | Compute weighted score (see 5.3.1). | P0 |
| FR-3.4 | Show full score breakdown in UI. | P1 |

#### 5.3.1 Scoring formula
```
Score = 0.5 * PriceScore + 0.3 * ReputationScore + 0.2 * LatencyScore
```
All sub-scores normalised to [0, 1] where **higher is better**:
- `PriceScore = (minPrice / vendorPrice)` across valid bids, or `1 - (p - min)/(max - min)`
- `ReputationScore = reputation / 1000` (on-chain, capped)
- `LatencyScore = 1 - (latency / maxLatency)` (clamped to [0, 1])

> The raw formula in the idea (`0.5 x Price`) only makes sense if each term is normalised so that lower price and lower latency yield higher scores. This normalisation is a design requirement. Ties are broken by lower price, then higher reputation.

### 5.4 On-Chain Commitment (FR-4x)
| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Payment Agent computes `bidHash` (see 5.4.1). | P0 |
| FR-4.2 | Call `commitWinningBid(rfqId, bidHash, vendorAddress, totalAmount)`. | P0 |
| FR-4.3 | Contract stores commitment, rejects second commitment for same `rfqId`. | P0 |
| FR-4.4 | Contract verifies the vendor is bonded and not blacklisted. | P0 |

#### 5.4.1 Commitment hash
Spec baseline:
```
bidHash = keccak256(abi.encodePacked(rfqId, vendorAddress, totalAmount, slaHash))
```
**Recommended hardening (MVP should adopt):** also bind `tokenAddress`, `expiry`, and `chainId`, and use `abi.encode` (not `encodePacked`) to avoid ambiguity:
```
bidHash = keccak256(abi.encode(rfqId, vendorAddress, tokenAddress, totalAmount, slaHash, expiry, chainId))
```
Without `tokenAddress`, a vendor could be paid in a different, cheaper token with the same numeric amount.

### 5.5 HSP Mandate Construction (FR-5x)
| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Build HSP Payment Mandate **only from the signed quote fields** (never from free-form vendor messages). | P0 |
| FR-5.2 | Embed `bidHash` in the mandate metadata/reference field. | P0 |
| FR-5.3 | Buyer wallet signs the mandate. | P0 |
| FR-5.4 | Pre-flight local check: mandate fields == signed quote == on-chain commitment. Abort on any mismatch. | P0 |

### 5.6 Settlement via HSP Gateway (FR-6x)
| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Submit signed mandate to the HSP Gateway. | P0 |
| FR-6.2 | Verify mandate against `ProofBidRegistry` before/at execution (see Open Questions OQ-1 for integration mode). | P0 |
| FR-6.3 | Gateway executes ERC-20 A2A transfer Buyer -> Vendor. | P0 |
| FR-6.4 | Receive webhook with status `SETTLED — ACCEPT`; handle failure/rejection statuses. | P0 |
| FR-6.5 | Record settlement on-chain (`markSettled`) for reputation and dispute window. | P1 |

### 5.7 Fulfilment (FR-7x)
| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Vendor agent listens for the settlement webhook (signature-verified). | P0 |
| FR-7.2 | On confirmed settlement, release API keys/licences/compute to Buyer Agent. | P0 |
| FR-7.3 | Delivery receipt hash recorded (optional on-chain) for SLA evidence. | P2 |

### 5.8 Bonds, Slashing, Reputation (FR-8x)
| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | `registerVendor()` with minimum bond stake (USDC). | P0 |
| FR-8.2 | Slash bond on proven bait-and-switch attempt or non-delivery. | P0 |
| FR-8.3 | Blacklist slashed vendors. | P0 |
| FR-8.4 | Reputation increments on successful delivery, decrements on failures. | P1 |
| FR-8.5 | Slashed funds distribution: compensation to buyer first, remainder to treasury. | P1 |
| FR-8.6 | Withdraw bond after cooldown with no open disputes. | P2 |

### 5.9 Attack Simulation Mode (FR-9x)
| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | UI toggle enables a "malicious vendor" persona. | P0 |
| FR-9.2 | Attack scenarios: (a) price inflation, (b) payee swap, (c) SLA/terms change, (d) token swap, (e) replay of an old signed quote. | P0 (a, b), P1 (c-e) |
| FR-9.3 | Show step-by-step failure trace: which check caught it, tx revert reason, slash event. | P0 |
| FR-9.4 | Fallback: auto-select next-best valid bid and re-run the flow. | P1 |

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Security** | No private keys in browser/frontend code; EIP-712 domain separation; nonce/`rfqId` replay protection; signature malleability protection (use OpenZeppelin `ECDSA`); reentrancy guards on bond functions. |
| **Performance** | RFQ -> ranked bids in < 10s (bid window configurable, default 8s). Commit tx + settlement < 30s on HSK testnet. |
| **Reliability** | Idempotent webhook handler; retry with backoff on gateway calls; state machine persisted so a crash can resume. |
| **Auditability** | Every state transition logged and tied to `rfqId`; on-chain events for commit, settle, slash. |
| **Usability** | Single-page dashboard; one-click demo scenario. |
| **Compatibility** | EVM-compatible HashKey Chain; ERC-20 (USDC) transfers; Solidity ^0.8.20. |
| **Testing** | >= 90% line coverage on contract; end-to-end test script for happy path and each attack. |

---

## 7. System Components

| Component | Responsibility | Tech (suggested) |
|---|---|---|
| Buyer Payment Agent | Intent parsing, RFQ, verification, scoring, commitment, mandate, signing | Node.js/TypeScript, ethers v6 |
| Vendor Agent(s) | Quote and sign, listen for settlement, deliver | Node.js/TypeScript (3 instances: honest A, honest B, malicious C) |
| ProofBidRegistry.sol | Commitments, bonds, slashing, reputation, verification | Solidity, Foundry/Hardhat, OpenZeppelin |
| HSP Gateway (existing) | Mandate verification and A2A execution, webhook | External |
| Dashboard | Intent input, bids, scores, 3-way match visual, attack toggle, event log | Next.js/React, wagmi/viem |
| Message Bus | RFQ broadcast / bid return | Express + WebSocket (ws/socket.io) |
| State Store | RFQ lifecycle state | SQLite / in-memory for MVP |

---

## 8. Data Model (summary)

**RFQ**: `rfqId, requiredSku, quantity, maxPrice, maxLatency, expiryTimestamp, status, buyerAddress`
**SignedBid**: `quote{...}, v, r, s, receivedAt, score, valid, rejectReason`
**Commitment (on-chain)**: `bidHash, vendor, totalAmount, committedAt, settled, buyer`
**Vendor (on-chain)**: `bond, reputation, blacklisted, registeredAt`
**Mandate**: HSP-defined structure + `metadata.ref = bidHash`

State machine: `CREATED -> BIDDING -> EVALUATED -> COMMITTED -> MANDATE_SIGNED -> SUBMITTED -> SETTLED -> FULFILLED`
Failure branches: `REJECTED (tamper) -> SLASHED -> FALLBACK`, `EXPIRED`, `FAILED`.

---

## 9. Security and Threat Model

| # | Threat | Mitigation |
|---|---|---|
| T1 | Price inflation after win | Mandate built from signed quote; `totalAmount` in `bidHash`; registry rejects mismatch. |
| T2 | Payee swap | `vendorAddress` in signed quote and `bidHash`; mandate payee must equal committed vendor. |
| T3 | Token swap | `tokenAddress` bound in quote and `bidHash`. |
| T4 | SLA/terms change | `slaHash` bound in quote and `bidHash`. |
| T5 | Quote replay across RFQs | `rfqId` in signed struct; one commitment per `rfqId`; `expiry` enforced. |
| T6 | Cross-chain/contract replay | EIP-712 domain with `chainId` + `verifyingContract`. |
| T7 | Malicious buyer agent (low-balls registry) | Buyer wallet signature required; spend limits and policy check before signing. |
| T8 | Vendor non-delivery after payment | Bond slash via arbiter after SLA timeout. |
| T9 | Fake webhook triggers delivery | Verify HSP webhook signature; cross-check on-chain settlement. |
| T10 | Front-running the commit | Commit is by the buyer's registered agent address only. |
| T11 | Griefing: bidders spamming RFQs | Bond requirement to bid; per-vendor rate limit. |

---

## 10. Success Metrics (Hackathon)

- Happy path completes end-to-end on HSK testnet with a real HSP-settled transfer.
- 100% of simulated tamper attempts (price, payee, token, SLA) are rejected.
- Slash event and blacklist visible on-chain and in UI.
- Demo runs in under 3 minutes without manual intervention.
- Clear judge-visible 3-way match panel (RFQ / Bid / Mandate hashes aligned or red-flagged).

---

## 11. Assumptions and Open Questions

**Assumptions**
- A1. HSP Gateway exposes endpoints to create/submit signed Payment Mandates and to receive settlement webhooks (confirm exact schema from the gateway docs).
- A2. The mandate has a metadata/reference field that can carry a 32-byte hash.
- A3. USDC (or a test ERC-20) is deployed/available on HSK testnet.

**Open Questions**
- **OQ-1 (critical): How does the HSP Gateway "check against ProofBidRegistry"?** The gateway is existing infrastructure. Options:
  1. *Native hook:* gateway supports a pre-execution verification callback (best if available).
  2. *ProofBid Verifier Service (fallback):* a ProofBid-operated service that sits between agent and gateway, reads the registry, and only forwards mandates that match; gateway receives only verified mandates.
  3. *Registry-as-spender:* the buyer approves the registry; the registry performs `transferFrom` after validation (bypasses HSP, so least preferred for the track).
  The MVP should implement Option 2 behind an interface so it can be swapped for Option 1 if the gateway supports it.
- **OQ-2:** Who triggers `slashVendor`? MVP: arbiter address; stretch: automated via missing-delivery timeout.
- **OQ-3:** Exact HSP mandate field mapping (payee, amount, token, reference, expiry, nonce).
- **OQ-4:** Minimum bond size and slash split.

---

## 12. Out of Scope / Future Work
- Milestone/escrow-style partial payments.
- Decentralized arbitration (Kleros-style) and zk-proof of delivery.
- Reputation oracle across multiple chains.
- Multi-token and cross-chain procurement.
- SDK for third-party vendor agents.