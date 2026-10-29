# Minimal UI specification

Product direction: **a payment review desk for agents**. One workspace, a clear recommended offer, a precise authorization comparison and a receipt. The distinctive element is the Conditions Match view, not a general crypto dashboard.

## 1. Layout and visual language

Desktop container approximately 1180px wide, 24px page padding. Warm neutral background, dark ink, subtle borders, one indigo action color. Green/check means verified, amber/clock means pending/uncertain, red/error means blocked; include text/icons so color is never the sole signal. Use the system sans-serif stack and a monospace stack for amounts, IDs and addresses. No gradient hero, token ticker, decorative chart grid, glass panels or navigation sidebar.

Typography: 28px main title, 18px section titles, 14–16px body, 12–13px metadata. Spacing uses 4/8/12/16/24/32px steps. Components use restrained 8px corners; motion is limited to short state transitions with reduced-motion support.

```text
ProofBid              Testnet · HSP Gateway        wallet / network

Request   →   Compare   →   Approve   →   Receipt      History

[Dataset quality report ▾] [fixture ▾] [quantity] [budget] [Get offers]

Receiving agents                         Selected payment
A   0.80 USDC    within 20s   Best price   Conditions Match
B   1.00 USDC    within 10s                [item] [signed] [authorize] [check]
C   0.60 USDC    Blocked: payee changed
                                         You authorize [exact total]
                                         [Review & sign]

Activity: offer received → conditions checked → waiting for approval
```

Prices above are illustrative UI content, not token pricing defaults. Only display real configured fixtures/live amounts in the app.

On small screens use one column: request → offers → comparison → approval → receipt. Avoid a 3-column table that requires horizontal scrolling; stack labeled values in each comparison row. Essential action stays visible without hiding fee/recipient information. No sticky button may cover content.

## 2. Screen states

| State | Main content | Primary action |
| --- | --- | --- |
| Empty | Service/fixture form, budget and two example presets | Get offers, or connect wallet first |
| Collecting | Collection countdown, received/pending/failed vendors | Wait; safe cancel before authorization |
| Ready | Eligible offers with rank and rejected offers with reasons | Select recommended / another eligible offer |
| Checking conditions | Exact selected offer, loading state | Wait; no payment button |
| Conditions mismatch | Highlight changed field and expected/received values | Choose another eligible offer if safely unpaid |
| Awaiting approval | Frozen amount/asset/payee/network/fee/expiry review | Review & sign payment |
| Wallet prompt | Description of exact current wallet action | Complete/reject in wallet; do not spam prompts |
| Submitting/pending | Gateway state, actual IDs, exposure still reserved | View progress |
| Unknown | “Payment status is uncertain. A second payment is blocked.” | Reconcile status |
| Included/finality wait | Provisional chain result, finality policy | View transaction; wait |
| Settled/delivery pending | Paid verified, report not yet delivered | Wait / retrieve same order |
| Fulfilled | Verified report and receipt/evidence | Download report / export proof |
| Delivery overdue/rejected | Payment remains visible, exact delivery issue | Retry retrieval / view evidence |
| Unpaid closed | Verified no executable payment remains | Start newly approved attempt |

Every state has loading, stale-session, network error and retry text appropriate to its actual side effect. A wallet login is labeled “Sign in”; a payment authorization is labeled “Sign payment.” Do not collapse them into “Approve.” If the real protocol needs a distinct token approval or execution transaction, show that exact action and its bounded amount separately.

## 3. Request and bids

Form fields: supported service SKU/fixture (show input digest in details), quantity, maximum total token spend, maximum delivery time. Chain/token are pinned display fields in P0. Inline errors explain base-unit precision and minimum values. Clarify whether displayed budget includes token fees; recipient cap is never substituted for total-debit cap.

Offer rows show vendor, exact quoted recipient amount, promised delivery duration, eligibility and selection. Use “Advertised delivery” until measured. Do not display seeded on-chain reputation or bonds. “Why selected?” explains price-first deterministic order, with full values available. Rejected quotes are collapsed but inspectable.

Collection deadline and offer validity are distinct: “Offers close in 3s” vs “Offer valid for 7m.” Expiry never silently renews; a refreshed quote is new evidence and requires review.

## 4. Conditions Match — the signature interaction

Each row shows constraint/expected offer, observed payment authorization and outcome:

- Buyer identity: RFQ owner and signing wallet.
- Service/input/quantity: immutable request, terms and offer preimage.
- Receiving agent / payee: configured identity and exact payout address.
- Asset: chain ID, token contract, decimals.
- Recipient amount: exact base units and formatted token value.
- Total debit / fees: explicit approved cap and payer-visible fee breakdown.
- Validity: quote lifetime and actual protocol authorization deadline.
- Quote/order binding: real provider IDs and local correlation; label local-only binding honestly.

Mismatch example: “Payee changed: signed offer 0x…A1; received conditions 0x…C9. No payment signature requested.” Never report “Gateway rejected” or “Transaction reverted” if the app stopped the attempt before either occurred.

Hash details are in a disclosure panel. RFQ hash, typed quote digest and mandate hash are separate labeled objects. Show check marks on predicates that pass; do not claim all hashes should be equal.

## 5. Payment review and wallet behavior

Review shows network/mode, recipient name + full-address disclosure/copy, token symbol + full contract disclosure, exact recipient amount, maximum total token debit, all additional fees and native-gas cap if relevant, authorization expiry, actual executor/protocol and policy version. State what the wallet will sign next.

A signature request is triggered only by explicit user interaction on the current draft, after the API has atomically reserved the spend cap and returned the frozen signing descriptor. Do not request wallet signatures from a useEffect, SSE event or reconnect handler. Disable double action while the mutation is pending; backend constraints remain authoritative.

On account/chain change, clear the current approval interaction, show the mismatch and fetch/reprepare if necessary. Preserve existing pending transaction visibility. Insufficient balance or required gas/allowance is shown before signature when possible. An unsupported contract wallet is explained without a broken prompt loop.

A changed fee or mandate refresh brings the user back to review. Closing a wallet modal is not revocation of a signature already submitted.

## 6. Receipt, history and export

Receipt separates three facts: **Authorization verified**, **Payment finalized under policy**, **Report verified**. Show source/profile, actual order/mandate IDs, chain transaction link, exact paid values, evidence verification result and timestamps. No explorer link for simulated IDs. Payment-finality confidence and delivery verification are not the same badge.

Report download is private and owner-authorized. Default proof export includes typed quote/signature, public approval snapshot/digest, public payment facts/IDs and delivery digest/signature, with verification status. Exclude session/API secrets, still-executable raw payment authorizations and paid report contents. Explain that offline bundle consistency cannot itself prove current canonical chain status; live verification may be required.

History is a small owner-only drawer/list, not a separate dashboard: service, selected vendor, amount, mode, payment/delivery status and date. Selecting a run restores the server snapshot. Browser storage is only an optional last-run pointer, not financial source of truth.

## 7. Attack lab and accessibility

Local/testnet “Attack lab” disclosure has scenario selector (honest, price, payee; more later). Choose before a new run; scenarios are stored per run. Mainnet has no attack controls. New run cannot erase pending financial state. Explain the actual failure boundary and whether observed mutated bytes were vendor-signed.

Keyboard reachability, visible focus, semantic labels, polite live-region status updates, error association, full-address copy feedback, minimum touch targets and reduced motion are required. Do not announce every polling tick. Preserve selection/focus when offers update and move focus to a clear failure summary when blocking a signature.

## 8. Component checklist

`AppShell`, `EnvironmentBadge`, `WalletStatus`, `RunStepper`, `RequestForm`, `OfferList`, `OfferRow`, `ConditionsMatch`, `PaymentReview`, `WalletActionState`, `SettlementStatus`, `DeliveryCard`, `ActivityFeed`, `HistoryDrawer`, `AttackLab`, `EvidenceDetails`.

Keep components as ordinary feature files. Introduce a shared component only when actually reused. App state comes from API/query cache plus wallet state; no Redux or elaborate client state machine is needed. Avoid optimistic “paid” updates; optimistic changes are limited to safe UI feedback such as a selected row pending server confirmation.
