# ProofBid

Agent-to-agent procurement with signed offers, a payment conditions check, wallet approval, durable recovery and verified delivery.

**Current build: local simulator.** It uses real EIP-712 signatures but moves no funds. Real HSP Gateway payments and mainnet are disabled until the payer SDK/API contract and access are available. A direct ERC-20 transfer is not used as a substitute.

## Run locally

Requires Node **22.23.2** and pnpm **12.16.1**. The runtime is pinned because this build uses Node's SQLite module, which still emits an experimental warning in Node 22. No native database build or Docker is required.

```bash
pnpm install --frozen-lockfile
pnpm seed
pnpm dev
```

Open **http://localhost:5173**. Click **Create demo wallet**, request offers, select a vendor, review and sign the simulated payment, then download the report. The unfunded demo key stays in the browser's session storage; it is not a real wallet service. You can instead connect an injected EOA wallet on HashKey Testnet for the same local-only signatures.

- Web: 5173; buyer API: 3001; receiving-agent host: 3002.
- One report per purchase. Local cap: 10 simulated USDC per purchase and 25 over a rolling 24-hour window, plus all unresolved reservations.
- Test data: customers and inventory fixtures. The receiving agent computes and signs the actual report; the buyer independently checks its contents and signature.
- Use **Attack lab** before starting a run for changed price/payee, lost response or delayed delivery.
- History, active runs, provider receipts, delivery and jobs survive backend restart. Browser refresh restores the current run.
- Disconnecting/logging out cannot cancel a submitted or uncertain payment. A lost response is reconciled using the original attempt, never automatically resubmitted.

`.env` is optional; defaults work locally. Copy `.env.example` only to customize ports/origin/storage. If changing a service port, also update the Vite proxy configuration. Keys and peer credentials are generated with restrictive permissions under ignored `data/`; they are never bundled into the UI. Do not delete that directory to reset a pending run.

## Checks and operations

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e          # first run: pnpm exec playwright install chromium
pnpm smoke             # isolated HTTP flow including accepted/lost response recovery
pnpm run doctor            # config, database, identities and live-mode status
pnpm db:migrate
pnpm build
```

`pnpm test:e2e` starts isolated services on the default ports; stop your dev server first. Its state is separate in `data/e2e`. Browser traces/screenshots and generated build files are ignored by git.

To serve the built UI and both local services without Vite:

```bash
APP_ORIGIN=http://localhost:3001 pnpm start
```

Open http://localhost:3001. Use HTTPS and an explicit public origin before any non-local deployment. The service currently binds to loopback and is intended for local development, not public/mainnet hosting.

Download a proof from a run and check it:

```bash
pnpm verify:bundle ./proofbid-proof.json
pnpm verify:bundle ./proofbid-proof.json --trusted-vendor=0xYOUR_PINNED_VENDOR
```

This verifies canonical consistency and available vendor signatures. Without a separately pinned vendor identity, signer trust is self-declared. The export excludes raw executable payer signatures and report contents. It does **not** prove HSP execution, chain finality or a buyer signature over the exported approval digest.

For a database snapshot, pause both services first so buyer/provider snapshots share a consistent boundary:

```bash
pnpm db:backup ./private-backup
```

Choose a new private target directory outside the repository. The command uses SQLite's backup API; it never overwrites a backup. Secrets are excluded. Restore only into an isolated instance with payment writes disabled until identity/config and pending attempts are reconciled. Never activate two restored copies for the same payment deployment.

## Structure

- `apps/api`: wallet sign-in, owner authorization, RFQs, conditions/approval, durable jobs, spend reservations, SSE and private evidence/report routes.
- `apps/vendors`: three separately keyed receiving-agent personas, signed offers and conditions, local provider receipts and independently gated report delivery.
- `apps/web`: React workspace, wagmi wallet connection and local-only demo wallet.
- `packages/domain`: strict schemas, integer amounts, canonical/EIP-712 hashing, verification, ranking and proof checks.
- `scripts`: seed, readiness, isolated smoke, migration/backup and proof verification.

SQLite uses versioned documents for run/vendor aggregates plus explicit event, job and idempotency tables. One serialized worker and transactional run states enforce a single active attempt per request. The simulator/provider ledger is persisted separately in the receiving-agent database. These local boundaries do not replace a real provider's nonce/idempotency guarantees.

## Integration and limitations

See [how to obtain HSP access](docs/integration/access.md) and [HSP integration status](docs/integration/hsp-contract.md) for the external blocker. Needed next: organizer-confirmed deployment, QA credentials through server-side configuration, payer mandate schema/SDK, replay/revocation semantics and chain-execution association. Do not share usable private keys or secrets in chat.

Implemented and tested: the local signed-offer → conditions comparison → approved simulated payment → signed report journey, drift blocking, spend reservations and lost-response recovery. EOA signatures only. No token approval or transfer is requested by the local payment domain.

Not yet verified: an injected wallet extension manually, real HSP requests/callbacks, on-chain transaction/finality validation, production operations or mainnet. Contract wallets, on-chain anchors, bonds/slashing, arbitrary vendor discovery and cross-chain payments are deferred. Demo personas and prices are configured examples, not an independently operated market.

Further design and results:

- [PRD](prd.md), [architecture](architecture.md), [execution plan](implementation.md)
- [Local verification results](docs/verification/local-results.md)
- [Collected HashKey documentation](docs/README.md)
