# ProofBid — Architecture and Workflow Specification

## 1. System Context

```
 Enterprise User
      |  intent (natural language)
      v
+----------------------+   RFQ (HTTP/WS)    +---------------------+
|  Buyer Payment Agent | -----------------> |  Vendor Agent A      |
|  - Intent parser     | <----------------- |  Vendor Agent B      |
|  - Verifier/Scorer   |  EIP-712 signed    |  Vendor Agent C (evil)|
|  - Mandate builder   |  quotes            +---------------------+
|  - Wallet signer     |                              ^
+----------+-----------+                              | settlement webhook
           | commitWinningBid                         |
           v                                          |
+----------------------+    verify     +--------------+--------------+
| ProofBidRegistry.sol | <------------ |        HSP Gateway          |
|  (HashKey Chain)     |               |  verify sig -> A2A ERC-20   |
+----------------------+               +-----------------------------+
           ^                                          |
           |  slash / reputation                      | transfer Buyer -> Vendor
           +------------------------------------------+
```

## 2. End-to-End Workflow (Sequence)

```
User      BuyerAgent        Vendors        Registry        HSP Gateway
 |  intent   |                 |              |                 |
 |---------->| parse -> RFQ    |              |                 |
 |           |---- RFQ ------->|              |                 |
 |           |<-- signed bids -|              |                 |
 |           | verify sigs, filter, score     |                 |
 |           |-- commitWinningBid(bidHash) -->|                 |
 |           |<------ tx receipt / event -----|                 |
 |           | build Mandate(ref=bidHash)     |                 |
 |           | local 3-way pre-flight         |                 |
 |<- approve-|                                |                 |
 |-- sign -->| wallet signs Mandate           |                 |
 |           |------------- submit signed Mandate ------------->|
 |           |                                |<-- verify ------|
 |           |                                |--- match? ----->|
 |           |                                 execute A2A ERC-20 transfer
 |           |<------------- webhook SETTLED/ACCEPT ------------|
 |           |                 |<--- webhook -|-----------------|
 |           |                 | release keys/licences          |
 |           |<-- credentials -|              |                 |
```

## 3. Phase-by-Phase Specification

### Phase 1 — Intent -> RFQ
1. User: "Procure 50,000 LLM API credits, max budget 25 USDC, latency < 150ms".
2. Parser extracts `requiredSku`, `quantity`, `maxPrice` (in token base units), `maxLatency` (ms).
3. Agent generates `rfqId = keccak256(buyer, nonce, timestamp)` and `expiryTimestamp = now + bidWindow`.
4. RFQ JSON:
```json
{
  "rfqId": "0x...",
  "requiredSku": "LLM_API_CREDITS",
  "quantity": 50000,
  "maxPrice": "25000000",
  "maxLatency": 150,
  "expiryTimestamp": 1775000000,
  "buyer": "0xBuyerAgent"
}
```
5. Broadcast to registered vendors (REST `POST /rfq` and WS channel `rfq:new`).

### Phase 2 — Vendor Bidding
1. Vendor checks inventory and pricing policy.
2. Vendor builds quote (struct in PRD 5.2) and signs EIP-712 typed data.
3. Vendor returns `{ quote, v, r, s }`.

### Phase 3 — Verification, Scoring, Commitment
1. For each bid: `recoverTypedDataAddress(domain, types, quote, sig) == quote.vendorAddress`.
2. Validate: `quote.rfqId == rfq.rfqId`, `totalAmount <= maxPrice`, `expiry >= now`, `slaLatency <= maxLatency`, vendor bonded and not blacklisted (registry read).
3. Normalise and score (see PRD 5.3.1). Pick top.
4. Compute `bidHash` (hardened form in PRD 5.4.1).
5. `commitWinningBid(rfqId, bidHash, vendorAddress, totalAmount)` -> wait for confirmation.

### Phase 4 — Mandate Construction
1. Build mandate strictly from the **signed quote** (payee = `vendorAddress`, amount = `totalAmount`, token = `tokenAddress`, expiry = `expiry`).
2. Set `metadata.ref = bidHash`.
3. Pre-flight checks (fail closed):
   - mandate.payee == quote.vendorAddress == registry.commitment.vendor
   - mandate.amount == quote.totalAmount == registry.commitment.totalAmount
   - mandate.token == quote.tokenAddress
   - recomputed bidHash == mandate.metadata.ref == registry.commitment.bidHash
4. Wallet signature over mandate (user approval step in UI, or policy auto-approval within limits).

### Phase 5 — Settlement
1. Submit to HSP Gateway.
2. Verification path (per OQ-1): gateway callback to registry, **or** ProofBid Verifier Service forwards only matching mandates.
3. Gateway executes ERC-20 transfer Buyer -> Vendor.
4. Webhook: `SETTLED — ACCEPT` (or reject/failure).
5. Buyer Agent calls `markSettled(rfqId)` (or Verifier Service does) to start the delivery SLA timer.

### Phase 6 — Fulfilment and Enforcement
- **Happy path:** vendor verifies webhook signature, releases credentials, delivery receipt stored, reputation +1.
- **Bait-and-switch:** mismatch -> registry rejects -> mandate not executed -> `slashVendor` -> vendor blacklisted -> fallback selects next-best bid.
- **Non-delivery:** SLA timer expires -> arbiter calls `slashVendor(rfqId)` -> buyer compensated from bond.

## 4. Smart Contract Specification — `ProofBidRegistry.sol`

### 4.1 Storage
```solidity
struct Vendor { uint256 bond; uint256 reputation; bool blacklisted; bool registered; }
struct Commitment {
    bytes32 bidHash; address buyer; address vendor;
    address token; uint256 totalAmount;
    uint64 committedAt; uint64 deliveryDeadline;
    Status status; // NONE, COMMITTED, SETTLED, DELIVERED, SLASHED
}
mapping(address => Vendor) public vendors;
mapping(bytes32 => Commitment) public commitments; // rfqId => commitment
uint256 public minBond;
address public arbiter;
IERC20 public bondToken;
```

### 4.2 Functions
| Function | Access | Behaviour |
|---|---|---|
| `registerVendor(uint256 bondAmount)` | vendor | Transfers bond, requires >= `minBond`. |
| `commitWinningBid(bytes32 rfqId, bytes32 bidHash, address vendor, uint256 totalAmount)` | authorised buyer agent | Requires no existing commitment, vendor bonded and not blacklisted, stores commitment. Emits `BidCommitted`. |
| `verifyMandate(bytes32 rfqId, address payee, address token, uint256 amount, bytes32 ref)` `view returns (bool)` | anyone | True only if status == COMMITTED and `ref == bidHash` and fields match. Used by Gateway / Verifier. |
| `markSettled(bytes32 rfqId)` | buyer agent / verifier | COMMITTED -> SETTLED, sets `deliveryDeadline`. |
| `confirmDelivery(bytes32 rfqId)` | buyer agent | SETTLED -> DELIVERED, vendor reputation up. |
| `reportTamper(bytes32 rfqId, ...evidence)` | buyer agent | Verifies vendor-signed quote differs from submitted terms; slashes. |
| `slashVendor(bytes32 rfqId)` | arbiter (or timeout) | Slashes bond, compensates buyer, blacklists vendor. |
| `withdrawBond()` | vendor | After cooldown and no open commitments. |

### 4.3 Events
`VendorRegistered, BidCommitted, MandateVerified, MandateRejected, Settled, Delivered, VendorSlashed, VendorBlacklisted`

### 4.4 Invariants
- One commitment per `rfqId`.
- `verifyMandate` never returns true for blacklisted vendor.
- Slash amount <= vendor bond; funds conservation holds.
- Only the committing buyer (or its delegate) can mark settled.

### 4.5 Tamper evidence (`reportTamper`)
The vendor's EIP-712 signature over the *original* quote is the proof. If the vendor later pushes different terms (e.g. higher price) and the buyer submits both the signed original and the vendor-presented conflicting terms signed by the vendor, the contract can verify both signatures from the same vendor for the same `rfqId` with different `totalAmount`/`slaHash` -> slash. (For a purely off-chain attempt, the Buyer Agent submits the signed original plus the vendor's signed conflicting message.)

## 5. HSP Integration Layer

Isolate behind an adapter so API details can change:

```ts
interface HspClient {
  buildMandate(q: SignedQuote, bidHash: string): Mandate;
  signMandate(m: Mandate, wallet: Signer): Promise<SignedMandate>;
  submit(sm: SignedMandate): Promise<{ paymentId: string }>;
  onWebhook(handler: (evt: HspEvent) => void): void;
  getStatus(paymentId: string): Promise<HspStatus>;
}
```
- Mandate field mapping and endpoints must be taken from https://hashkey-merchant.github.io/#/ (confirm before coding).
- Implement `MockHspClient` for local dev, `RealHspClient` for testnet.
- Webhook endpoint: verify HSP signature, idempotency key on `paymentId`.

## 6. Repository Layout

```
proofbid/
├─ contracts/
│  ├─ src/ProofBidRegistry.sol
│  ├─ src/interfaces/IProofBidRegistry.sol
│  ├─ src/mocks/MockUSDC.sol
│  ├─ test/ProofBidRegistry.t.sol
│  └─ script/Deploy.s.sol
├─ packages/
│  ├─ shared/        (types, EIP-712 typed data, hashing utils)
│  ├─ buyer-agent/   (intent, rfq, verify, scoring, commit, mandate, state)
│  ├─ vendor-agent/  (quote, sign, deliver, attack modes)
│  ├─ hsp-adapter/   (HspClient, MockHspClient, RealHspClient, webhook)
│  └─ verifier/      (optional ProofBid Verifier Service, OQ-1 option 2)
├─ apps/dashboard/   (Next.js UI)
├─ scripts/          (demo.ts, attack-sim.ts, seed-vendors.ts)
├─ docs/             (PRD.md, ARCHITECTURE.md, IMPLEMENTATION_PLAN.md)
└─ README.md
```

## 7. API Surface (Off-Chain)

**Buyer Agent**
- `POST /intents` -> creates RFQ from text
- `GET /rfqs/:id` -> state, bids, scores
- `POST /rfqs/:id/approve` -> triggers wallet signing and submission
- `GET /rfqs/:id/events` (SSE/WS) -> live trace for the dashboard

**Vendor Agent**
- `POST /rfq` -> receive RFQ, respond with signed quote
- `POST /hsp/webhook` -> settlement confirmation, triggers delivery
- `POST /admin/attack-mode` -> `{ mode: "none" | "price" | "payee" | "sla" | "token" | "replay" }`

## 8. Attack Simulation Mode — Behaviour Matrix

| Mode | What malicious vendor does | Expected catch point | Result |
|---|---|---|---|
| `price` | Sends higher `totalAmount` in conditions after winning | Pre-flight + `verifyMandate` (amount mismatch) | Rejected, slash, fallback |
| `payee` | Replaces destination address | `verifyMandate` (payee mismatch) | Rejected, slash, fallback |
| `sla` | Alters `slaHash`/delivery terms | `bidHash` recompute mismatch | Rejected, slash, fallback |
| `token` | Swaps to different token | `verifyMandate` (token mismatch) | Rejected, slash, fallback |
| `replay` | Resubmits an old signed quote for a new RFQ | Signature `rfqId` mismatch / expiry | Rejected at verification |

UI shows a 3-column "RFQ | Signed Bid | Mandate" panel; mismatched fields flash red with the failing check named.

## 9. Error Handling and Edge Cases
- No valid bids -> RFQ fails with reason; optionally re-broadcast with relaxed budget (requires user approval).
- Winner's commit tx fails -> retry then fall back to next bid.
- Gateway timeout -> poll `getStatus`; never re-submit without checking idempotency key.
- Webhook arrives before local state updated -> queue and reconcile.
- Quote expires between commit and settlement -> re-run from Phase 1 with the same vendor only if still valid.
- Insufficient buyer balance/allowance -> fail before signing; surface to user.

## 10. Observability
- Structured logs keyed by `rfqId`.
- Dashboard timeline of state transitions with tx hashes linking to the HSK explorer.
- Metrics: bid count, rejection reasons, time per phase, slash count.