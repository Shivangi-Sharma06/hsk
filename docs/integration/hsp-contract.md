# HSP integration status

Live adapter: **disabled**. No sandbox credentials or payer API/SDK schema are available.

Target: HashKey Merchant gateway-executed payment, subject to organizer confirmation. See [integration checklist](../planning/hsp-integration.md). The public merchant API does not establish the payer mandate wire contract, safe retry semantics or execution-to-order association.

Local mode is a simulator. Its wallet signatures use an explicitly named `ProofBidLocalPayment` domain. It never transfers tokens, contacts a chain or produces explorer links. Local completion is not real HSP completion.

Before unlocking real mode, confirm H01–H18, pin the actual SDK/schema and trusted contracts, and capture a real browser-wallet testnet purchase and verified recipient credit. Mainnet remains disabled. No direct ERC-20 fallback will be implemented.

Access research update (2026-10-30): an indexed guide advertises a self-service sandbox, but the hostname currently fails resolution here and its SDK repository returns public 404. The integration surface still needs organizer confirmation. See [access instructions and contact draft](access.md). No claim of current sandbox availability is made.
