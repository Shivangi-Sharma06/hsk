# ProofBid — Detailed Execution Plan

Version 2.0 · 2026-10-30 · Testnet-first; no deadline assumed

This plan implements [PRD](prd.md) and [architecture](architecture.md). It replaces the original contract-first/slashing schedule. Tasks below are future work unless marked complete. Use [HSP discovery](docs/planning/hsp-integration.md), [UI specification](docs/planning/ui.md) and [test matrix](docs/planning/verification.md) as acceptance contracts.

## 1. Execution strategy

Build one safe vertical slice first: a receiving agent's signed conditions → buyer approval → simulator settlement → verified report. Then replace the simulator with the confirmed HSP interface. Expand to three agents and attack/recovery cases before polish. Do not start escrow, slashing, cross-chain routing or multiple payment integrations.

External access is the only dependency that may prevent real HSP completion. Work on local domain/backend/UI tests while awaiting it. Do not stop the useful work; do not mark real integration done with a mock.

Dependency path:

```text
P0 source/access discovery ──────────────> P7 confirmed live adapter ──> P9 testnet acceptance
P1 foundation → P2 schemas/signatures → P3 durable backend → P4 vendor service
                                                ↓                  ↓
                                          P5 local payment slice → P6 UI
                                                ↓                  ↓
                                          P8 adversarial/recovery tests
P9 → P10 optional features → P11 mainnet release
```

Start P7's small browser-wallet/API spike as soon as access exists; it can require schema/approval adjustments. Avoid polishing an approval flow that the actual SDK cannot support. Task parallelism in this diagram is a dependency option for human contributors, not a requirement for multiple agents or services.

## 2. Phase P0 — Decisions, credentials and integration research

**Estimate:** 2–4 focused hours excluding organizer access wait.

- [ ] Read the revised documents and loophole review. Record one selected track surface in `docs/integration/hsp-contract.md`; leave missing answers visibly pending.
- [ ] Confirm no runtime application code exists yet and inspect repository instructions before scaffolding.
- [ ] Request organizer/merchant onboarding, payer SDK/API schema, QA access, testnet faucet and vendor app/payee permissions. Never put actual keys in documentation or issues.
- [ ] Complete H01–H18 from the integration checklist as answers become available; prioritize exact signing/execution/nonce/idempotency behavior.
- [ ] Verify public QA/mainnet/staging classification; staging docs explicitly use mainnet assets.
- [ ] Confirm testnet `eth_chainId`, token bytecode, decimals, execution support and explorer. Pin agreed values in a versioned public deployment manifest.
- [ ] Choose exact supported Node runtime after checking the HSP SDK requirement; pin versions and package manager.
- [ ] Record decisions: browser wallet P0; one chain/token; no custody contracts; one receiving-agent service hosting three personas; structured intent form; persistent single-instance backend.

**Deliverables:** `docs/integration/hsp-contract.md`, `config/deployments/local.json`, `config/deployments/hashkey-testnet.json` (pending values cannot enable live mode), sanitized API fixtures when available.

**Gate G0:** known vs unknown fields are explicit. Local work may proceed without credentials. Live mode may not.

## 3. Phase P1 — Minimal runnable foundation

**Estimate:** 3–5 hours. Depends on P0 decisions, not live credentials.

- [ ] Create pnpm workspace with `apps/api`, `apps/web`, `apps/vendors`, `packages/domain`. No Turborepo required.
- [ ] Set strict TypeScript, shared lint/format config, reproducible lockfile and supported runtime file.
- [ ] Add Fastify, a pinned SQLite driver, static JSON Schema tooling, viem, React/Vite and the minimal wallet/query dependencies. Verify compatibility from official docs and lock exact resolved versions.
- [ ] Add Vitest and Playwright. Only install contract tooling if the optional anchor is started.
- [ ] Create example environment files without usable keys. List public vs server-only config explicitly.
- [ ] Validate startup config: deployment/profile, testnet chain/token, allowed origins/vendors, caps, limits, provider credentials, signing keys and persistence paths. Fail real startup on missing pins or mismatched environment.
- [ ] Add `.gitignore` coverage for actual runtime data/artifacts, SQLite DB/WAL/SHM, local secrets and browser-test output without ignoring migrations, fixtures, proof schemas or deployment manifests.
- [ ] Implement `/health/live`, `/health/ready` and sanitized `/api/config`.
- [ ] Set Vite dev proxy to API; production API serves web build so browser/API use one origin.
- [ ] Add commands with these names: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm db:migrate`, `pnpm seed`, `pnpm doctor`, `pnpm smoke`, `pnpm verify:bundle -- <file>`.

**Acceptance:** clean install/build, API/vendor/UI run locally with one command, readiness distinguishes local/real, no private credential in browser config/build. Commands are planned names until implemented.

## 4. Phase P2 — Domain schema, signatures and policy

**Estimate:** 4–6 hours. Depends on P1.

- [ ] Define immutable RFQ, typed quote, signed conditions, PreparedPayment, application/provider statuses, evidence and delivery receipt schemas per architecture.
- [ ] Decide maximum body sizes, quantity, amount, fixture bytes, quote TTL, future-clock tolerance and input lengths as constants with validation messages. Proposed starting bounds: JSON request 64 KiB, quote/conditions 32 KiB, fixture 100 KiB, quantity exactly 1 for the P0 report SKU (later bounded batch quantity), max TTL 15 minutes, future-clock tolerance 30 seconds. Payment cap values are operator config, not baked-in token amounts.
- [ ] Implement strict integer amount parser and token decimal conversion. Reject exponent notation, signs, fractions in base-unit fields, excess decimal places and overflow. Display exact token units and contract.
- [ ] Implement RFC 8785 binding, rfqHash, quote EIP-712 domain/types and quoteDigest. Commit golden vectors; use at least one independent known-good EIP-712 reference/vector to avoid testing a helper only against itself.
- [ ] Verify signer against trusted vendor; check payout mapping, buyer/RFQ/quantity/SKU/input/terms and dates.
- [ ] Implement P0 rank order with deterministic address/digest tie-breaks; no floating scores or invented reputation.
- [ ] Implement conditions comparison returning typed mismatches with path, expected, observed and safe explanation. Validation must precede wallet signing.
- [ ] Implement approval snapshot/hash, policy version and invalidation predicates.
- [ ] Define atomic spend reservation rules for recipient amount, total token debit and separate native gas exposure. Carry unresolved authorizations across UTC day boundaries.
- [ ] Write golden fixtures for honest offer, each field mutation, Unicode/canonical ordering and separate merchant/cart vs quote hash domains.

**Acceptance G1:** all material-field mutations rejected; boundary money/expiry cases covered; same facts yield stable digests; different buyer/chain/deployment cannot replay a quote.

## 5. Phase P3 — Durable backend and security boundary

**Estimate:** 6–10 hours. Depends on P2.

- [ ] Create versioned SQL migrations for the tables/indexes in architecture. Add foreign keys, unique active attempt constraint, unique provider refs/execution consumption/delivery and idempotency request hashes.
- [ ] Enable supported SQLite WAL/FULL durability, bounded busy timeout and prepared statements. Open/write/commit errors must fail financial actions closed.
- [ ] Implement atomic RFQ transition + append event + enqueue job. Add expectedVersion CAS guards and transactional spend reservations.
- [ ] Implement durable job claim/lease/retry/backoff/recovery with one in-process worker. Store external attempt identity before dispatch.
- [ ] On startup, enumerate incomplete payments and enqueue reconciliation, not resubmission. Expired leases become reclaimable.
- [ ] Implement wallet challenge/sign-in with maintained EIP-4361 verification, one-use nonce, expected origin/URI/chain and bounded expiry. P0 supports EOAs; reject unsupported contract wallets clearly.
- [ ] Use opaque hashed server sessions in Secure HttpOnly SameSite cookies; owner checks on every read/write/artifact, CSRF/Origin checks, rate limits and bounded JSON schema validation.
- [ ] Implement create/list/detail/select/cancel/reconcile routes with idempotency and stable typed errors.
- [ ] SSE replays persisted monotonic IDs, accepts Last-Event-ID, heartbeats, owner checks and slow-client limits. Snapshot refresh recovers from retained-history gaps.
- [ ] Redact credentials/payment signatures/paid content in structured logs and events; assign correlation IDs.
- [ ] Add graceful shutdown and a consistent SQLite backup/restore script using safe database tooling.

**Acceptance G2:** two simultaneous approvals produce one active attempt/reservation; duplicate keys replay stable responses; changed requests with same key fail; restart preserves unresolved payments/events; another wallet cannot access records.

## 6. Phase P4 — Receiving agents and real deliverable

**Estimate:** 4–6 hours. Depends on P2; may start before all P3 routes are complete.

- [ ] Build vendor host with three fixed profiles, signer keys and allowlisted payout mapping. Store private keys outside code; label development identities.
- [ ] Implement peer-authenticated RFQ endpoint with body/time limits and independently computed eligibility. Return canonical signed quote/terms.
- [ ] Implement conditions endpoint: return original selected signed offer; do not reconstruct with an updated price. Merchant profile later adds vendor-owned cart/order creation with stable request IDs.
- [ ] Persist vendor quote/order/delivery state on disk; do not lose delivered goods or order mapping on vendor restart. A second lightweight SQLite database owned by the vendor host is acceptable; never share a live SQLite file across remote hosts.
- [ ] Implement one deterministic bounded report analyzer over known fixtures. Version fixtures/schema/analyzer and hash exact input bytes.
- [ ] Implement separate settlement verification in vendor role; no trust in buyer `paid` flag or arbitrary callback.
- [ ] Generate signed DeliveryReceipt after validated payment, persist once and return same artifact on repeated fulfilment/retrieval.
- [ ] Add testnet/local-only scenario config per run for price inflation and payee swap, applied only at conditions transmission. No public global mutation route.

**Acceptance:** buyer verifies authentic quotes; vendor rejects forged payment evidence; delivered report is computed, signed, bound to the right order/input and recoverable after restart. Attack can demonstrate unsigned drift without falsely claiming slashable signed misconduct.

## 7. Phase P5 — Local vertical slice and recovery

**Estimate:** 5–8 hours. Depends on P3 and P4.

- [ ] Implement PaymentProvider simulator with deterministic IDs, states, fees and controls for unknown response, duplicates, failure, delays and reorg. IDs use `local:`; no fake transaction explorer URLs.
- [ ] Implement RFQ collection worker: max 3 concurrent vendor calls, 2-second request deadline, bounded retry inside 5-second collection window; store late/invalid reasons.
- [ ] Implement select → conditions check → prepare → versioned preview flow. Partial vendor failure still yields eligible bids.
- [ ] Implement the separate approve/reserve step before any wallet prompt, then authorize/verify/dispatch after signature; validate the exact frozen wallet descriptor. Simulator can use explicit local signing fixtures; browser test uses a deterministic EIP-1193 test adapter, never a funded production key.
- [ ] Implement authorize → durable submit → reconcile → matched finality → delivery job. Every remote side effect has a recorded attempt identity.
- [ ] Resolve unknown-submission case only by authoritative provider evidence. Do not release caps or switch vendor because an HTTP request timed out.
- [ ] Implement status normalizer and no-backward-finality rules while allowing explicit reorg rollback of provisional inclusion.
- [ ] Build proof bundle and independent `verify:bundle` tool. Digest public snapshots; mark provider/chain assertions unverified when online trusted evidence is unavailable. Exclude raw executable signatures/credentials/paid report contents by default.
- [ ] CLI smoke run produces a verified report; price/payee scenarios stop before signing.

**Acceptance G3:** complete local happy path, blocked drift, duplicate submit, crash after external acceptance, reordered callbacks and delayed delivery cases pass. Receipt prominently says simulator. This gate is not HSP acceptance.

## 8. Phase P6 — Minimal UI, built around the complete state model

**Estimate:** 6–10 hours. Depends on API contracts; work can use deterministic fixtures before live integration.

- [ ] Follow [UI specification](docs/planning/ui.md); implement one route `/` for a new request and `/runs/:rfqId` for persisted workspace.
- [ ] Add app shell, wallet/network/mode status and connect/switch controls.
- [ ] Implement fixture/SKU, quantity, budget and delivery limit form with exact token validation and two example request presets. Do not add an LLM dependency yet.
- [ ] Render live valid/rejected bids, deterministic rank, quoted price/delivery time and clear invalid reasons. All rows keyboard-accessible.
- [ ] Build Conditions Match with actual field/predicate comparison; mismatch visible before payment button exists.
- [ ] Build frozen payment review with full-address details, asset contract/decimals, exact recipient amount/total debit, gas/fee cap and validity.
- [ ] Use wagmi/viem browser wallet integration for login and actual payer SDK signing flow when unlocked. Separate sign-in, payment authorization and any documented execution/approval prompts.
- [ ] Handle account/chain change, stale draft, declined signature, insufficient funds, cap exceeded and unsupported wallets without silent retries.
- [ ] SSE updates reconcile snapshot and events; reconnect does not rerun mutations. Restore route from server on refresh.
- [ ] Receipt shows provider mode, payment/finality/delivery separately, actual explorer links, report download and sanitized proof export.
- [ ] Add protected testnet/local attack selector and safe reset/new-run behavior. Pending payment cannot be reset away.
- [ ] Verify 360px mobile and desktop, keyboard flow, focus, contrast, reduced motion, loading/empty/error/pending/unknown/overdue states.

**Acceptance G4:** happy and tamper runs fully navigable without terminal; user cannot approve stale/ambiguous facts; unknown submission has a reconcile action rather than a retry-pay button.

## 9. Phase P7 — Confirmed real HSP integration

**Estimate:** 6–16 hours after access, depending on SDK completeness. Depends on G0 contract discovery; may expose required earlier schema adjustments.

- [ ] Complete H01–H18 and freeze real adapter profile, SDK revision and trust policy. Keep simulator selectable separately; no runtime auto-switch on error.
- [ ] Implement vendor-owned merchant authentication/canonicalization/JWT and one-time order creation, or confirmed organizer-designated alternate. Get independent signature/canonicalization vectors from gateway responses/tests.
- [ ] Implement payer preparation using actual domain/types/message. Compare signed/effective recipient, asset, amount, chain, authorization validity, nonce, execution target and fee behavior with the approved snapshot.
- [ ] Prove browser wallet flow with no buyer private key on backend. Keep app/merchant/API secrets server-side. Narrow any proxy to confirmed endpoints and fixed hosts.
- [ ] Verify order/token conversion: exact testnet amount, actual recipient credit, total debit, gas sponsorship and any fees. If contract cannot preserve exact quoted units, stop and resolve before live submission.
- [ ] Implement authoritative status queries and receipt/proof association. Test stable IDs and duplicate/replay semantics. Handle unknown create-order vs unknown payer-submit independently.
- [ ] If callbacks are available, capture raw body before JSON parsing, verify HMAC/timestamp/app/provider IDs, insert durable inbox, acknowledge, then reconcile. Add polling even when callbacks work.
- [ ] Validate correct transfer/authorization nonce/event association, relayer vs payer, token and finality. Verify vendor-side evidence independently.
- [ ] Execute a minimum-value real testnet purchase and retrieve/verify the real report. Store sanitized fixture/evidence references and a short recording.
- [ ] Exercise failure/recovery with safe test amounts, including repeat authorization rejection and restart around pending status.
- [ ] Update `hsp-contract.md`, provider fixtures, doctor checks and UI supported capabilities from actual results.

**Acceptance G5:** required topic is proven on the actual HSP deployment and testnet. All IDs/signatures/statuses come from that integration. If headless Payment Agent construction is unavailable and hosted checkout delegation is unapproved, leave this gate incomplete.

## 10. Phase P8 — Adversarial and operational verification

**Estimate:** 5–8 hours. Depends on G3/G4; run live-provider subsets after G5.

- [ ] Implement every P0 row in [verification matrix](docs/planning/verification.md). Test actual negative/recovery behavior, not only object snapshots.
- [ ] Use fake clock and deterministic provider fault injection for expiry/retry tests; keep signature and chain encoding real.
- [ ] Kill/restart buyer and vendor processes at documented persistence boundaries; verify no duplicate spend/fulfilment or disappearing uncertainty.
- [ ] Test session ownership/CSRF/SSRF defenses, redaction and body/rate bounds.
- [ ] Browser E2E tests cover honest, price/payee mismatch, rejected wallet, wrong network, stale review, double click, unknown state, refresh/resume and delivery retrieval.
- [ ] Benchmark 10 concurrent RFQs, API p50/p95, event lag, DB write time and process memory on a documented machine. Separate provider/chain/wallet timing.
- [ ] If app-only p95 exceeds target, profile first; reduce blocking work and repeated queries before introducing new infrastructure.
- [ ] Check database indexes and jobs under repeated callbacks/slow vendor/429; cap stream memory.
- [ ] Run backup/restore into an isolated local instance and reconcile pending IDs without resending. Never reconnect a restored copy with payment-write credentials until ownership is established; avoid two live workers for the same wallet/deployment.

**Acceptance G6:** all P0 negative/recovery cases pass; no unexplained pending financial state is hidden; exact limitations documented.

## 11. Phase P9 — Testnet release, documentation and demonstration

**Estimate:** 3–5 hours. Depends on G5/G6.

- [ ] Build production frontend, serve via API behind HTTPS on a persistent host; vendor host private/allowlisted where possible. Set trusted proxy/origin/cookie settings correctly.
- [ ] Configure actual testnet manifests and server secrets, restrictive file permissions, log rotation, backup schedule and restart policy. Do not deploy SQLite onto ephemeral storage or multiple API replicas.
- [ ] Run `doctor` before the demo: selected profile, SDK/trust pins, correct chain/token/decimals, gas/token balance, vendor/app availability, gateway status, writable DB, worker progress and ingress callback URL.
- [ ] Seed public fixtures/personas only; preserve existing paid/unknown attempts. Demo reset creates a new RFQ or isolated local database, never drops financial history.
- [ ] Write README: quick start, commands/env, service ports, real/local mode, credential setup, tests, architecture, current support and limitations.
- [ ] Record a short demo: request → quotes → exact approval → real HSP payment → evidence → actual report. Run attack with a fresh RFQ and show block before wallet signature; no fictitious slash or reverted transaction.
- [ ] Record backup video and export sanitized proof bundle. Show processing/finality waits honestly; do not compress them into a claimed performance guarantee.
- [ ] Track completion of R01–R20 and G0–G6 with actual logs/test artifacts.

**Definition of testnet done:** real HSP journey, exact field matching, explicit wallet consent, matched chain proof, independently gated verified delivery, recovery protections, useful UI, passing P0 tests and reproducible operations.

## 12. Phase P10 — Optional additions after the core gate

Implement one at a time only if it improves the demonstrable product.

1. **More attack cases:** token, wrong chain, terms/input drift and replay using the existing mismatch engine.
2. **Verified service history:** use only locally observed finalized-and-delivered records; label limited provenance. Ranking remains price-first unless user selects the documented alternative.
3. **Optional integer score:** for valid quotes, priceScore = floor(minValidAmount × 10,000 / amount); deliveryScore = floor((maxAllowedDeliverySeconds − promisedDeliverySeconds) × 10,000 / maxAllowedDeliverySeconds), clamped; score = floor((8 × priceScore + 2 × deliveryScore) / 10). Denominators must be positive. Fixed weights/policy version, visible breakdown and P0 tie-breaks. Do not add fake reputation weights.
4. **Natural-language assistant:** propose form fields only; allowlisted SKU/asset choices, strict JSON validation, explicit confirmation; text never supplies payee, fee policy or executable instructions.
5. **Optional public audit anchor:** noncustodial commitment only. Introduce Foundry, current OpenZeppelin patterns as needed, domain/hash vectors, access/nonce/replay tests and deployment manifest. Publish the trust limit that anchor existence is not gateway enforcement.
6. **Standard A2A adapter:** choose and pin actual protocol specification, add message mapping/auth/task correlation and conformance tests. Preserve payment consent and domain schema.

Do not add an escrow/slashing system as a quick feature. It needs reserved exposure accounting, economic incentives, evidence/adjudication rules, withdrawal liveness and an independent security review.

## 13. Phase P11 — Mainnet migration release gate

No execution on mainnet is part of this planning task. Migration is a later explicit release.

- [ ] Confirm provider permission, supported merchant/payee applications, current payer SDK/API and production rate/fee policy.
- [ ] Review the real adapter and its threat model with actual sandbox evidence. Resolve every unknown involving duplicate execution, signature lifetime or payment association.
- [ ] Reverify mainnet chain ID, token bytecode/decimals/authorization support, gateway/relayer/Permit2/spender/adapter/issuer addresses and finality policy from authoritative sources and chain reads.
- [ ] Create fresh deploymentId, immutable manifest, database namespace, vendor identities/keys and merchant/team credentials; no test records or pending signatures migrated into spendable mainnet state.
- [ ] Use browser wallet only initially, fixed allowlist, minimum purchase, very low per-payment/cumulative caps, explicit fee/gas review, mainnet banner and no attack controls.
- [ ] Ensure HTTPS, secure sessions, correct proxy configuration, secrets handling, dependency review, rate limits, alerts, persistent backups and successful restore drill.
- [ ] Pause new approvals/submissions for release deployment, drain/reconcile testnet pending work and snapshot records. Keep reconciliation available during UI maintenance.
- [ ] Operator explicitly enables mainnet only after checklist is signed off. Run one manually approved low-value canary and verify recipient credit, payer debit, nonce consumption, fee bounds and report delivery.
- [ ] If any discrepancy appears, disable **new** authorizations immediately and continue reconciliation. Reverting application deployment cannot reverse a payment.

## 14. Effort, sequencing and cuts

Local functional vertical slice (G3) is approximately 24–39 focused hours using these estimates. UI, adversarial tests and operational polish add roughly 14–23 hours. Real HSP integration adds 6–16 hours after external access, plus any discovery wait. These are planning estimates, not a deadline or guarantee; re-estimate after the first live browser payment spike.

For the fastest useful build, finish P1→P5, then the four UI states, then live HSP, then recovery/acceptance. Keep P0 access discovery running from the start. Do not spend days building optional chain contracts before proving the mandated payment flow.

Cut first: natural-language input, optional scoring/history, extra attack modes, on-chain anchor, animation, public agent discovery. Keep: receiving-agent conditions, exact quote/mandate checks, browser wallet consent, real HSP gate, integer money, persistence/idempotency/reconciliation, truthful finality/delivery and price/payee attack demo.

## 15. Configuration inventory

| Scope | Planned configuration |
| --- | --- |
| Shared public deployment | DEPLOYMENT_ID, APP_ORIGIN, CHAIN_ID, TOKEN_ADDRESS, TOKEN_DECIMALS, EXPLORER_ORIGIN, PROVIDER_PROFILE/VERSION |
| Buyer server | DB_PATH, ARTIFACT_DIR, session secret, gateway/coordinator credentials only if selected profile requires them, allowed vendors/origins, cap/TTL/request limits |
| Vendor server | Own DB/artifact path, persona IDs/signer keys/payout mapping, peer auth credential, per-app merchant key/app_key/app_secret for merchant profile |
| Provider trust | QA origin, chain RPC, execution/spender/relayer addresses, adapter/issuer pins if applicable, finality policy, canonical policy digest |
| Development | LOCAL_SIMULATOR=true, protected demo controls, unfunded deterministic test identities only in test fixtures |
| Mainnet | ALLOW_MAINNET=false default, new validated manifest and independent release activation |

Never put usable server secrets into VITE_* variables. Store no buyer private key in default server config. Treat a signed raw payer authorization as a secret while executable. Update examples when implementation chooses exact names.

## 16. Requirement-to-delivery map

| Product requirement | Build phases | Primary verification |
| --- | --- | --- |
| R01 confirmed bounded request | P2, P3, P6 | V08–V11, V35–V37 |
| R02 bounded A2A fan-out | P4, P5 | V44 |
| R03 canonical signed offer | P2, P4 | V05–V07 |
| R04 exact eligibility checks | P2 | V04–V11 |
| R05 deterministic selection | P2, P5, P6 | V44 |
| R06 receiving-agent conditions | P4, P5 | V01–V03 |
| R07 pre-sign mismatch block | P2, P5, P6 | V02–V06 |
| R08 actual HSP preparation contract | P0, P7 | H01–H18; V45, V47–V48 |
| R09 exact review and fees | P2, P6, P7 | V09, V33, V48 |
| R10 buyer wallet authorization | P3, P5–P7 | V11, V31–V33 |
| R11 existing gateway execution | P7, P9 | V01 live, V23, V47 |
| R12 durable safe recovery | P3, P5, P8 | V12–V19, V26, V41–V42 |
| R13 associated final settlement | P5, P7 | V20–V26 |
| R14 vendor independent check | P4, P7 | V27 |
| R15 real verified delivery | P4, P5, P7 | V28–V30 |
| R16 private proof bundle | P5, P6 | V39, V43 |
| R17 isolated attack lab | P4, P6 | V38 |
| R18 durable event trail | P3, P6 | V15–V16, V19, V40 |
| R19 safe failure explanation | P5, P6 | V14, V18, V28–V33 |
| R20 independent mainnet gate | P0, P11 | V38, V45–V46 |
