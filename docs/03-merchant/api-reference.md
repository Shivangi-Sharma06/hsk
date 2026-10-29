<!-- Source: https://hashkey-merchant.github.io/docs/en/api-reference.md | Retrieved: 2026-10-29 | Language: English -->

# API reference

Merchant API base path: `https://{host}/api/v1`

All `/merchant/*` routes require [HMAC authentication](authentication.md).

## Base URLs

QA (testnet): `https://merchant-qa.hashkeymerchant.com`

Staging (mainnet tokens only): `https://merchant-stg.hashkeymerchant.com`

Production (mainnet tokens only): `https://hsp.hashkey.com`

## Overview

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| **POST** | `/merchant/orders` | Create one-time payment order | HMAC |
| **POST** | `/merchant/orders/reusable` | Create reusable payment order | HMAC |
| **GET** | `/merchant/payments` | Query one-time payments | HMAC |
| **GET** | `/merchant/payments/reusable` | Query reusable payments | HMAC |

---

## Create one-time order

`POST /merchant/orders`

> Creates a one-time order and returns a checkout URL. The same `cart_mandate_id` cannot be used twice.

**Auth**: HMAC (`X-App-Key`, `X-Signature`, `X-Timestamp`, `X-Nonce`)

### Request body

```json
{
  "cart_mandate": {
    "contents": {
      "id": "ORDER-20240301-001",
      "user_cart_confirmation_required": true,
      "payment_request": {
        "method_data": [
          {
            "supported_methods": "https://www.x402.org/",
            "data": {
              "x402Version": 2,
              "network": "sepolia",
              "chain_id": 11155111,
              "contract_address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
              "pay_to": "0x99c12865b7e4e0cb8a708b448909b76aa1729afd",
              "coin": "USDC"
            }
          }
        ],
        "details": {
          "id": "PAY-REQ-20240301-001",
          "display_items": [
            {"label": "Item A", "amount": {"currency": "USD", "value": "10.00"}},
            {"label": "Item B", "amount": {"currency": "USD", "value": "5.00"}}
          ],
          "total": {"label": "Total", "amount": {"currency": "USD", "value": "15.00"}},
          "modifiers": [
            {
              "supported_methods": "https://www.x402.org/",
              "data": {"method_data_indexes": [0]},
              "additional_display_items": [
                {
                  "label": "Service fee",
                  "amount": {"currency": "USD", "value": "1.00"}
                }
              ],
              "total": {
                "label": "Amount due",
                "amount": {"currency": "USD", "value": "16.00"}
              }
            }
          ]
        }
      },
      "cart_expiry": "2024-03-01T12:00:00Z",
      "merchant_name": "My Store"
    },
    "merchant_authorization": "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ..."
  },
  "redirect_url": "https://yoursite.com/payment/callback"
}
```

### Field reference

| Path | Type | Required | Description |
|------|------|----------|-------------|
| `cart_mandate.contents.id` | string | Yes | Order id (`cart_mandate_id`, ID1) |
| `cart_mandate.contents.user_cart_confirmation_required` | bool | Yes | Require user confirmation |
| `cart_mandate.contents.payment_request.method_data` | array | Yes | Payment methods |
| `method_data[].supported_methods` | string | Yes | Currently `"https://www.x402.org/"` |
| `method_data[].data.x402Version` | int | Yes | Must be `2` |
| `method_data[].data.network` | string | Yes | Network name (e.g. `sepolia`) |
| `method_data[].data.chain_id` | int | Yes | Chain id |
| `method_data[].data.contract_address` | string | Yes | Token contract |
| `method_data[].data.pay_to` | string | Yes | Payee address |
| `method_data[].data.coin` | string | Yes | Symbol (e.g. `USDC`) |
| `details.id` | string | Yes | `payment_request_id` (ID2) |
| `details.display_items` | array | No | Line items |
| `details.total` | object | Yes | Merchandise total (`label` + `amount`); currency must be `USD` |
| `details.modifiers` | array | No | Additional charges applied by payment protocol |
| `details.modifiers[].supported_methods` | string | Yes | Protocol this modifier applies to. Currently `"https://www.x402.org/"`. It does not describe a chain, contract, or payee |
| `details.modifiers[].additional_display_items` | array | Yes | Additional charges; must be non-empty. Checkout aggregates multiple entries |
| `details.modifiers[].additional_display_items[].label` | string | Yes | Additional charge description |
| `details.modifiers[].additional_display_items[].amount` | object | Yes | Additional charge amount; currency must be `USD` |
| `details.modifiers[].total` | object | No | Amount due as `label` + `amount` (`currency` + `value`). When present, the value must be greater than 0 and the currency must be `USD` |
| `details.modifiers[].data.method_data_indexes` | array of int | No | Zero-based indexes into `payment_request.method_data`. When omitted, the modifier applies to every `method_data` entry with the same normalized `supported_methods` |
| `contents.cart_expiry` | string | Yes | RFC 3339 expiry (~2h typical) |
| `contents.merchant_name` | string | Yes | Merchant display name |
| `merchant_authorization` | string | Yes | ES256K JWT — [Authentication](authentication.md) |
| `redirect_url` | string | No | Post-payment redirect |

> [!IMPORTANT]
> `additional_display_items` must be non-empty. When `modifier.total` is present, `modifier.total.amount.value` must be greater than 0 and equal `details.total.amount.value` plus the additional items. `10.0` and `10.00` compare equal as decimals. Omitting `method_data_indexes` applies the modifier to every `method_data` entry with the same normalized `supported_methods`. Different additional charges require explicit indexes, and the same index cannot be matched by two modifiers. An option that matches a modifier with `total` uses `modifier.total`; otherwise it uses the root `details.total`. Violations return `10001`. See [Building a Cart Mandate](cart-mandate.md#modifiers) for details.

### Success response

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "payment_request_id": "PAY-REQ-20240301-001",
    "payment_url": "https://pay.hashkey.com/flow/xxx",
    "multi_pay": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `payment_request_id` | string | ID2 |
| `payment_url` | string | Checkout URL for the payer |
| `multi_pay` | bool | Always `false` for one-time orders |

> [!NOTE]
> Duplicate `cart_mandate_id` returns `40001`. For multiple charges on the same device/sku, use the reusable order API.

---

## Create reusable order

`POST /merchant/orders/reusable`

> Same `cart_mandate_id` can be paid multiple times over its lifetime.

**Auth**: HMAC

**Body / response**: Same shape as one-time, except `multi_pay` is `true`.

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "payment_request_id": "PAY-REQ-001",
    "payment_url": "https://pay.hashkey.com/flow/xxx",
    "multi_pay": true
  }
}
```

> [!IMPORTANT]
> Set `cart_expiry` to cover the full lifecycle (e.g. rental period). Too short blocks future payments.

---

## Query one-time payments

`GET /merchant/payments`

> Exactly **one** of the query parameters below.

**Auth**: HMAC

### Query parameters

| Name | In | Type | Description |
|------|-----|------|-------------|
| `cart_mandate_id` | query | string | By ID1 — returns an array |
| `payment_request_id` | query | string | By ID2 — single object |
| `flow_id` | query | string | By ID3 — single object |

### Examples

```bash
GET /api/v1/merchant/payments?cart_mandate_id=ORDER-20240301-001
GET /api/v1/merchant/payments?payment_request_id=PAY-REQ-20240301-001
GET /api/v1/merchant/payments?flow_id=b660fdc3-ac04-437f-921f-efbfb8d089f7
```

### Sample (`payment_request_id` or `flow_id`)

```json
{
  "code": 0,
  "data": {
    "app_key": "ABCD1234",
    "base_fee": "0.0010",
    "broadcast_at": "2026-01-06T15:06:30Z",
    "chain": "eip155:11155111",
    "completed_at": "2026-01-06T15:10:30Z",
    "content_id": "cart_123456",
    "created_at": "2026-01-06T15:04:05Z",
    "deadline_time": "2026-01-06T16:04:05Z",
    "extra_protocol": "eip3009",
    "flow_id": "FLOW123456",
    "gas_fee": "0.05",
    "gas_fee_advanced": true,
    "gas_fee_amount": "0.000045",
    "gas_limit": 100000,
    "included_at": "2026-01-06T15:08:00Z",
    "network": "sepolia",
    "network_fee": "0.05",
    "pay_amount": "100.30",
    "payer_address": "0x1234567890abcdef",
    "payment_request_id": "7glTuOSMKPZwmXZV4hbS",
    "order_amount": "100.00",
    "product_amount": "99.00",
    "request_id": "20260106150405123456",
    "status": "payment-finalized",
    "status_reason": "Verification failed",
    "to_pay_address": "0xabcdef1234567890",
    "token": "USDC",
    "token_address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "tx_signature": "0xabcd1234...",
    "updated_at": "2026-01-06T15:05:30Z",
    "usd_additional_amount": "1.00",
    "usd_amount": "100.25",
    "usd_amount_rate": "1",
    "usd_pay_amount": "100.30",
    "usd_product_amount": "99.25"
  },
  "msg": "string"
}
```

Queries by `cart_mandate_id` return an array of the same payment record objects in `data`.

---

## Query reusable payments

`GET /merchant/payments/reusable`

> Paginated list or single row. **One** filter at a time.

**Auth**: HMAC

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `cart_mandate_id` | string | — | Page by ID1 |
| `flow_id` | string | — | Page by ID3 |
| `request_id` | string | — | Single row by ID5 |
| `page` | int | `1` | Page number |
| `page_size` | int | `20` | Page size |

### Examples

```bash
GET /api/v1/merchant/payments/reusable?cart_mandate_id=DEVICE-001&page=1&page_size=20
GET /api/v1/merchant/payments/reusable?flow_id=b660fdc3-ac04-437f-921f-efbfb8d089f7&page=1&page_size=20
GET /api/v1/merchant/payments/reusable?request_id=req_20240301_abc123
```

### Paged response

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "app_key": "ABCD1234",
        "base_fee": "0.0010",
        "broadcast_at": "2026-01-06T15:06:30Z",
        "chain": "eip155:11155111",
        "completed_at": "2026-01-06T15:10:30Z",
        "content_id": "cart_123456",
        "created_at": "2026-01-06T15:04:05Z",
        "deadline_time": "2026-01-06T16:04:05Z",
        "extra_protocol": "eip3009",
        "flow_id": "FLOW123456",
        "gas_fee": "0.05",
        "gas_fee_advanced": true,
        "gas_fee_amount": "0.000045",
        "gas_limit": 100000,
        "included_at": "2026-01-06T15:08:00Z",
        "network": "sepolia",
        "network_fee": "0.05",
        "pay_amount": "100.30",
        "payer_address": "0x1234567890abcdef",
        "payment_request_id": "7glTuOSMKPZwmXZV4hbS",
        "order_amount": "100.00",
        "product_amount": "99.00",
        "request_id": "20260106150405123456",
        "status": "payment-finalized",
        "status_reason": "Verification failed",
        "to_pay_address": "0xabcdef1234567890",
        "token": "USDC",
        "token_address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "tx_signature": "0xabcd1234...",
        "updated_at": "2026-01-06T15:05:30Z",
        "usd_additional_amount": "1.00",
        "usd_amount": "100.25",
        "usd_amount_rate": "1",
        "usd_pay_amount": "100.30",
        "usd_product_amount": "99.25"
      }
    ],
    "total": 15,
    "page": 1,
    "page_size": 20
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `list` | array | Rows, newest `created_at` first |
| `total` | int | Total count |
| `page` | int | Current page |
| `page_size` | int | Page size |

---

## Payment record fields

Returned on all payment queries (`PaymentItemResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | string | `cart_mandate.contents.id` |
| `payment_request_id` | string | ID2 |
| `request_id` | string | ID5 |
| `flow_id` | string | ID3 |
| `app_key` | string | Application id |
| `product_amount` | string | Product amount (token-denominated) |
| `order_amount` | string | Order amount (token-denominated): product amount plus additional charges |
| `pay_amount` | string | Payment quantity (token-denominated) |
| `usd_product_amount` | string | Product amount (USD) |
| `usd_additional_amount` | string | Additional charges (USD) |
| `usd_amount` | string | Amount (USD) |
| `usd_amount_rate` | string | Exchange rate between USD and the token |
| `usd_pay_amount` | string | Final payment amount (USD) |
| `token` | string | Symbol |
| `token_address` | string | Token contract |
| `payer_address` | string | Payer |
| `to_pay_address` | string | Payee |
| `chain` | string | CAIP-2 (e.g. `eip155:11155111`) |
| `network` | string | Network name |
| `extra_protocol` | string | On-chain payment protocol (`eip3009` / `permit2`) |
| `base_fee` | string | Base fee |
| `network_fee` | string | Network fee |
| `gas_fee` | string | Gas fee |
| `gas_fee_amount` | string | Gas fee amount |
| `gas_fee_advanced` | bool | Whether the merchant advances the gas fee |
| `gas_limit` | int | Gas limit |
| `status` | string | See [state machine](cart-mandate.md#payment-state-machine) |
| `status_reason` | string? | Status reason |
| `tx_signature` | string | Tx hash once included on chain |
| `deadline_time` | string | Payment deadline |
| `created_at` | string | Created time |
| `updated_at` | string | Updated |
| `broadcast_at` | string? | First broadcast time |
| `included_at` | string? | Time the transaction was included in a block |
| `completed_at` | string? | Completion time |

---

## Envelope

```json
{
  "code": 0,
  "msg": "success",
  "data": { }
}
```

- `code = 0` → success
- `code != 0` → error; `msg` is English
- See [Appendix — Error codes](appendix.md#error-codes)
