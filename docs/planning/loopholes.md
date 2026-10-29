# Loophole review and resolved decisions

Reviewed original prd.md, architecture.md, implementation.md and collected HSP/merchant documentation. These are design findings: application code does not yet exist, so they are not claims of exploited vulnerabilities or completed fixes in running software. The updated specifications resolve the design; implementation tests must verify them.

| ID | Severity | Original gap | Resolution / verification |
| --- | --- | --- | --- |
| L01 | Critical | Merchant Gateway and HSP Coordinator SDK treated as the same API/executor | One explicit selected provider; integration gate H01–H06; no direct-transfer substitute |
| L02 | Critical | Generic submit endpoint, mandate metadata and SETTLED/ACCEPT webhook assumed | Field/status/identifier worksheet; unknown payer schema blocks real mode |
| L03 | Critical | Proxy verifier presented as a gateway-enforced contract hook | State local enforcement boundary honestly; require signed exact payment fields, not an invented hook |
| L04 | Critical | Retry/fallback could pay another vendor while original submission still executes | One executable attempt per RFQ; unknown states reserve spend and reconcile; V12–V18 |
| L05 | Critical | Buyer/server could slash a vendor on altered or insufficient evidence | Remove bonds/slashing from P0; no arbitrary blacklist or custody |
| L06 | High | One commitment per RFQ conflicted with committing a fallback winner | Attempt versions and explicit reapproval; optional anchors keyed by buyer/RFQ/attempt |
| L07 | High | Token/payee not fully bound in initial hash; commitment function omitted token | One canonical typed quote digest binds all facts; no competing hash formulas |
| L08 | High | Signed quote lacked buyer, quantity, SKU/input and delivery preimage | rfqHash + explicit buyer/quantity/SKU/input + termsHash with verified preimage |
| L09 | High | Vendor signer address conflated with payout address | Explicit configured signer/payee mapping; validate both |
| L10 | High | SLA latency used for scoring without a signed source or evidence | Bind promised delivery terms; label self-reported; no fabricated reputation |
| L11 | High | 8-second RFQ expiry also constrained wallet signing and settlement | Separate collection deadline, quote validity, preparation lifetime and protocol authorization expiry |
| L12 | High | RFQ timestamp-derived ID and weak nonce rules | Random IDs/nonces, scoped uniqueness, typed domain salt and chain separation |
| L13 | High | Local state and idempotency trusted to in-memory flags | SQLite transaction/CAS, unique constraints, stable provider IDs and durable jobs |
| L14 | High | Gateway timeout treated like failure | Submission unknown, authoritative lookup, no blind resend or released funds |
| L15 | High | Duplicate click/webhook/status progression could trigger two purchases/deliveries | Durable inbox and unique attempt/order/transfer/delivery identities |
| L16 | High | SETTLED or signed webhook sufficient for fulfilment | Gateway query + correctly associated chain execution + finality + vendor independent check |
| L17 | High | Transaction from assumed to be payer despite gateway relayer | Recover payer from correct authorization/transfer facts and protocol nonce |
| L18 | High | Matching amount/payee transfer could be replayed for a different order | Unique chain/tx/log consumption and mandate/order authorization association |
| L19 | High | USDC symbol/6 decimals assumed; USD and token units mixed | Pin asset contract/decimals/protocol, integer money, explicit conversion/fee constraints |
| L20 | High | Approval could precede changing fees, account, chain or draft | Versioned immutable preparation digest; revalidate before signing/dispatch |
| L21 | High | Wallet cancellation or local expiry assumed to revoke signed authorization | Establish protocol unspendability; preserve unknown reservations across restart/logout |
| L22 | High | Paid non-delivery implied automatic refund/guarantee | Honest delivery-overdue state; no clawback claim; verified real artifact |
| L23 | High | Vendor fulfilment accepted forged buyer callback | Vendor performs own provider/chain verification before releasing goods |
| L24 | High | Agent/admin routes had no access-control/SSRF/ownership definition | Wallet sessions, CSRF/Origin, owner checks, peer credentials and fixed vendor targets |
| L25 | High | Demo mutation and wallet keys risked exposure through public admin or browser | Protected testnet-only scenarios; wallet signing; server secrets and log redaction |
| L26 | Medium | A2A called Account-to-Account, implying different track meaning | Agent-to-Agent messages; no unsupported standard conformance claim |
| L27 | Medium | View verifier listed verification events it cannot emit | No such events in P0; application event stream clearly separated from chain evidence |
| L28 | Medium | Buyer markSettled could mint reputation without proof; Sybil gaming unaddressed | No on-chain reputation in P0; only verified per-deployment local history, labeled |
| L29 | Medium | Bonds had no reserved exposure limit, double-slash or withdrawal solvency model | Defer economic system; require a separate design/audit before introducing it |
| L30 | Medium | Multiple conflicting scoring formulas and unstable ties | One deterministic P0 sort; optional integer weighted formula specified separately |
| L31 | Medium | LLM parsing could invent token/recipient/payment terms | Structured form first; optional parse proposal always validated and confirmed |
| L32 | Medium | Claim all three hashes match despite different objects | Predicates compare RFQ constraints, typed quote fields and actual authorization |
| L33 | Medium | 30-second settlement and automatic 3-minute demo assumed external finality | Measure application time separately; show external waits honestly |
| L34 | Medium | Mock ERC-20 transfer could be counted as HSP completion | Explicit simulator mode; live HSP acceptance gate remains open |
| L35 | Medium | Many services, buses, contract custody and UI screens before real payment | Two service processes, one API/DB worker, React workspace, contracts optional |
| L36 | Medium | Testnet/mainnet treated as configuration swap | Fresh deployment identity/config/credentials, release review and canary |
| L37 | Medium | Delivery receipt hash alone treated as valid quality evidence | Verify schema/input/order/signature and recompute deterministic fixture result |
| L38 | Medium | Full proof export might leak bearer authorizations or paid artifact | Sanitized default bundle; private access, no raw executable authorization or goods |
| L39 | Medium | Crash between remote success and local commit not modeled | Durable intent + stable correlation + authoritative reconcile; manual stop if provider lacks safe semantics |
| L40 | Medium | Delivery SLAs and retries reset on restart, cancellations discarded ambiguity | Persist absolute deadlines, leases, evidence and unresolved financial states |

## Features added because they close real gaps

- Conditions Match: show the precise failed field before a wallet prompt.
- Exact-debit approval: recipient amount, fees, asset contract, network and expiry in one view.
- SpendGuard: atomic per-payment and cumulative limits including pending/unknown exposure.
- Recovery inbox: duplicate/reordered callback processing and explicit reconcile action.
- Private proof export: portable provenance for quote, approval, payment and delivery.
- Signed real report delivery: testable fulfilment instead of invented external API credits.
- Testnet readiness check and explicit mainnet release gate.

## Intentionally deferred

Escrow/bonds/slashing, cross-chain CCIP, reputation tokens, automatic fallback after submission, public arbitrary vendor discovery, agent-managed buyer keys and production autonomy. Each would add trust or economic assumptions without making the required payment journey more complete.
