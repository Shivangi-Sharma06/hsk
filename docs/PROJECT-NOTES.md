# Project research notes

These are implementation implications derived from the collected sources on 2026-10-29, not additional gateway guarantees. The project specifications were revised on 2026-10-30; the current decisions are in [PRD](../prd.md), [architecture](../architecture.md), [execution plan](../implementation.md) and [HSP integration gate](planning/hsp-integration.md). The discussion below records the original research concerns, not the current interface specification.

## Distinguish the two payment integration surfaces before implementation

The original version 1 project plans assumed a signed payment mandate, a submit endpoint, `paymentId`, and a bid-hash metadata binding. The merchant documentation describes a Cart Mandate, merchant ES256K JWT authorization, HMAC-authenticated API calls, and a shopper payment flow. The [HashFans HSP developer guide](02-hashfans/HSP.md), however, explicitly describes payer-signed EIP-712 mandates, wallet-broadcast settlement, receipts and verifier capability checks. These are distinct integration surfaces. Establish which one the hackathon sandbox exposes before choosing an adapter; the merchant Cart API does not disprove the HSP guide. The HSP guide leaves Coordinator URL, API key, faucet and SDK repository as organizer-provided placeholders.

1. Read [onboarding](03-merchant/onboarding.md), [authentication](03-merchant/authentication.md), [Cart Mandate](03-merchant/cart-mandate.md), and [API reference](03-merchant/api-reference.md).
2. For the merchant gateway, build around documented order creation and payment queries with their actual response identifiers. For HSP, follow its mandate/receipt/verifier model and obtain the organizer-provided sandbox and SDK details.
3. Keep vendor EIP-712 quote verification separate from merchant ES256K JWT signing. A shared elliptic curve does not make these formats interchangeable.
4. The JWT `cart_hash` is SHA-256 over canonical Cart contents. Follow the source canonicalization rules, including number and key ordering behavior. Do not substitute the project's EIP-712/Keccak bid hash for this hash.
5. Confirm a documented field or an application-side record can bind the order to `bidHash`. Arbitrary gateway metadata acceptance and a generic `submitSignedMandate` endpoint are not established by the current project plans.

## Authentication and notifications

[Authentication](03-merchant/authentication.md) defines HMAC-SHA256 request signing and ES256K merchant JWT authorization. Provision and protect the appropriate merchant application credentials and signing key.

[Webhook documentation](03-merchant/webhook.md) defines `payment-included`, `payment-safe`, `payment-finalized`, and `payment-failed`. These represent different transaction lifecycle stages; model them explicitly. Verify the timestamp and HMAC over the raw request body, compare in constant time, and acknowledge within the documented timeout. Choose an idempotency key from the documented payload fields rather than assuming the project's `paymentId` placeholder exists.

Amounts and fees in webhook payment records are decimal strings denominated in tokens, not integer smallest units. Keep API amounts distinct from on-chain integer amounts; perform explicit conversion using the selected token's decimals.

## Network selection

Read the current [chain network reference](01-chain/Build-on-HashKey-Chain/network-info.md), [token contracts](01-chain/Build-on-HashKey-Chain/Token-Contracts.md), and [merchant appendix](03-merchant/appendix.md). Chain availability does not establish gateway support for a particular token/network combination. Check the merchant's current support matrix before choosing settlement assets.

The HashFans mirror and current chain documentation can contain different network settings. Treat the current primary chain documentation as the starting reference and verify against the target environment before deployment. Keep testnet and mainnet addresses separate.

## Cross-chain scope

The [Chainlink directory snapshot](04-chainlink/hashkey-mainnet.md) provides HashKey-specific CCIP configuration. An EVM chain ID and a CCIP chain selector serve different purposes. Neither a CCIP lane listing nor a fee token listing establishes merchant settlement support. Recheck full contract addresses and lane status at the linked source when implementing CCIP.

## How to use this library

Use [README](README.md) to locate topics and [sources.json](sources.json) to trace their provenance. Shared-content links replace exact repeated blocks. Different versions are retained rather than silently reconciled. The HashFans HSP guide and merchant API describe different flows; use the reference matching the actual service being integrated. No authenticated endpoint, transaction submission, wallet signing, or webhook delivery was exercised during collection.
