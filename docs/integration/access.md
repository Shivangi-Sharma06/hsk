# Getting HSP access for this hackathon

Checked 2026-10-30. No account was created, no message sent, no credentials obtained and no funds requested.

## 1. Contact the listed organizers

The [organizer-hosted event listing](https://luma.com/hashkey-demo-day-mumbai) links the supplied [DoraHacks event](https://dorahacks.io/hackathon/hskchainindia/detail), confirms that the payments track must use HSP, and lists:

- Telegram contact: [@cmonvivek24](https://telegram.me/cmonvivek24)
- Community: [organizer Telegram group](https://t.me/+LBRNQQKVmo83OTg1)
- Registration/submission deadline: **November 1, 2026, 21:30 IST**.

DoraHacks itself returned a human-verification challenge to automated retrieval. Detailed eligibility rules, especially any mandatory mainnet contract deployment, need direct confirmation there or from the organizers. Do not treat a third-party summary as verified eligibility.

## 2. Current access evidence

| Resource | What was checked | Result |
| --- | --- | --- |
| DoraHacks detail | Direct GET and web retrieval | HTTP 405 / human verification; exact rules not readable here |
| HSP sandbox | hsp-hackathon.hashkeymerchant.com | Local DNS resolution failed; web retrieval also failed |
| SDK | github.com/project-hsp/hsp, GitHub API | Public repository lookup returned 404; could be private, moved or removed |
| Merchant QA | merchant-qa.hashkeymerchant.com | HTTP 403; this does not establish an authenticated API failure |
| Merchant English onboarding source | hashkey-merchant.github.io/docs/en/onboarding.md | HTTP 200; source available |

The [indexed HSP deployment guide](https://hsp-hackathon.hashkeymerchant.com/docs) advertises `/register` for a team write key, `/faucet/` for test funds and `/chains` for trust/configuration data, and links the SDK repository above. These are **unverified current access paths**, not working credentials. It describes a Coordinator flow; confirm whether that or Merchant Gateway is the required track surface.

## 3. Message to send

> Hi, I’m building ProofBid for the Mumbai Agent Payments & A2A Settlement track. The local A2A, signed-quote, wallet-approval and verification flow is working. Could you share:
>
> 1. Which integration satisfies this track: HashKey Merchant Gateway or the HSP Coordinator SDK?
> 2. The current sandbox/QA URL and team API-key onboarding. The previously indexed sandbox hostname does not resolve from my environment.
> 3. The payer SDK/OpenAPI link or GitHub repository access. `project-hsp/hsp` currently returns 404 publicly. My GitHub username is [username].
> 4. The supported Payment Mandate construction, wallet signature and submission examples, plus retry/nonce/revocation semantics.
> 5. HashKey testnet gas/stablecoin faucet and the trusted token, adapter/relayer/execution contract addresses.
> 6. Whether mainnet smart-contract deployment is mandatory for submission, or a testnet demo is accepted initially.
>
> Team/project: [name]. Please send private credentials through your official onboarding channel, not a public group.

The message is a draft only. It has not been sent.

## 4. If they require Merchant onboarding

Follow the [English onboarding guide](https://hashkey-merchant.github.io/en/index.html#/onboarding) / [saved source](../03-merchant/onboarding.md). Prepare organization name, admin email, project description, a merchant **public** secp256k1 key, supported chain/token details and the requested service-rate setting. Operations sends an invite; after registration, create an app to obtain `app_key` and `app_secret`.

Only after confirming that this is the correct surface, generate a separate merchant signing key locally:

```bash
mkdir -p data/merchant
chmod 700 data/merchant
# Choose unused filenames; never overwrite an existing signing key.
openssl ecparam -name secp256k1 -genkey -noout -out data/merchant/merchant-private.pem
chmod 600 data/merchant/merchant-private.pem
openssl ec -in data/merchant/merchant-private.pem -pubout -out data/merchant/merchant-public.pem
```

Send only the public key. Keep the private key and app secret in server-side configuration. This is a merchant authorization key, not the buyer's wallet private key. Do not assume this app credential supplies the undocumented payer API contract; request that separately.

## 5. When details arrive

Record the confirmed surface, pinned SDK revision, endpoint schema and trust configuration in [hsp-contract.md](hsp-contract.md). Store credentials locally outside git; do not paste secrets into chat. Then implement the selected real provider and complete H01–H18 in the [integration gate](../planning/hsp-integration.md), using small testnet amounts first. Live and mainnet mode remain disabled until that evidence exists.
