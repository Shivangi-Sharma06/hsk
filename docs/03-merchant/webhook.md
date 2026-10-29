<!-- Source: https://hashkey-merchant.github.io/docs/en/webhook.md | Retrieved: 2026-10-29 | Language: English -->

# Webhook payment notifications

When a payment reaches `payment-included`, `payment-safe`, `payment-finalized`, or `payment-failed`, the gateway POSTs to your configured `webhook_url` so you do not need to poll.

---

## Configuration

`webhook_url` is stored per application (AppCredential) in the merchant console:

1. Sign in → **My Account**
2. Edit the app
3. Set **Payment webhook URL** (`webhook_url`) — **HTTPS only**

**Requirements**

- Respond with HTTP **2xx within 10 seconds** or the delivery is retried
- If `webhook_url` is empty, no callbacks are sent—poll the APIs instead

---

## Signature (HMAC-SHA256)

Each callback includes:

```
X-Signature: t=<unix_timestamp>,v1=<hmac_hex>
```

| Part | Meaning |
|------|---------|
| `t` | Unix seconds when signed |
| `v1` | HMAC-SHA256 hex digest |

### Payload

```
message   = timestamp + "." + raw_request_body
signature = hex(HMAC-SHA256(app_secret, message))
```

The key is your application **`app_secret`**.

### Verification checklist

1. Parse `t` and `v1` from `X-Signature`
2. Ensure `|now - t| ≤ 300` seconds
3. Recompute HMAC with the raw body
4. Compare with `crypto/subtle` / `hmac.Equal` (constant time)

### Go example

```go
func verifyWebhookSignature(r *http.Request, rawBody []byte, appSecret string) error {
    sig := r.Header.Get("X-Signature")
    if sig == "" {
        return fmt.Errorf("missing X-Signature header")
    }

    var ts int64
    var received string
    for _, part := range strings.Split(sig, ",") {
        if strings.HasPrefix(part, "t=") {
            ts, _ = strconv.ParseInt(strings.TrimPrefix(part, "t="), 10, 64)
        } else if strings.HasPrefix(part, "v1=") {
            received = strings.TrimPrefix(part, "v1=")
        }
    }

    if math.Abs(float64(time.Now().Unix()-ts)) > 300 {
        return fmt.Errorf("timestamp out of tolerance")
    }

    msg := fmt.Sprintf("%d.%s", ts, rawBody)
    mac := hmac.New(sha256.New, []byte(appSecret))
    mac.Write([]byte(msg))
    expected := hex.EncodeToString(mac.Sum(nil))

    if !hmac.Equal([]byte(expected), []byte(received)) {
        return fmt.Errorf("signature mismatch")
    }
    return nil
}
```

---

## HTTP request

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Signature` | `t=...,v1=...` |

---

## Payload fields

Amount and fee fields are token-denominated decimal strings (not integer smallest units). Meanings match [payment record fields](api-reference.md#payment-record-fields).

### Common

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | Always `payment` |
| `payment_request_id` | string | ID2 |
| `request_id` | string | ID5 |
| `cart_mandate_id` | string | ID1 |
| `payer_address` | string | Payer wallet |
| `to_pay_address` | string | Payee |
| `amount` | string | Payment amount (token-denominated); same as `pay_amount` |
| `order_amount` | string | Order amount (token-denominated): product amount plus additional charges |
| `product_amount` | string | Product amount (token-denominated) |
| `pay_amount` | string | Payment quantity (token-denominated) |
| `usd_amount` | string | Amount (USD) |
| `gas_fee` | string | Gas fee |
| `gas_fee_amount` | string | Gas fee amount |
| `gas_fee_advanced` | bool | Whether the merchant advances the gas fee |
| `network_fee` | string | Network fee |
| `service_fee` | string | Service fee |
| `base_fee` | string | Base fee |
| `token` | string | Symbol |
| `token_address` | string | Contract |
| `chain` | string | CAIP-2 |
| `network` | string | Network name |
| `status` | string | `payment-included` / `payment-safe` / `payment-finalized` / `payment-failed` |
| `created_at` | string | RFC 3339 |
| `status_reason` | string | Status reason: confirmation detail on success, failure cause on `payment-failed` |

### Success extras

Present once the transaction is on chain (`payment-included` / `payment-safe` / `payment-finalized`):

| Field | Type | Description |
|-------|------|-------------|
| `tx_signature` | string | On-chain transaction hash |
| `included_at` | string | Time the transaction was included in a block (RFC 3339) |
| `completed_at` | string | Completion time (RFC 3339); returned at `payment-finalized` |

---

## Samples

### Finalized (`payment-finalized`)

```json
{
  "event_type": "payment",
  "payment_request_id": "PAY-REQ-20240301-001",
  "request_id": "req_20240301_abc123",
  "cart_mandate_id": "ORDER-20240301-001",
  "payer_address": "0x1234567890abcdef1234567890abcdef12345678",
  "to_pay_address": "0xabcdef1234567890abcdef1234567890abcdef12",
  "amount": "100.30",
  "order_amount": "100.00",
  "product_amount": "99.00",
  "pay_amount": "100.30",
  "usd_amount": "100.25",
  "gas_fee": "0.05",
  "gas_fee_amount": "0.000045",
  "gas_fee_advanced": false,
  "network_fee": "0.05",
  "service_fee": "0.10",
  "base_fee": "0.01",
  "token": "USDC",
  "token_address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "chain": "eip155:11155111",
  "network": "sepolia",
  "status": "payment-finalized",
  "created_at": "2026-03-01T10:00:00Z",
  "tx_signature": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  "completed_at": "2026-03-01T10:03:00Z",
  "included_at": "2026-03-01T10:00:30Z",
  "status_reason": "Block finalized by custody confirmed"
}
```

### Failure (`payment-failed`)

```json
{
  "event_type": "payment",
  "payment_request_id": "PAY-REQ-20240301-002",
  "request_id": "req_20240301_def456",
  "cart_mandate_id": "ORDER-20240301-002",
  "payer_address": "0x1234567890abcdef1234567890abcdef12345678",
  "to_pay_address": "0xabcdef1234567890abcdef1234567890abcdef12",
  "amount": "10.01",
  "order_amount": "10.01",
  "product_amount": "10.00",
  "pay_amount": "10.01",
  "usd_amount": "10.01",
  "gas_fee": "0.006",
  "gas_fee_amount": "0.075",
  "gas_fee_advanced": true,
  "network_fee": "0.006",
  "service_fee": "0.001",
  "base_fee": "0.01",
  "token": "USDC",
  "token_address": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "chain": "eip155:177",
  "network": "hashkey",
  "status": "payment-failed",
  "created_at": "2026-03-01T10:00:00Z",
  "status_reason": "timeout reconciliation: no tx_signature, broadcast never succeeded"
}
```

---

## Your HTTP response

Return **2xx within 10 seconds**:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"code": 0}
```

Only the status code is inspected.

**Best practices**

- Validate business fields (`order_amount`, `pay_amount`, `token`, `cart_mandate_id`) before side effects
- Handlers must be **idempotent**—the same `request_id` may arrive more than once due to retries

---

## Retries

Failed deliveries retry up to **6** times:

| Failure # | Delay |
|-----------|-------|
| 1 | 1 minute |
| 2 | 5 minutes |
| 3 | 15 minutes |
| 4 | 1 hour |
| 5 | 6 hours |
| 6 | 24 hours |

After the final failure the notification is marked `FAILED` and will not retry—query the API for the ground truth.

> [!NOTE]
> Each `request_id` is delivered at most once at the application layer thanks to internal idempotency.
