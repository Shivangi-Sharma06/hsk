import {
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";
import { canonicalize } from "json-canonicalize";

const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function secret(value: string) {
  if (!value || value.length > 4096)
    throw new Error("Merchant secret is missing or invalid");
  return value;
}
function unix(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Invalid timestamp");
  return value;
}
function json(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (v: unknown, depth = 0): void => {
    if (depth > 32) throw new Error("Merchant JSON is too deeply nested");
    if (v && typeof v === "object") {
      if (ancestors.has(v)) throw new Error("Circular merchant JSON");
      ancestors.add(v);
    }
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number" && Number.isFinite(v)) return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      ancestors.delete(v);
      return;
    }
    if (
      typeof v === "object" &&
      Object.getPrototypeOf(v) === Object.prototype
    ) {
      for (const item of Object.values(v)) visit(item, depth + 1);
      ancestors.delete(v);
      return;
    }
    throw new Error("Expected a finite JSON value");
  };
  visit(value);
  const body = canonicalize(value);
  if (Buffer.byteLength(body) > 65536)
    throw new Error("Merchant body exceeds 64 KiB");
  return body;
}

/** Produces the exact body, query and headers to transmit. Authentication only; caller must validate cart economics separately. */
export function merchantRequest(input: {
  appKey: string;
  appSecret: string;
  method: "GET" | "POST";
  path: string;
  query?: string;
  body?: Record<string, unknown>;
  timestamp?: number;
  nonce?: string;
}) {
  const allowed = [
    "/api/v1/merchant/orders",
    "/api/v1/merchant/orders/reusable",
    "/api/v1/merchant/payments",
    "/api/v1/merchant/payments/reusable",
  ];
  if (!allowed.includes(input.path) || !["GET", "POST"].includes(input.method))
    throw new Error("Unsupported merchant endpoint");
  if (!input.appKey || input.appKey.length > 256 || /[\r\n]/.test(input.appKey))
    throw new Error("Invalid merchant app key");
  if (input.method === "GET" && input.body !== undefined)
    throw new Error("GET requests cannot have a body");
  if (input.method === "POST" && input.body === undefined)
    throw new Error("Order request body is required");
  const query = input.query ?? "";
  if (query.startsWith("?") || /[\r\n#]/.test(query) || query.length > 2048)
    throw new Error("Use the exact encoded query without a question mark");
  const body = input.body === undefined ? undefined : json(input.body);
  const timestamp = unix(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  if (
    !/^(?:[a-fA-F0-9]{12,32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/.test(
      nonce,
    )
  )
    throw new Error("Invalid merchant request nonce");
  const message = [
    input.method,
    input.path,
    query,
    body === undefined ? "" : sha256(body),
    timestamp,
    nonce,
  ].join("\n");
  return {
    method: input.method,
    path: input.path + (query ? `?${query}` : ""),
    body,
    headers: {
      "Content-Type": "application/json",
      "X-App-Key": input.appKey,
      "X-Timestamp": String(timestamp),
      "X-Nonce": nonce,
      "X-Signature": createHmac("sha256", secret(input.appSecret))
        .update(message)
        .digest("hex"),
    },
  };
}

/** Signs the merchant JWT as ES256K with a raw 64-byte JOSE signature, not DER. No buyer key is involved. */
export function merchantAuthorization(input: {
  merchantName: string;
  contents: Record<string, unknown>;
  privateKey: string | KeyObject;
  timestamp?: number;
  expiresIn?: number;
  jti?: string;
}) {
  if (!input.merchantName.trim() || input.merchantName.length > 200)
    throw new Error("Invalid merchant name");
  const key =
    typeof input.privateKey === "string"
      ? createPrivateKey(input.privateKey)
      : input.privateKey;
  if (
    key.type !== "private" ||
    key.asymmetricKeyDetails?.namedCurve !== "secp256k1"
  )
    throw new Error("ES256K requires a secp256k1 private key");
  const iat = unix(input.timestamp ?? Math.floor(Date.now() / 1000)),
    ttl = input.expiresIn ?? 3600;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3600)
    throw new Error("JWT lifetime must be between 1 and 3600 seconds");
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256K", typ: "JWT" }),
  ).toString("base64url");
  const claims = {
    iss: input.merchantName,
    sub: input.merchantName,
    aud: "HashkeyMerchant",
    iat,
    exp: iat + ttl,
    jti: input.jti ?? randomBytes(16).toString("hex"),
    cart_hash: sha256(json(input.contents)),
  };
  const encoded = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${encoded}.${sign("sha256", Buffer.from(encoded), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

/** Checks raw bytes before parsing JSON. A valid callback is a reconciliation hint, never proof of payment or deduplication. */
export function verifyMerchantWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  appSecret: string,
  timestamp = Math.floor(Date.now() / 1000),
): boolean {
  secret(appSecret);
  unix(timestamp);
  if (rawBody.byteLength > 65536 || signatureHeader.length > 256) return false;
  const parts = signatureHeader.split(",").map((v) => v.trim());
  if (parts.length !== 2) return false;
  const t = parts.find((v) => /^t=[1-9][0-9]{0,15}$/.test(v));
  const v1 = parts.find((v) => /^v1=[a-fA-F0-9]{64}$/.test(v));
  if (!t || !v1) return false;
  const at = Number(t.slice(2));
  if (!Number.isSafeInteger(at) || Math.abs(timestamp - at) > 300) return false;
  const expected = createHmac("sha256", appSecret)
    .update(`${at}.`)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(v1.slice(3), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
