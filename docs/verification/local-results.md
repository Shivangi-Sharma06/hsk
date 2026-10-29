# Local implementation and verification

Date: 2026-10-30. Provider: local simulator. No HSP/chain transaction was submitted; no mainnet action was taken.

## Implemented boundary

Browser → wallet sign-in → buyer API → durable SQLite request/job → HTTP receiving agents → signed quotes → exact conditions comparison → spend reservation before signature → local payment authorization → durable simulator acceptance → authoritative reconciliation → receiving-agent payment check → actual computed/signed report → buyer verification → private download/proof.

Three separately keyed receiving-agent personas share one vendor host. The local simulator ledger also lives in that process with separate stored records; its trust separation is for development, not an independently operated payment network. No custom custody contract is deployed.

## Automated evidence

Latest checked result: **22 unit/integration tests and 6 browser tests passed**. The production build also completed the browser purchase flow with CSP enabled. A local smoke run completed 10 concurrent RFQs / 30 vendor calls in 179 ms, with create-request HTTP p95 of 22.5 ms on this machine; external HSP/chain latency is excluded.

Commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm smoke`, `pnpm build`, `pnpm run doctor`.

- Domain tests: exact decimal parsing, published EIP-712 reference digest, economic-field mutations, wrong request/terms, approval digest changes, canonical JSON and deterministic report results.
- SQLite tests: transaction rollback, restart persistence, consistent backup and future-schema rejection.
- Vendor tests: peer authentication, repeat quote identity, changed conditions and rejection of unpaid fulfilment.
- Buyer integration tests: honest complete purchase, price/payee drift before authorization, accepted/lost response plus buyer restart, duplicate approvals/submissions, idempotency conflict, owner isolation, pending exposure across policy rollover, corrupt delivery, unsubmitted signature expiry, one-use sign-in, proof redaction and proof verification.
- Desktop/mobile browser tests: complete purchase/download/reload, price drift before wallet prompt, lost-response recovery without another approval, no browser exceptions and no horizontal overflow. Screenshots are generated in ignored `test-results/` and were visually inspected.
- Isolated smoke test: real local HTTP API and vendor exchange, temporary identities/storage, accepted/lost response, original-attempt reconciliation and exactly one simulated payment.

Tests prove local application behavior only. See current test runner output for exact counts; no blanket claim that every scenario in the planned 50-case matrix has passed.

## Deviations kept intentionally small

- Built-in Node SQLite instead of a native driver; runtime pinned, experimental warning documented.
- SQL-backed versioned aggregate documents plus explicit events/jobs/idempotency instead of a prematurely expanded relational schema. Transactional state prevents a second local attempt; real provider replay semantics still require HSP evidence.
- All ProofBid payment routes are scoped to `/api/rfqs/:id`; remote HSP routes are not invented.
- Local total debit equals recipient amount; fees/gas are explicitly zero and simulated. Dynamic/real fees stay behind the integration gate.
- No webhook endpoint for a fictional HSP schema; the local provider is polled/reconciled. Real raw callback authentication/inbox and chain matching remain P7 work.
- No arbitrary report upload, multi-quantity batch, escrow, public vendor registry or private buyer key on the backend.

## Remaining gates

G1 local domain, G2 local persistence/auth/recovery, G3 simulator journey and G4 basic UI are implemented. Real aspects of G0/G5 (payer API access and actual HSP settlement), G6's external/finality/callback cases and testnet release are **not complete**.

Manual extension-wallet review, full accessibility audit, comprehensive load/fault testing, real callback authentication, real chain matching/finality, restore activation procedures and mainnet hardening remain unverified. `ALLOW_MAINNET=true` and any non-local provider profile fail startup. The next task is to obtain and pin the HSP payer SDK/schema and QA access, then implement one real provider profile and run the live acceptance matrix.
