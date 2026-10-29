# ProofBid — Implementation Plan

Companion to `PRD.md` and `ARCHITECTURE.md`. Organised as phases with concrete deliverables, acceptance criteria and an ordering that de-risks the HSP integration first.

> Timeline assumes a short hackathon window. The schedule below is expressed in **work blocks** (~3–4 hours each) so it can be stretched or compressed. A condensed 48-hour mapping is at the bottom.

---

## 0. Guiding Principles
1. **De-risk HSP first.** Read the gateway docs and prove one successful mandate submission before building anything fancy.
2. **Contract + shared hashing first.** Everything else depends on the exact `bidHash` and EIP-712 definitions; they must be identical in Solidity and TypeScript.
3. **Fail closed.** Any mismatch aborts; never "best effort" settle.
4. **Mock early, swap later.** `MockHspClient` lets UI and agents progress while real integration is finished.
5. **Demo-driven.** Every phase ends with something showable.

---

## Phase 0 — Discovery and Setup (Block 1)

**Tasks**
- [ ] Read HSP docs at https://hashkey-merchant.github.io/#/ — capture: mandate schema, signing scheme, submit endpoint, webhook schema, statuses, auth, testnet/sandbox availability, metadata/reference field.
- [ ] Resolve **OQ-1** (how the gateway verifies against the registry). Decide: native hook vs. Verifier Service. Default to Verifier Service if unsupported.
- [ ] Get HSK testnet RPC, chainId, faucet, block explorer, test USDC address.
- [ ] Create monorepo (pnpm workspaces), TypeScript config, lint, formatting.
- [ ] Set up Foundry (or Hardhat) in `contracts/`.
- [ ] Create `.env.example` (RPC, keys for buyer/vendors/arbiter, HSP credentials, webhook secret).
- [ ] Fund 5 wallets: Buyer, Vendor A, Vendor B, Vendor C (malicious), Arbiter.

**Deliverables:** repo skeleton, `docs/hsp-notes.md` with confirmed field mapping, decision log for OQ-1.
**Acceptance:** can send a raw test transaction on HSK testnet; HSP field mapping documented.

---

## Phase 1 — Shared Primitives (Block 2)

**Tasks**
- [ ] `packages/shared`: types for `RFQ`, `Quote`, `SignedQuote`, `Commitment`, `Mandate`.
- [ ] EIP-712 domain/types constants (name `ProofBid`, version `1`, chainId, verifyingContract).
- [ ] `computeBidHash()` using hardened encoding: `keccak256(abi.encode(rfqId, vendor, token, totalAmount, slaHash, expiry, chainId))`.
- [ ] `signQuote()` / `recoverQuoteSigner()` helpers.
- [ ] Scoring module: normalisation + weights (0.5 / 0.3 / 0.2) with unit tests, tie-breakers.
- [ ] Golden test vectors (JSON) reused by both Solidity and TS tests to guarantee identical hashing.

**Acceptance:** unit tests pass; hash from TS equals hash from Solidity for all golden vectors.

---

## Phase 2 — Smart Contract (Blocks 3–4)

**Tasks**
- [ ] Implement `ProofBidRegistry.sol` per `ARCHITECTURE.md` section 4:
  - [ ] `registerVendor`, bond custody (OpenZeppelin `SafeERC20`, `ReentrancyGuard`).
  - [ ] `commitWinningBid` with one-commitment-per-RFQ and vendor eligibility checks.
  - [ ] `verifyMandate` (view).
  - [ ] `markSettled`, `confirmDelivery`.
  - [ ] `slashVendor`, `reportTamper` (on-chain EIP-712 signature verification), blacklist.
  - [ ] `withdrawBond` with cooldown.
  - [ ] Events and custom errors.
- [ ] `MockUSDC.sol` for local tests.
- [ ] Foundry tests: happy path; double commit; unbonded vendor; blacklisted vendor; mismatch on each field (payee, amount, token, ref); slash accounting; tamper-evidence with two conflicting signed quotes; access control; reentrancy; withdraw cooldown.
- [ ] Deploy script; deploy to HSK testnet; record address in `deployments/hsk-testnet.json`; verify on explorer if supported.

**Acceptance:** >= 90% coverage; all negative tests revert with the expected error; contract deployed and callable on testnet.

---

## Phase 3 — HSP Adapter (Blocks 4–5, parallel with Phase 2)

**Tasks**
- [ ] Define `HspClient` interface (see `ARCHITECTURE.md` section 5).
- [ ] `MockHspClient`: simulates gateway verification (calls `registry.verifyMandate`), performs mock ERC-20 transfer, emits webhook.
- [ ] `RealHspClient`: implements confirmed endpoints/signing from Phase 0.
- [ ] Webhook receiver: signature verification, idempotency by `paymentId`, replay protection.
- [ ] Integration test: build -> sign -> submit -> status polling -> webhook, against sandbox (or mock).
- [ ] If OQ-1 resolved as Verifier Service: build `packages/verifier` that:
  1. receives the signed mandate,
  2. calls `registry.verifyMandate(...)`,
  3. forwards to the gateway only if true, else returns `MANDATE_REJECTED` and emits `MandateRejected`.

**Acceptance:** one real (or sandbox) mandate submitted and settled end-to-end for a fixed test quote; a tampered mandate is blocked.

---

## Phase 4 — Vendor Agent (Block 6)

**Tasks**
- [ ] Express server: `POST /rfq`, `POST /hsp/webhook`.
- [ ] Pricing strategies per vendor persona (A: cheap/low reputation, B: pricier/high reputation, C: cheapest but malicious).
- [ ] EIP-712 quote signing with the vendor key.
- [ ] Bond registration script.
- [ ] Delivery handler: on verified settlement webhook, release mock credentials (API key / licence token) to the buyer via callback.
- [ ] Attack mode controller (`none | price | payee | sla | token | replay`) that mutates data **after** winning, at the "conditions transmission" step.

**Acceptance:** vendor responds with a valid signed quote; each attack mode produces the mutated payload deterministically.

---

## Phase 5 — Buyer Payment Agent (Blocks 7–8)

**Tasks**
- [ ] Intent parser (LLM-assisted with strict JSON schema output + deterministic validation; fall back to regex form for demo reliability).
- [ ] RFQ builder + broadcaster (REST + WS), bid collection window.
- [ ] Bid verifier: signature recovery, field checks, registry eligibility.
- [ ] Scoring engine integration and ranking output with breakdown.
- [ ] Commit module: compute `bidHash`, call `commitWinningBid`, wait for confirmation.
- [ ] Mandate builder (strictly from signed quote) + pre-flight 3-way check.
- [ ] Wallet signing step (user approval via UI or policy auto-sign under limit).
- [ ] Settlement orchestrator: submit, poll, handle webhook, `markSettled`, `confirmDelivery`.
- [ ] Persisted state machine (SQLite) and resume on restart.
- [ ] Fallback logic: on rejection, mark vendor, pick next-best valid bid, restart from commit.
- [ ] Event stream (SSE/WS) for the dashboard.

**Acceptance:** CLI run: intent -> settled -> credentials received. Forced attack: rejected -> slashed -> fallback vendor settles.

---

## Phase 6 — Dashboard (Blocks 9–10)

**Screens / components**
- [ ] Intent input with example prompt chips.
- [ ] Live RFQ timeline (state machine progress bar).
- [ ] Bid table: vendor, price, latency, reputation, **score breakdown bars**, validity badge.
- [ ] **3-Way Match panel:** RFQ | Signed Bid | Mandate columns with hash comparison and green/red indicators.
- [ ] Wallet connect and "Approve & Sign Mandate" modal (wagmi/viem).
- [ ] Settlement status card with tx hash/explorer link and webhook status.
- [ ] **Attack Simulation toggle** with scenario dropdown; failure trace log (which check failed, revert reason).
- [ ] Vendor registry view: bond, reputation, blacklist state (reads from contract).
- [ ] Event log (on-chain events + agent events).

**Acceptance:** entire demo is drivable from the UI without a terminal.

---

## Phase 7 — Integration and E2E Testing (Block 11)

**Test matrix**

| # | Scenario | Expected |
|---|---|---|
| E1 | Happy path, honest vendors | Settled, credentials delivered, reputation up |
| E2 | Winner inflates price | Rejected, slashed, fallback settles with next vendor |
| E3 | Winner swaps payee | Rejected, slashed, blacklisted |
| E4 | Winner swaps token | Rejected |
| E5 | Winner alters SLA hash | Rejected |
| E6 | Replay of previous quote | Rejected at verification |
| E7 | All bids exceed budget | RFQ fails with clear message |
| E8 | Quote expires before commit | Bid dropped |
| E9 | Settled but vendor never delivers | Arbiter slash after deadline, buyer compensated |
| E10 | Duplicate webhook | Idempotent, no double delivery |
| E11 | Gateway timeout | Poll, no duplicate submission |
| E12 | Invalid signature on a bid | Bid ignored |

**Tasks:** script each scenario in `scripts/`; run against testnet; fix flakiness; record gas costs.

---

## Phase 8 — Demo, Docs, Submission (Block 12)

**Tasks**
- [ ] Rehearse a **3-minute demo script**:
  1. (0:00) Problem: show quote drift risk in one slide.
  2. (0:30) Honest run: intent -> bids -> scores -> commit -> sign -> HSP settle -> delivery.
  3. (1:30) Toggle Attack Mode (price inflation): show the 3-Way Match panel go red, revert, slash, blacklist, fallback.
  4. (2:30) Show on-chain events in the explorer; recap.
- [ ] README: quick start, env, architecture diagram, contract addresses, demo video link.
- [ ] Record backup demo video in case of live-network issues.
- [ ] Pitch deck (5–6 slides): problem, solution, 3-way match, architecture, HSP integration, traction/next steps.
- [ ] Submission form: track "Agent Payments & A2A Settlement (HSP)", repo, demo, deployed addresses.

---

## Milestones and Gates

| Milestone | Gate (must be true to proceed) |
|---|---|
| M0 | HSP flow understood; OQ-1 decided |
| M1 | Hash/signature parity TS <-> Solidity |
| M2 | Contract deployed and tested on testnet |
| M3 | One real/sandbox HSP settlement completed |
| M4 | CLI end-to-end (happy + attack) works |
| M5 | Dashboard demo flow works |
| M6 | E1–E12 pass; demo rehearsed |

---

## Condensed 48-Hour Schedule

| Hours | Focus |
|---|---|
| 0–4 | Phase 0 (HSP docs, OQ-1, wallets, repo) |
| 4–8 | Phase 1 (shared primitives) |
| 8–18 | Phase 2 (contract + tests + deploy) and Phase 3 (HSP adapter) in parallel |
| 18–26 | Phase 4 (vendors) + Phase 5 (buyer agent) |
| 26–36 | Phase 6 (dashboard) |
| 36–42 | Phase 7 (E2E tests, bug fixes) |
| 42–48 | Phase 8 (demo, docs, video, submit) |

**If time is short, cut in this order:** (1) LLM intent parsing -> form input, (2) `withdrawBond`/cooldown, (3) attack modes sla/token/replay, (4) delivery receipt on-chain, (5) vendor registry UI. **Never cut:** 3-way match check, bid commitment, HSP settlement, price/payee attack demo, slashing.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| HSP gateway cannot call our registry | High | High | Verifier Service fallback (Option 2); keep adapter interface clean. |
| HSP sandbox/testnet unavailable or limited | Medium | High | `MockHspClient` + recorded demo; clearly label mock vs. real in UI. |
| Mandate lacks a free metadata field for `bidHash` | Medium | High | Encode `bidHash` in reference/memo/invoice-id field; or Verifier maps `paymentId -> bidHash`. |
| EIP-712 mismatch between TS and Solidity | Medium | Medium | Golden test vectors from Phase 1. |
| Testnet RPC instability | Medium | Medium | Local Anvil fork fallback; backup video. |
| Scope creep | High | Medium | Cut list above; gate reviews. |
| Slashing authority perceived as centralised | Medium | Low | Document as MVP arbiter; roadmap to decentralised arbitration. |

---

## Definition of Done (MVP)
- [ ] `ProofBidRegistry` deployed on HSK testnet, tests >= 90% coverage.
- [ ] Buyer agent completes intent -> RFQ -> scored bids -> on-chain commit -> signed mandate -> HSP settlement -> delivery.
- [ ] Attack Mode demonstrates price and payee tampering being rejected with slash + fallback.
- [ ] Dashboard shows the 3-Way Match panel and live event trace.
- [ ] README, architecture docs, demo video and deployed addresses published.