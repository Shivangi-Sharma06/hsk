# Verification and acceptance matrix

These are implementation requirements, not tests already run. All P0 cases must pass before testnet release. Simulator tests prove application logic; the live subset additionally proves the actual HSP contract.

## 1. Test layers and evidence

- Domain tests: pure validation, typed signatures, canonical bytes, amounts, ranking and policy.
- Integration tests: real temporary SQLite database and HTTP app/vendor host with deterministic provider faults. Use actual cryptography; do not mock the checks being asserted.
- Browser tests: Playwright against real API/vendor processes and a controlled EIP-1193 test wallet; manual real-wallet test separately.
- Live testnet tests: minimal funded transactions using actual HSP deployment/SDK, preserving sanitized IDs/evidence.
- Operations: process kill/restart and isolated backup/restore. Store test command, profile/version and relevant artifact/log reference with results.

| ID | Priority | Scenario | Required outcome |
| --- | --- | --- | --- |
| V01 | P0 | Full honest A2A request, signed conditions, approve/pay, report | Exact selected facts, one payment, valid deterministic report |
| V02 | P0 | Conditions price inflation | Block before wallet signature/submission; precise reason |
| V03 | P0 | Conditions payee swap | Block before wallet signature/submission |
| V04 | P0 | Token/chain/address case/decimals mismatch | Reject by exact asset/domain rules, not symbol |
| V05 | P0 | Buyer/RFQ/quantity/SKU/input/terms mutation | Signature/hash/preimage checks reject |
| V06 | P0 | Wrong signer, malformed signature, wrong domain or deployment | Reject; no ranking/payment authority |
| V07 | P0 | Reuse quote across buyer/RFQ/chain; repeated quote ID | Reject conflicting/replayed identity |
| V08 | P0 | Zero/negative/huge/exponent/fractional base-unit amounts | Reject; no overflow/rounding/spend |
| V09 | P0 | Over budget, wrong token precision, fees push debit over cap | Block preparation/approval |
| V10 | P0 | Bid collection closed but quote still valid; late bid | Correctly exclude late offer without expiring all accepted quotes |
| V11 | P0 | Quote/preparation expires before/during wallet action | Fresh preparation/reapproval; never silently extend |
| V12 | P0 | Double click; two tabs; different idempotency keys | One active executable attempt and one spend reservation |
| V13 | P0 | Same idempotency key, same/different body | Stable replay for same; 409 for different |
| V14 | P0 | Gateway accepts write then response times out | Unknown state, authoritative reconcile, no fresh payment |
| V15 | P0 | Crash before send, after send, before local response commit | Resume by stable IDs and reconciliation; no duplicate debit |
| V16 | P0 | Expired lease / stale worker resumes | CAS/lease prevents conflicting local transition; external idempotency/reconcile prevents duplicate side effect |
| V17 | P0 | Old payer authorization remains executable after local reject | No fallback/released reservation until revoked/expired and reconciled |
| V18 | P0 | User cancels/logout during pending payment | Pending state/exposure persists; cancellation not misreported as revocation |
| V19 | P0 | Duplicate/reordered/early callback and concurrent poll | Durable inbox, one transition/fulfilment; no state regression |
| V20 | P0 | Forged/stale/raw-body-modified callback | Reject; no fulfilment; no secret leakage |
| V21 | P0 | Gateway says paid but wrong payer/payee/token/amount | No SETTLED_VERIFIED; manual review |
| V22 | P0 | Same amount transfer not linked to order/authorization | Reject unrelated receipt; no transfer reused for two orders |
| V23 | P0 | Relayer broadcasts from own address | Correct payer obtained from documented execution evidence, not tx.from |
| V24 | P0 | Included but not finalized; reorg removes block | Wait, retract provisional state and reconcile; no early delivery |
| V25 | P0 | RPC lacks required finality support / query outage | Explicit blocked/pending policy; no invented confirmation count |
| V26 | P0 | Reverted/dropped/replaced tx or delayed original tx | Reconcile nonce/authorization/replacements; never assume safe new nonce |
| V27 | P0 | Buyer sends vendor a fake “paid” result | Vendor independently rejects |
| V28 | P0 | Paid but vendor offline/non-delivering | Payment retained, DELIVERY_OVERDUE, safe same-order retrieval retry |
| V29 | P0 | Delivery wrong input/order/signature/schema/result | DELIVERY_REJECTED, no fulfilled badge |
| V30 | P0 | Repeated delivery request; vendor restart after delivery | Identical stored artifact/signature, no duplicate charge |
| V31 | P0 | Wallet account/network changes; session vs payment signature | Invalidate unsubmitted draft; session signature never authorizes payment |
| V32 | P0 | Signature rejected/unsupported wallet/insufficient funds | Clear safe stop; no hidden backend signer fallback |
| V33 | P0 | Fee/rate/expiry/recipient changes after review | New snapshot and explicit approval required |
| V34 | P0 | Two simultaneous cap reservations; unknown across UTC rollover | Cap invariant holds; unknown exposure not released at midnight |
| V35 | P0 | Another wallet reads/mutates RFQ/SSE/report/proof | Owner check denies access; no data leak |
| V36 | P0 | Replayed sign-in nonce, wrong domain/URI, CSRF/origin attack | No valid session/mutation |
| V37 | P0 | Untrusted vendor/redirect URL, oversized data, request flood | Fixed target allowlist, size limits and rate controls |
| V38 | P0 | Public attack/reset endpoint in mainnet mode | Unavailable; test controls cannot mutate mainnet |
| V39 | P0 | Browser bundle/logs/SSE/proof export searched for secrets | No keys/cookies/raw executable authorizations/private report contents |
| V40 | P0 | SSE disconnect/cursor gap/slow client; page refresh | Current snapshot + replay, no repeated mutations/unbounded buffers |
| V41 | P0 | SQLite busy/disk full/migration failure | Financial operations fail closed; no in-memory success |
| V42 | P0 | Backup restore with pending attempts | Consistent state; reconcile before writes; no dual active restored instance |
| V43 | P0 | Tampered evidence bundle / offline chain unavailable | Signature/hash mismatch fails; unverified online assertions labeled |
| V44 | P0 | One/two/all vendors time out, late answer, identical-price ties | Bounded response, valid partial results, deterministic ties or explicit no quotes |
| V45 | P0 | Local vs real profile mismatch / gateway unavailable | Clear mode/failure; no automatic simulator or direct-transfer substitution |
| V46 | P0 | Incorrect mainnet/testnet manifest or pending signature copied | Startup/signing blocked; separate deployment identity |
| V47 | P0 | Real gateway duplicate payer signature/nonce replay | One logical spend under protocol semantics; unsafe behavior blocks integration |
| V48 | P0 | Real gateway amount/fee conversion differs from quote | Block/requote before authorization; actual debit/credit verified |
| V49 | P1 | Optional anchor unauthorized write/replayed relay/multi-attempt | Access/domain/nonce/uniqueness tests pass; no custody/settlement claims |
| V50 | P1 | Optional natural-language prompt injection | Only validated form proposal; no payee/authority changes |

## 2. State-machine invariants to assert

1. No path reaches SUBMITTING without verified selected conditions, current approved draft, valid buyer authorization and atomic cap reservation. Reservation precedes the wallet prompt; an interrupted signing round-trip cannot immediately release exposure.
2. At most one unresolved/executable attempt per RFQ. A fulfilled/paid order cannot spawn a new purchase attempt by replaying an API request.
3. Signature reuse and provider IDs are scoped to immutable deployment/profile. Quote ID/digest conflicts cannot overwrite signed evidence.
4. Every committed transition has an event; every pending external effect has a durable job/attempt identity.
5. A transport timeout alone never marks an attempt unpaid or releases pending exposure.
6. Paid state requires complete expected execution/finality association; delivery requires independent receiving-agent verification.
7. A transfer event is credited to at most one order; a verified delivery belongs to exactly one paid attempt.
8. Changing the public approval snapshot changes its digest and invalidates previous approval.
9. No local/unknown/failed state is rendered as real finalized settlement. No delivery failure erases payment evidence.
10. All pending reservations survive process restart and policy rollover; total authorized exposure stays within the configured limits at the approval boundary.

## 3. Live testnet subset

Run V01, V02/V03 before signature, V14–V17 where safely supported, V19/V20, V21–V26 with actual evidence plus controlled fixtures, V31–V33 and V47/V48. Not every fault should be forced through a real external gateway; use signed/live captured fixtures for dangerous or unavailable fault cases and label which were simulated. Perform at least one real browser wallet happy path and actual duplicate authorization test where safe and supported.

Record chain, token, provider/SDK version, request/order/mandate identifiers, tx/log association, observed payer debit/payee credit, finality evidence and verified artifact digest. Redact executable signatures and credentials. A screenshot or a success HTTP code alone is not payment evidence.

## 4. Performance and UI checks

Reference load: 10 simultaneous RFQs, 3 vendor calls each, one API instance, persistent local SQLite. Measure API p50/p95 excluding external waits, offer deadline completion, worker lag, memory and SSE reconnection. Record machine, dataset and versions. Target app-only p95 <150ms and offer results within 6s; tune based on evidence.

UI checks: 360px/desktop layouts, keyboard-only path, contrast/focus, reduced motion, no repeated wallet prompts, full-address/fee review, honest mode labels, inspectable rejection reasons, report/proof private access and clear unknown/overdue states.

## 5. Completion record

During implementation create `docs/verification/testnet-results.md` with date, commit, deployment/version, commands, case IDs, pass/fail, evidence references and known limitations. Mark skipped cases with a reason and owner; do not turn an unrun test into a checkmark. P0 failures block testnet acceptance; unresolved signature/duplicate-payment/finality/secret issues also block mainnet.
