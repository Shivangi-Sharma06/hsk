<!-- Source: https://hashkey-merchant.github.io/docs/en/appendix.md | Retrieved: 2026-10-29 | Language: English -->

# Appendix

## Canonical JSON

`canonicalJSON` is a **deterministic** JSON serialization used for:

- HMAC body hashes
- `cart_hash`
- Avoiding ordering drift between client implementations

### Rules

- Object keys sorted lexicographically before stringify
- Arrays keep input order
- No decorative whitespace
- Identical semantics → identical string

### Example

```json
{
  "b": 2,
  "a": 1,
  "nested": {
    "z": "last",
    "m": "middle"
  }
}
```

Canonical output:

```json
{"a":1,"b":2,"nested":{"m":"middle","z":"last"}}
```

> [!IMPORTANT]
> Never rely on language-default map iteration order for signing or hashing.

## Error codes

### Envelope

```json
{
  "code": 0,
  "msg": "success",
  "data": { }
}
```

- `code = 0` success
- Otherwise `msg` is English

### General (`1xxxx`)

| Code | HTTP | Meaning | Hint |
|------|------|---------|------|
| 10001 | 400 | Invalid parameters | Validate JSON + required fields |
| 10002 | 401 | Unauthorized | Fix HMAC / JWT |
| 10003 | 404 | Not found | Check ids |
| 10004 | 409 | Conflict | Duplicate `payment_request_id`, etc. |
| 10005 | 500 | Internal error | Contact support |
| 10006 | 403 | Forbidden | App permissions |
| 10007 | 429 | Rate limited | Back off |

### Cart Mandate (`4xxxx`)

| Code | HTTP | Meaning | Hint |
|------|------|---------|------|
| 40001 | 400 | Invalid mandate state | Expired or already consumed (one-time) |
| 40002 | 400 | Type mismatch | One-time vs reusable endpoint |
| 40003 | 400 | Mandate disabled | Ask admin |
| 40004 | 400 | Mandate revoked | Create a new mandate |

### Application (`5xxxx`)

| Code | HTTP | Meaning | Hint |
|------|------|---------|------|
| 50001 | 409 | App name exists | Pick another name |
| 50002 | 404 | App missing | Check `app_key` |
| 50003 | 403 | Access denied | User ↔ app mapping |

### Troubleshooting

1. Read `code` to pick the bucket (`1` / `4` / `5`)
2. Read English `msg`
3. Correlate with HTTP status
4. Frequent cases: `40001` reused `cart_mandate_id`; `40002` wrong endpoint; `10004` duplicate `payment_request_id`

---

## Changelog

### v2.3.0 — 2026-10-16

- Added mainnet support for Base (USDC), Arbitrum (USDC, USDT), and BNB Smart Chain (USDT)

### v2.2.0 — 2026-10-12

- Added payment token and network support for BSC Testnet (USDT), Base Sepolia (USDC), and Arbitrum Sepolia (USDC, USDT)

### v2.1.0 — 2026-08-12

- Added `details.modifiers` for payment-method-specific additional charges, including amount validation and `method_data_indexes` matching
- Updated payment query responses with product, order, payment, USD conversion, fee, gas sponsorship, and transaction lifecycle fields

### v1.1.0 — 2026-03-25

- Initial release: one-time & reusable orders + payment queries
- HMAC-SHA256 request auth
- ES256K merchant JWT
- Payment webhooks
- Ethereum Sepolia & HashKey Chain testnet support
