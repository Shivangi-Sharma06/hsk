# ProofBid — Product Requirements Document

Version 2.0 · 2026-10-30 · Testnet first

## 1. Product and track

ProofBid lets a buyer's Payment Agent compare offers from receiving agents, verify their signed payment conditions, construct the corresponding HSP Payment Mandate, obtain the buyer's wallet signature, and settle through the existing HSP Gateway. A visible comparison explains exactly what the buyer will authorize. A proof bundle records what was offered, approved, paid and delivered.

A2A means **Agent-to-Agent** here. Our initial HTTP message format is application-specific; we do not claim conformance with Google's A2A protocol until a standard adapter and its conformance tests exist.

**Required journey:** buyer request → receiving agents' signed conditions → selected conditions → Payment Agent constructs mandate → wallet signs → HSP verifies and executes payment → independently checked settlement → receiving agent delivers.

**Current constraints:** no HSP sandbox or credentials available; no fixed deadline. Start on HashKey testnet. Mainnet is a separate release, not an environment variable toggle. Build a local simulator for development, clearly marked; a simulator or direct ERC-20 transfer does not satisfy real HSP integration.

## 2. Problem and product claims

Receiving agents can change payment conditions after selection. Software can confuse token units, payee addresses, quote expiry, chain IDs, retries or settlement status. ProofBid makes these mismatches explicit before signing, and reconciles uncertain submissions before permitting another payment.

The protection applies to the ProofBid-controlled flow. An off-chain verifier cannot stop a buyer signing elsewhere, a compromised wallet, or a malicious gateway from violating its own contract. A signed quote proves authorization by its signer, not service quality or honesty. A payment signature is not proof of payment. Payment finality is not proof of delivery.

Do not claim that other protocols lack quote binding, that delivery is guaranteed, that funds can be clawed back, or that a local check is enforced by the HSP Gateway.

## 3. Concrete demo product

The initial service is a **signed dataset quality report** for a small fixture dataset. Three receiving agent personas offer the same defined SKU, input digest, report schema and quantity at different prices. The honest service actually computes the report and returns a signed JSON artifact after verified payment.

The report contains row count, duplicate count, missing-field count, input digest, analyzer version and result digest. The buyer verifies the signature, schema, order/input binding and deterministic result. P0 sells one report per RFQ (`quantity=1`); the schema retains quantity for later batch service support. Fixtures are bounded, public and versioned; no arbitrary uploaded files or fetched URLs in P0. This provides real fulfilment without pretending to issue third-party LLM credits.

Three personas may run within one vendor host, with separate identities, HTTP routes and keys. They demonstrate independent message/signature boundaries, not three independently operated businesses. Advertised delivery time is self-reported; historical performance is not invented.

## 4. Scope and priorities

| Priority | Capability | Reason |
| --- | --- | --- |
| P0 | Structured request form, explicit budget, chain/token and buyer | Deterministic inputs |
| P0 | HTTP RFQ exchange with three receiving agent personas | Real A2A boundary |
| P0 | Signed immutable quote and separately transmitted matching conditions | Exposes post-selection drift |
| P0 | Strict validation of buyer, SKU/input, payee, token, amount, chain and expiry | Prevents misdirected authorization |
| P0 | Deterministic ranking with eligibility reasons | Clear vendor choice |
| P0 | Buyer approval of exact prepared payment, wallet signature | Required track flow |
| P0 | HSP Gateway adapter with recorded contract discovery | Existing rail, no replacement gateway |
| P0 | Persisted payment state, idempotency, reconciliation and restart recovery | Avoids duplicate payments |
| P0 | Spend cap, exact fee preview, fresh approval for changed terms | Bounded authority |
| P0 | Settlement evidence checked before delivery | Prevents fake-paid delivery |
| P0 | Real report delivery, verification, single fulfilment per purchase | Completes commerce |
| P0 | Price/payee attack lab, real/local mode indicator, proof export | Distinctive demo |
| P1 | Token/chain/SLA/replay attacks; saved request history | Extend tested paths |
| P1 | Natural-language form assistance, validated and confirmed | Convenience only |
| P1 | Locally measured delivery statistics and integer score breakdown | Useful ranking evidence |
| P1 | Optional noncustodial on-chain commitment anchor | Public timestamp/auditability |
| P2 | Third-party agent standard adapter, API service catalog | Interoperability |
| P2 | Bonds, escrow, disputes and objective slashing | Separate economic design and audit |

Bonds and slashing from v1 are deferred. A buyer's altered unsigned payload is not evidence of vendor misconduct. Conflicting signed messages can be legitimate revisions unless a precise irrevocability rule was accepted. Non-delivery also requires adjudication. No automatic punitive transfer or blacklist is in P0.

## 5. Users and authority

| Actor | Authority |
| --- | --- |
| Buyer | Owns RFQ and session; approves exact payment and signs in wallet |
| Payment Agent | Validates, ranks, builds, checks and submits approved artifacts; never invents authority |
| Receiving Agent | Signs an offer, transmits payment conditions, verifies settlement and delivers |
| HSP Gateway / configured HSP deployment | Performs its documented authorization, execution and status duties |
| Operator | Configures trusted vendors, gateway deployment and test scenarios; cannot silently authorize buyer funds |

Browser wallet keys stay in the wallet. Vendor test keys and merchant credentials stay server-side. The default flow has no backend buyer private key and no unattended payment. Development script wallets are testnet-only, explicitly selected, capped and separated from browser mode.

## 6. Core product requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| R01 | Form produces a confirmed RFQ with buyer, environment, SKU/input hash, quantity, budget and collection deadline | Invalid/incomplete input never starts bidding |
| R02 | Payment Agent sends bounded RFQs concurrently to allowlisted receiving agents | One slow or failed vendor cannot block all bids |
| R03 | Quotes use the canonical signed schema in architecture.md | Every material field is signed or bound by a checked hash |
| R04 | Filter before ranking: verify signer, buyer/RFQ, currency, service, quantity, total, dates and vendor identity | Mutating one field invalidates eligibility |
| R05 | Price is the primary ranking key, then promised delivery duration, then signer address | Identical valid inputs always rank identically |
| R06 | Request selected receiving agent's payment conditions over HTTP | Conditions include original signed quote; any revision requires a new selection |
| R07 | Compare received conditions with selected signed quote and approved policy | Mismatch stops before wallet signature or submission |
| R08 | Prepare a versioned immutable payment draft using confirmed HSP wire schema | Unknown gateway fields/capabilities block real mode |
| R09 | Preview recipient, token contract/network, exact recipient amount, total payer debit, fees and authorization expiry | Symbol alone or a USD label never determines token amount |
| R10 | Sign precisely the approved draft; bind approval digest, wallet address, chain, expiry and policy version | Account/chain/draft changes invalidate approval |
| R11 | Submit through the existing HSP Gateway using its documented payer flow | Real gateway identifiers and chain evidence saved |
| R12 | Persist intent before network side effects; reconcile uncertain writes | Retry/restart/double click never blindly creates a second payment |
| R13 | Validate gateway status and chain evidence against the approved attempt | Wrong transfer, fake callback and pending inclusion cannot unlock delivery |
| R14 | Receiving agent verifies settlement itself before producing the artifact | Buyer-supplied `paid: true` is insufficient |
| R15 | Deliver one signed result for the same quote/order; repeated retrieval is idempotent | Valid schema/input/order/signature/digest and computation verified |
| R16 | Export a sanitized versioned evidence bundle and verification result | No secrets, raw reusable payment authorizations or paid report contents in public export |
| R17 | Isolate demo attacks from real operator actions | Scenario chosen before run; no public production mutation endpoint |
| R18 | Persist and stream an append-only event trail | Reconnecting UI catches up without repeating actions |
| R19 | Explain uncertainty and failure with a next safe action | No spinner hides an ambiguous transfer |
| R20 | Mainnet disabled by default with independent config and checklist | Testnet identifiers and keys cannot silently carry across |

## 7. Canonical economic rules

One testnet chain and one exact token contract are enabled initially. Chain ID 133 and the testnet token in the merchant onboarding docs are discovery candidates, not proof that the organizer's deployment uses the same token. The chosen HSP deployment, RPC chain ID, token bytecode/decimals and supported execution protocol must agree before real mode starts.

Amounts are positive bounded decimal integer strings in token base units. Quantity is a positive bounded integer. No binary floating point, arbitrary currency conversion, partial payments, partial fulfilment, fee-on-transfer tokens or rebasing tokens in P0. Token decimals are read and compared with pinned configuration; a symbol never identifies an asset.

The quote fixes the exact recipient amount. Preparation must also fix the maximum total token debit and bounded gas/other fees, including who receives each fee. If the gateway's USD pricing/conversion cannot guarantee the quote's exact token conditions, block submission or obtain a new signed quote and buyer approval. Do not assume 1 USDC always equals exactly 1 USD. Start with zero additional token fees if the deployment supports it; never assume it does.

Daily spend protection reserves approved maximum debits for pending/unknown payments atomically. Confirmed spent amounts remain in the daily total; only conclusively unspendable/revoked authorization releases an unresolved reservation. Native gas has a separate cap and gas-spent-on-failure accounting. Caps cannot protect the wallet from other apps.

## 8. Workflow and time rules

1. User connects a wallet, confirms testnet, selects fixture/service and budget.
2. RFQ collection window defaults to 5 seconds. Vendor request timeout is 2 seconds; allow one bounded safe retry within the window. Partial vendor failure is visible.
3. Offers have a separate validity window: default 10 minutes, maximum 15 minutes. Collecting bids ends before quote validity. Allow at least 60 seconds for wallet interaction and gateway submission; re-quote otherwise.
4. Validate and rank; user selects/accepts the recommended valid offer.
5. Fetch receiving agent conditions, compare all bound fields, prepare payment and fee preview.
6. Atomically reserve spend, freeze approval snapshot and collect wallet signature.
7. Revalidate signature/snapshot, owner/account/chain, expiry, gateway target and current status, then submit the same attempt once.
8. Observe, reconcile and independently validate the settlement evidence to the pinned finality policy.
9. Receiving agent verifies the payment, generates and signs the report; buyer verifies and retrieves it.
10. Show receipt and allow private evidence export.

A rejected unpaid offer can be replaced with a new attempt only when no old spend authorization can still execute. A new vendor, fee, amount, mandate, expiry or nonce requires new explicit approval. After broadcast or an uncertain submission there is no automatic fallback. A timeout means unknown, not failed. Even a gateway rejection may leave a valid bearer signature executable until revocation/expiry is established.

## 9. Failure and delivery semantics

- No valid bid: show reasons and allow an explicit new RFQ; never raise the budget automatically.
- User rejects signing: stop, retaining request and evidence; no payment side effect.
- Expired quote before authorization: re-quote. Expired quote after submission does not erase an actual payment; reconcile.
- Unknown gateway acceptance or broadcast: freeze attempt and spend reservation; poll confirmed identifiers; do not choose another vendor.
- Reverted/dropped/replaced transaction: reconcile authorization consumption, possible replacements and nonce before allowing a retry. A new on-chain nonce can spend twice if the original authorization remains valid.
- Paid but undelivered: `DELIVERY_OVERDUE`, with signed terms and payment evidence; retry retrieval from the same order. No promise of refund or automatic compensation.
- Invalid report: retain payment status, mark `DELIVERY_REJECTED`, expose evidence and retry/escalation path. Do not mark fulfilled merely from an HTTP 200 or a hash supplied by the same payload.
- Reorg after an earlier inclusion: retract provisional settlement, suspend delivery and reconcile. An already delivered digital artifact cannot be undisclosed; use the conservative configured finality gate.

## 10. UI and success criteria

Use the one-page **Request → Compare → Approve → Receipt** workspace specified in [UI plan](docs/planning/ui.md). The central Conditions Match view compares the offer with the prepared authorization; display RFQ constraints as predicates, not a claim that all three hashes should be equal.

Always show `Local simulator`, `Testnet · HSP Gateway`, or `Mainnet · HSP Gateway`, wallet/network and settlement state. A local event must not look like a real chain transaction.

MVP success means one real HSP testnet payment from receiving-agent conditions through buyer wallet signing, gateway execution, matched chain evidence and verified report delivery; price and payee drift stopped before signing; duplicate/unknown/restart tests pass; clean UI and private proof bundle work. Mock success is a development milestone only.

Application targets: normal non-network API operations p95 under 150 ms on the documented reference machine; bid results within 6 seconds at three vendors; UI acknowledgement within 200 ms with network operations asynchronous. These are measurements to validate, not benchmarks already achieved. Wallet confirmation, external gateway latency and chain finality are reported separately and have no invented 30-second guarantee.

## 11. Mainnet and deferred work

Mainnet needs organizer/API approval, dedicated merchant/vendor credentials and keys, independently verified chain/token/execution addresses, funded gas plan, low caps, stable HTTPS/webhook ingress, restore-tested persistence, dependency/security review and a small manually approved canary. No automatic testnet migration of rows, pending signatures, nonces or vendor identities.

Optional additions follow the P1/P2 table after the real payment acceptance gate. Cross-chain CCIP, tokens beyond the chosen allowlist, escrow, autonomous spending, custom payment contracts and production KYC claims are outside P0.

## 12. Document map

- [Architecture](architecture.md): schemas, backend, persistence, state, endpoints and trust boundaries.
- [Execution plan](implementation.md): ordered tasks, dependencies, acceptance and deployment.
- [Loophole review](docs/planning/loopholes.md): original gaps and how each is resolved.
- [HSP integration gate](docs/planning/hsp-integration.md): known interfaces, unresolved fields and required evidence.
- [Verification matrix](docs/planning/verification.md): adversarial and recovery cases.
- [UI plan](docs/planning/ui.md): layout, content and interaction behavior.
