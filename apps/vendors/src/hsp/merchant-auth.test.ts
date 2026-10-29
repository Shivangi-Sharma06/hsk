import { expect, it } from "vitest";
import {
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import {
  merchantAuthorization,
  merchantRequest,
  verifyMerchantWebhook,
} from "./merchant-auth.js";
const base = {
  appKey: "test-app-key",
  appSecret: "test-merchant-secret",
  timestamp: 1709123456,
  nonce: "0123456789abcdef0123456789abcdef",
};
it("matches independently calculated POST/GET HMAC vectors and transmits the signed canonical bytes", () => {
  const post = merchantRequest({
    ...base,
    method: "POST",
    path: "/api/v1/merchant/orders",
    body: { b: 2, a: { x: "hello" } },
  });
  expect(post.body).toBe('{"a":{"x":"hello"},"b":2}');
  expect(post.headers["X-Signature"]).toBe(
    "4e44a16b46c945d222f106b596aa09a239fd26a1b1050bbdc995a29d863ca847",
  );
  const get = merchantRequest({
    ...base,
    method: "GET",
    path: "/api/v1/merchant/payments",
    query: "cart_mandate_id=ORDER-123",
  });
  expect(get.body).toBeUndefined();
  expect(get.headers["X-Signature"]).toBe(
    "c416d071b21ec8a691624941e6674db990624955e4d8701ba89da1aa2dd82500",
  );
  expect(get.path).toBe("/api/v1/merchant/payments?cart_mandate_id=ORDER-123");
});
it("rejects invalid JSON, header/query injection and unsupported routes", () => {
  for (const change of [
    { body: { a: undefined } },
    { body: { a: Infinity } },
    { path: "https://example.test" },
    { query: "a=1\nPOST" },
    { appKey: "key\nheader" },
    { nonce: "short" },
    { appSecret: "" },
  ])
    expect(() =>
      merchantRequest({
        ...base,
        method: "POST",
        path: "/api/v1/merchant/orders",
        body: {},
        ...change,
      }),
    ).toThrow();
  expect(() =>
    merchantRequest({
      ...base,
      method: "GET",
      path: "/api/v1/merchant/payments",
      body: {},
    }),
  ).toThrow();
});
it("signs a proper 64-byte ES256K JWT and binds canonical cart contents", () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  const contents = { id: "order-test", cart_expiry: "2026-10-31T00:00:00Z" };
  const token = merchantAuthorization({
    merchantName: "ProofBid",
    contents,
    privateKey: pair.privateKey,
    timestamp: base.timestamp,
    jti: "test-jti",
  });
  const [h, p, s] = token.split(".");
  expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({
    alg: "ES256K",
    typ: "JWT",
  });
  const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
  expect(claims).toMatchObject({
    iss: "ProofBid",
    sub: "ProofBid",
    aud: "HashkeyMerchant",
    iat: base.timestamp,
    exp: base.timestamp + 3600,
    jti: "test-jti",
    cart_hash: createHash("sha256")
      .update('{"cart_expiry":"2026-10-31T00:00:00Z","id":"order-test"}')
      .digest("hex"),
  });
  const signature = Buffer.from(s!, "base64url");
  expect(signature).toHaveLength(64);
  expect(
    verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key: createPublicKey(pair.privateKey), dsaEncoding: "ieee-p1363" },
      signature,
    ),
  ).toBe(true);
  expect(() =>
    merchantAuthorization({
      merchantName: "ProofBid",
      contents,
      privateKey: generateKeyPairSync("ec", { namedCurve: "prime256v1" })
        .privateKey,
    }),
  ).toThrow(/secp256k1/);
});
it("checks raw callback bytes, timestamp bounds and duplicate/malformed signature fields", () => {
  const body = Buffer.from('{ "status": "payment-finalized" }');
  const mac = createHmac("sha256", base.appSecret)
    .update(`${base.timestamp}.`)
    .update(body)
    .digest("hex");
  const header = `t=${base.timestamp},v1=${mac}`;
  expect(
    verifyMerchantWebhook(body, header, base.appSecret, base.timestamp + 300),
  ).toBe(true);
  expect(
    verifyMerchantWebhook(body, header, base.appSecret, base.timestamp + 301),
  ).toBe(false);
  expect(
    verifyMerchantWebhook(
      Buffer.from('{"status":"payment-finalized"}'),
      header,
      base.appSecret,
      base.timestamp,
    ),
  ).toBe(false);
  for (const invalid of [
    header + ",t=1",
    header + ",v1=" + mac,
    "t=NaN,v1=" + mac,
    "t=" + base.timestamp + ",v1=zz",
    header.replace(mac, "0".repeat(64)),
  ])
    expect(
      verifyMerchantWebhook(body, invalid, base.appSecret, base.timestamp),
    ).toBe(false);
});
