<!-- Source: https://hashkey-merchant.github.io/docs/en/onboarding.md | Retrieved: 2026-10-29 | Language: English -->

# Merchant onboarding

## Steps

1. **Generate a merchant key pair** — secp256k1 (ES256K)
2. **Submit registration details** — organization info, public key, supported chains/tokens
3. **Verify email** — complete signup and bind the organization from the invite link
4. **Create an application** — obtain `app_key` and `app_secret` from the merchant console

---

## 1. Generate a merchant key pair

You need a **secp256k1 (ES256K)** key pair to sign the `merchant_authorization` JWT.

```bash
# EC private key (secp256k1)
openssl ecparam -name secp256k1 -genkey -noout -out merchant_private_key.pem

# Export the public key
openssl ec -in merchant_private_key.pem -pubout -out merchant_public_key.pem
```

> [!IMPORTANT]
> Store the private key only on trusted servers. Never expose it in the browser or commit it to source control.

---

## 2. Submit registration details

Provide the following to operations so they can create an organization invite:

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `organization_name` | Yes | Organization name | `Acme Pay` |
| `email` | Yes | Admin email | `admin@acme.com` |
| `description` | No | Description | `Acme payments team` |
| `default_language` | Yes | Default language | `zh-HK` / `en` |
| `service_rate` | Yes | Service rate (4 decimal places) | `0.0000` |
| `public_key` | Yes | Merchant public key (PEM) | `-----BEGIN PUBLIC KEY-----...` |
| `supported_chain_tokens` | Yes | Supported chain/token list (≥1 row) | See below |

**Mainnet**

| Network | Chain ID | Token | Contract | Decimals | Stablecoin | Protocol |
|---------|----------|-------|----------|----------|------------|----------|
| ethereum | 1 | HSK | `0xe7c6bf469e97eeb0bfb74c8dbff5bd47d4c1c98a` | 18 | No | Permit2 |
| ethereum | 1 | USDT | `0xdac17f958d2ee523a2206206994597c13d831ec7` | 6 | Yes | Permit2 |
| ethereum | 1 | USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | 6 | Yes | EIP-3009 |
| hashkey | 177 | USDC | `0x054ed45810DbBAb8B27668922D110669c9D88D0a` | 6 | Yes | EIP-3009 |
| hashkey | 177 | USDT | `0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029` | 6 | Yes | Permit2 |
| base | 8453 | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | Yes | EIP-3009 |
| arbitrum | 42161 | USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 | Yes | EIP-3009 |
| arbitrum | 42161 | USDT | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` | 6 | Yes | Permit2 |
| bsc | 56 | USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 | Yes | Permit2 |

**Testnet**

| Network | Chain ID | Token | Contract | Decimals | Stablecoin | Protocol |
|---------|----------|-------|----------|----------|------------|----------|
| sepolia | 11155111 | USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 6 | Yes | EIP-3009 |
| sepolia | 11155111 | USDT | `0xff5588b3b38dff1b4b49bfdcbf985e84d8751a0e` | 6 | Yes | Permit2 |
| sepolia | 11155111 | HSK | `0x31bdac8e4b897e470b70ebe286f94245baa793c2` | 18 | No | Permit2 |
| base-sepolia | 84532 | USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 6 | Yes | EIP-3009 |
| hashkey-testnet | 133 | USDC | `0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6` | 6 | Yes | EIP-3009 |
| hashkey-testnet | 133 | USDT | `0x372325443233fEbaC1F6998aC750276468c83CC6` | 6 | Yes | Permit2 |
| bsc-testnet | 97 | USDT | `0xBDec532A2675D3a6a091624b1FE878Ff58a43997` | 18 | Yes | Permit2 |
| arbitrum-sepolia | 421614 | USDT | `0xc52f0FD29292393D253420205BF1dDCc5a0ED224` | 6 | Yes | Permit2 |
| arbitrum-sepolia | 421614 | USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | 6 | Yes | EIP-3009 |

After the invite is created, the admin receives an email link to finish registration and bind the organization.

---

## 3. Application credentials

After you create an app in the console, you receive:

| Field | Description | Usage |
|-------|-------------|-------|
| `app_key` | Application id | Request header `X-App-Key` |
| `app_secret` | Application secret (**keep private**) | HMAC-SHA256 signing |

You can start calling the Merchant APIs. See [Authentication & signing](authentication.md).
