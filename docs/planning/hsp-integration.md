# HSP integration contract and discovery gate

Status: **real-mode integration not yet verified**. User has no sandbox/credentials as of this plan. This document is a task checklist, not a claim that access has been granted.

## 1. Two documented surfaces

| Surface | Verified documentation says | Missing / implication |
| --- | --- | --- |
| HashKey Merchant | Receiving merchant creates a Cart Mandate; shopper wallet produces a Payment Mandate; Gateway validates and broadcasts; EIP-3009 / Permit2 appear in network support | Closest match to the stated gateway-executes topic. Public merchant docs do not provide the full payer mandate request schema/SDK contract |
| HashFans HSP SDK / Coordinator | SDK `pay()` constructs/signs/registers a mandate, buyer wallet broadcasts an ERC-20 transfer, Coordinator observes; independent verifier checks evidence | SDK repository, Coordinator URL and API key are organizer supplied. Coordinator does not move money; this is a different executor model |

Select **Merchant gateway as the target profile** because the topic explicitly requires execution through the existing Gateway. Ask the organizer to confirm the exact track deployment and provide payer SDK/API access. If organizers instead designate the Coordinator SDK, record that decision and update the executor/approval flow before implementing it. Build one selected real profile; do not silently switch to direct ERC-20 payments when integration is unavailable.

A hosted checkout can prove a real merchant payment but moves Payment Mandate construction into hosted checkout. It is a conditional fallback only if the organizer confirms that delegation satisfies the Payment Agent construction requirement. Otherwise it is a partial integration milestone, not completion of the stated topic.

Sources: [Merchant overview](../03-merchant/README.md), [onboarding](../03-merchant/onboarding.md), [API](../03-merchant/api-reference.md), [Cart Mandate](../03-merchant/cart-mandate.md), [authentication](../03-merchant/authentication.md), [callbacks](../03-merchant/webhook.md), [HSP developer guide](../02-hashfans/HSP.md).

## 2. Known merchant operations and identities

Documented merchant base path: `https://{host}/api/v1`.

| Operation | Documented path / result |
| --- | --- |
| Create one-time order | POST /merchant/orders → payment_request_id, payment_url, multi_pay=false |
| Query one-time payment | GET /merchant/payments with cart_mandate_id, payment_request_id or flow_id |
| Reusable order | Documented, but deliberately excluded from P0 |
| Payer flow | Overview names /api/v1/payment/pay-mandate and flow status; full payload/auth/nonce contract must be obtained before coding |

Do not fabricate `POST /submitSignedMandate`, assume a universal `paymentId`, or derive a `flow_id` by parsing checkout URLs unless explicitly documented. The create-order sample response does not include every identifier discussed by the overview.

Identifier namespaces: cart_mandate_id (merchant order), payment_request_id (merchant payment request), flow_id (gateway flow), payment_mandate_id (payer mandate, described as payment_request_id), request_id (line-item/payment request identity). Save returned IDs with their namespace and deployment. Confirm their uniqueness/reuse semantics with the live API. Coordinator `paymentId=mandateHash` is specific to the other surface.

Merchant requests: HMAC-SHA256 using app_key/app_secret, timestamp and nonce, exact documented method/path/query/body digest. Cart merchant authorization: ES256K JWT, SHA-256 cart_hash under the documented canonicalization rules. Buyer Payment Mandate: wallet authorization per confirmed payer SDK. These signatures are different artifacts and cannot substitute for one another.

## 3. Environment candidates to verify

Public documentation candidates, checked against source text on 2026-10-29:

| Setting | Candidate | Verification |
| --- | --- | --- |
| Merchant QA | https://merchant-qa.hashkeymerchant.com | Obtain permitted app credentials, supported origins and health/access |
| Merchant production | https://hsp.hashkey.com | Mainnet release only; do not use for test funds |
| Merchant staging | https://merchant-stg.hashkeymerchant.com | Docs say mainnet tokens; do not assume staging means testnet |
| HashKey testnet | chainId 133; RPC https://testnet.hsk.xyz | Confirm eth_chainId and organizer deployment |
| Testnet USDC | 0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6, documented 6 decimals / EIP-3009 | Read bytecode/decimals and supported execution contract; fund small test balance |
| HashKey mainnet | chainId 177; RPC https://mainnet.hsk.xyz | Mainnet release only |
| Mainnet bridged USDC | 0x054ed45810DbBAb8B27668922D110669c9D88D0a | Verify again; mainnet contract differs from testnet |

These are source values, not hardcoded authorization to trust arbitrary endpoints. The chosen HSP deployment can pin a different test asset; stop if deployment registry and documentation disagree. Relevant sources: [merchant onboarding](../03-merchant/onboarding.md), [chain network info](../01-chain/Build-on-HashKey-Chain/network-info.md), [token contracts](../01-chain/Build-on-HashKey-Chain/Token-Contracts.md).

## 4. Required organizer / live discovery answers

Do useful local work while awaiting these. Do not invent answers to complete the plan.

| ID | Confirm and record | Required evidence |
| --- | --- | --- |
| H01 | Which deployment/interface satisfies this track? | Organizer/API owner confirmation or official track integration instructions |
| H02 | Merchant onboarding, allowed payees, QA app permissions | Working authenticated read/create with redacted credential names |
| H03 | Payer SDK source/version/install or full REST/OpenAPI schema | Pinned commit/package, local fixture and license; no unverified npm package names |
| H04 | Exact Payment Mandate domain/types/message and signature serialization | Golden payload/signature verified by live gateway |
| H05 | Can Payment Agent construct/inspect mandate before signing? | Separated supported calls or controlled signer hook; actual preview/authorization comparison |
| H06 | What exactly executes on chain and who pays gas? | Token authorization protocol, relayer/spender/facilitator addresses and matched transaction |
| H07 | Nonce/deadline/consumption/revocation semantics | Replay rejected or already-paid queried; signed authorization lifetime documented |
| H08 | Retry and order creation idempotency | Duplicate stable request yields same logical order or authoritative lookup; conflict semantics |
| H09 | Payer submit idempotency and authoritative reconciliation | Timeout experiment or provider contract proving safe lookup; no blind retry |
| H10 | Recipient amount vs USD conversion and all fees | Exact test values and charged/received balances; dynamic rate and expiry behavior |
| H11 | One order cannot spend twice | Replay attempt and unique execution nonce demonstrated |
| H12 | Status progression, failures, replacement/reorg/finality policy | Raw redacted query/callback fixtures and chain finality policy |
| H13 | Callback auth, retries, event identifiers and body format | Verified raw callback and duplicate/reordered cases |
| H14 | Vendor-side verification / payer order accessibility | Vendor can authenticate its own order/status and validate actual transfer association |
| H15 | Browser integration, CORS and server-side secret boundaries | Browser wallet prototype; no merchant/team secret in built JavaScript |
| H16 | Cancellation/authorization expiry and ambiguous writes | Procedure establishing unspendability or documented manual-review stop |
| H17 | User approval binds exactly what executes | Mutated recipient, asset, amount, fee/expiry/target rejected at appropriate boundary |
| H18 | Mapping quote/order/mandate/transaction | Unique private correlation plus cryptographic payment field binding; no invented metadata |

## 5. Mapping worksheet to complete with actual schema

| ProofBid fact | Merchant cart field known today | Payer mandate / on-chain field |
| --- | --- | --- |
| quote/order identity | contents.id; payment_request.details.id | TBD from payer schema; enforce unique order correlation |
| chain | method_data[].data.chain_id / network | TBD signed domain/message and execution chain |
| token | method_data[].data.contract_address | TBD signed/executed contract |
| recipient | method_data[].data.pay_to | TBD signed/executed destination |
| amount | details.total is USD; modifiers can change total | Exact token-denominated debit and recipient amount TBD; conversion cannot be guessed |
| buyer | Not established by merchant creation request alone | TBD recovered payer and transfer/authorization source |
| expiry | contents.cart_expiry | Separate payer signature expiry/nonce TBD |
| fees | modifiers + query fee fields | Exact fee and authorization binding TBD |
| quoteDigest | Private correlation by stable order ID | Provider metadata only if explicitly supported; no assumed quote-validation hook |

One allowed method_data entry in P0, with the exact selected token/network/recipient. No reusable order, method-switching checkout, optional protocol modifier ambiguity or arbitrary redirect. Use an allowlisted callback/redirect origin.

## 6. Unlock criteria and deliverables

Create `docs/integration/hsp-contract.md` during implementation, containing selected profile/version, completed mapping, sanitized real fixtures, auth/status/idempotency semantics and evidence links. Add fixture digests and a pinned SDK revision. Keep secrets out of that file.

Real mode remains disabled until the full journey is demonstrated for the chosen deployment: receiving agent signed conditions → inspected Payment Agent draft → browser wallet signature → existing HSP execution → correctly associated chain payment → receiving agent verification → report delivery. An unrelated transfer with the same numeric amount is not adequate evidence.

If access is still unavailable, complete local functional/security/recovery tests and label the status `Local complete · HSP integration pending`. The absence of a deadline is not a reason to bypass the HSP requirement or use mainnet to work around QA access.
