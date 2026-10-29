<!-- Source: https://hashkey-merchant.github.io/docs/en/authentication.md | Retrieved: 2026-10-29 | Language: English -->

# Authentication & signing

Hashkey Merchant APIs use two layers:

1. **HMAC-SHA256 request signing** — required on every Merchant API call; proves origin and integrity
2. **ES256K JWT** — the `merchant_authorization` field when creating orders; proves Cart Mandate authenticity

---

## HMAC-SHA256 request signing

### Required headers

Every `/api/v1/merchant/*` request must include:

| Header | Description | Example |
|--------|-------------|---------|
| `X-App-Key` | Application id | `ak_xxxxxxxx` |
| `X-Signature` | HMAC-SHA256 (hex) | `a1b2c3d4e5f6...` |
| `X-Timestamp` | Unix time (seconds) | `1709123456` |
| `X-Nonce` | Anti-replay nonce (UUID or 12–32 hex chars) | `a3f1b2c4d5e6` |

### Algorithm

**Step 1 — Body hash**

- With a JSON body: serialize the payload with **Canonical JSON**, then compute **SHA-256** over the UTF-8 bytes of that string and encode the digest as **lowercase hex** — that value is `bodyHash` (i.e. `bodyHash = hex(SHA256(canonicalJSON(requestBody)))`).
- Without a body (typical GET): `bodyHash` is the empty string `""` (the message format still includes the blank line for it — see examples below).

**Step 2 — Message string**

Join six parts with newline `\n`:

```
message = "{METHOD}\n{PATH}\n{QUERY}\n{bodyHash}\n{timestamp}\n{nonce}"
```

| Part | Description | Example |
|------|-------------|---------|
| `METHOD` | HTTP method (uppercase) | `POST`, `GET` |
| `PATH` | Full path | `/api/v1/merchant/orders` |
| `QUERY` | Query string without `?`, or empty | `cart_mandate_id=ORDER-123` |
| `bodyHash` | SHA256 of body, or empty | `abc123...` |
| `timestamp` | Unix seconds | `1709123456` |
| `nonce` | Random nonce | `a3f1b2c4d5e6` |

**Step 3 — Sign**

```
signature = hex(HMAC-SHA256(app_secret, message))
```

### Examples

**POST with body**

```
POST\n/api/v1/merchant/orders\n\nabc123def456...\n1709123456\na3f1b2c4d5e6
```

**GET without body**

```
GET\n/api/v1/merchant/payments\ncart_mandate_id=ORDER-123\n\n1709123456\na3f1b2c4d5e6
```

### Security rules

- **Timestamp skew**: ±300 seconds (5 minutes)
- **Nonce uniqueness**: for a given `app_key`, a nonce must not repeat within the 5-minute window

### Bash (POST)

```bash
#!/bin/bash
APP_KEY="your_app_key"
APP_SECRET="your_app_secret"
TS=$(date +%s)
NONCE=$(openssl rand -hex 16)
PATH_ONLY="/api/v1/merchant/orders"
BODY='{"cart_mandate":{...}}'

BODY_HASH=$(printf "%s" "$BODY" | openssl dgst -sha256 -hex | awk '{print $NF}')
SIGN_STR="POST\n${PATH_ONLY}\n\n${BODY_HASH}\n${TS}\n${NONCE}"
SIG=$(printf "%b" "$SIGN_STR" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | awk '{print $NF}')

curl "https://merchant-qa.hashkeymerchant.com${PATH_ONLY}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Nonce: ${NONCE}" \
  -H "X-Signature: ${SIG}" \
  -d "$BODY"
```

### Bash (GET)

```bash
TS=$(date +%s)
NONCE=$(openssl rand -hex 16)
PATH_ONLY="/api/v1/merchant/payments"
QUERY="cart_mandate_id=ORDER-20240301-001"

SIGN_STR="GET\n${PATH_ONLY}\n${QUERY}\n\n${TS}\n${NONCE}"
SIG=$(printf "%b" "$SIGN_STR" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | awk '{print $NF}')

curl "https://merchant-qa.hashkeymerchant.com${PATH_ONLY}?${QUERY}" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Nonce: ${NONCE}" \
  -H "X-Signature: ${SIG}"
```

---

## ES256K JWT (`merchant_authorization`)

When creating an order, `cart_mandate.merchant_authorization` must be a JWT signed with your merchant private key.

### Crypto profile

| Item | Value |
|------|-------|
| **Algorithm** | ES256K (ECDSA, secp256k1, SHA-256) |
| **Curve** | secp256k1 (same as Bitcoin/Ethereum) |
| **JWT header** | `{"alg":"ES256K","typ":"JWT"}` |
| **Private key** | PKCS8 (`BEGIN PRIVATE KEY`) or SEC1 (`BEGIN EC PRIVATE KEY`) |

> [!IMPORTANT]
> JWTs that are not ES256K are rejected.

### Claims

| Claim | Type | Description |
|-------|------|-------------|
| `iss` | string | Issuer — merchant name |
| `sub` | string | Subject — merchant name |
| `aud` | string | Audience — must be `"HashkeyMerchant"` |
| `iat` | int64 | Issued-at timestamp |
| `exp` | int64 | Expiry (e.g. +1 hour from `iat`) |
| `jti` | string | Unique id, e.g. `JWT-{timestamp}-{random}` |
| `cart_hash` | string | SHA-256 of Cart `contents` (64 hex chars) |

### Flow

1. Build **Cart contents**
2. **Canonical JSON** → SHA-256 → `cart_hash` (see [Cart Mandate](cart-mandate.md))
3. **Sign JWT** with ES256K
4. Put the compact JWT into `cart_mandate.merchant_authorization`

### Key generation

```bash
openssl ecparam -name secp256k1 -genkey -noout -out merchant_private_key.pem
openssl ec -in merchant_private_key.pem -pubout -out merchant_public_key.pem
```
