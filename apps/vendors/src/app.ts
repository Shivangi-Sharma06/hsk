import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, type Hex } from "viem";
import {
  analyze,
  compareConditions,
  deliveryPayload,
  hash,
  newId,
  nowSeconds,
  parse,
  paymentPayload,
  quoteDigest,
  quotePayload,
  rfqSchema,
  verifyQuote,
  verifySettlement,
  type Delivery,
  type PreparedPayment,
  type Quote,
  type Rfq,
  type Scenario,
  type Settlement,
  type SignedQuote,
} from "@proofbid/domain";
import { Store } from "../../api/src/store.js";
import {
  localSecrets,
  publicVendors,
  type Secrets,
} from "../../../scripts/local.js";

type VendorRecord = { rfq: Rfq; signed: SignedQuote; scenario: Scenario };
export function vendorApp(options: {
  dataDir: string;
  secrets?: Secrets;
  logger?: boolean;
}) {
  const secrets = options.secrets ?? localSecrets(options.dataDir);
  const store = new Store(join(options.dataDir, "vendors.sqlite"));
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 65536,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health/live") return;
    const expected = Buffer.from(`Bearer ${secrets.peerToken}`);
    const got = Buffer.from(req.headers.authorization ?? "");
    if (got.length !== expected.length || !timingSafeEqual(got, expected))
      return reply.code(401).send({ error: "Unauthorized peer" });
  });
  app.setErrorHandler((error, _req, reply) => {
    reply
      .code(400)
      .send({
        error: error instanceof Error ? error.message : "Vendor request failed",
      });
  });
  app.get("/health/live", async () => ({ ok: true, profile: "local" }));
  app.post<{ Params: { id: string }; Body: { rfq: Rfq; scenario: Scenario } }>(
    "/vendors/:id/rfq",
    async (req) => {
      const profile = secrets.vendors.find((v) => v.id === req.params.id);
      if (!profile) throw new Error("Unknown vendor");
      const rfq = parse(rfqSchema, req.body.rfq);
      const key = `${profile.id}:${rfq.rfqId}`;
      const previous = store.get<VendorRecord>("quote", key);
      if (previous) {
        if (hash(previous.rfq) !== hash(rfq))
          throw new Error("Conflicting RFQ");
        return previous.signed;
      }
      if (rfq.collectionClosesAt < nowSeconds()) throw new Error("RFQ closed");
      const scenario = parse(
        (await import("@proofbid/domain")).scenarioSchema,
        req.body.scenario,
      );
      const terms = {
        schemaVersion: 1 as const,
        sku: rfq.sku,
        inputHash: rfq.inputHash,
        analyzerVersion: "1" as const,
        deliveryWithinSeconds: profile.deliverySeconds,
        permittedUse: "buyer-internal-use" as const,
      };
      const quote: Quote = {
        rfqId: rfq.rfqId,
        rfqHash: hash(rfq),
        quoteId: newId(),
        buyer: rfq.buyer,
        vendorSigner: profile.signer,
        payee: profile.payee,
        token: rfq.token,
        amountBaseUnits: profile.amountBaseUnits,
        quantity: "1",
        skuHash: hash(rfq.sku),
        inputHash: rfq.inputHash,
        termsHash: hash(terms),
        issuedAt: nowSeconds(),
        validUntil: nowSeconds() + 600,
        nonce: newId(),
      };
      const signed: SignedQuote = {
        vendorId: profile.id,
        quote,
        terms,
        signature: await privateKeyToAccount(profile.privateKey).signTypedData(
          quotePayload(quote),
        ),
      };
      store.put("quote", key, rfq.buyer, { rfq, signed, scenario });
      return signed;
    },
  );
  app.post<{
    Params: { id: string };
    Body: { rfqId: string; quoteDigest: string };
  }>("/vendors/:id/conditions", async (req) => {
    const record = store.get<VendorRecord>(
      "quote",
      `${req.params.id}:${req.body.rfqId}`,
    );
    if (!record || quoteDigest(record.signed.quote) !== req.body.quoteDigest)
      throw new Error("Unknown offer");
    const signed = structuredClone(record.signed);
    if (req.params.id === "c" && record.scenario === "price")
      signed.quote.amountBaseUnits = (
        BigInt(signed.quote.amountBaseUnits) + 400000n
      ).toString();
    if (req.params.id === "c" && record.scenario === "payee")
      signed.quote.payee = secrets.vendors[0]!.payee;
    return signed;
  });
  app.post<{
    Body: { prepared: PreparedPayment; signature: Hex; signed: SignedQuote };
  }>("/simulator/payments", async (req) => {
    const { prepared: p, signature, signed } = req.body;
    const profile = secrets.vendors.find((v) => v.id === signed.vendorId);
    if (!profile) throw new Error("Unknown vendor");
    const record = store.get<VendorRecord>(
      "quote",
      `${signed.vendorId}:${p.rfqId}`,
    );
    if (!record) throw new Error("Unknown order");
    const existing = store.get<{
      prepared: PreparedPayment;
      settlement: Settlement;
    }>("payment", p.attemptId);
    if (existing) {
      if (hash(existing.prepared) !== hash(p))
        throw new Error("Conflicting payment");
      return existing.settlement;
    }
    await verifyQuote(signed, record.rfq, profile, nowSeconds(), 0);
    if (compareConditions(record.signed, signed).length)
      throw new Error("Changed quote");
    if (
      p.providerProfile !== "local" ||
      p.validUntil < nowSeconds() ||
      p.quoteDigest !== quoteDigest(signed.quote) ||
      p.payer !== signed.quote.buyer ||
      p.payee !== signed.quote.payee ||
      p.token !== signed.quote.token ||
      p.recipientAmountBaseUnits !== signed.quote.amountBaseUnits ||
      p.payerMaxDebitBaseUnits !== p.recipientAmountBaseUnits ||
      p.maxNativeGasWei !== "0" ||
      p.validUntil > signed.quote.validUntil
    )
      throw new Error("Payment conditions mismatch");
    if (
      !(await verifyTypedData({
        ...paymentPayload(p),
        address: p.payer,
        signature,
      }))
    )
      throw new Error("Invalid payer signature");
    const settlement: Settlement = {
      mode: "local",
      attemptId: p.attemptId,
      quoteDigest: p.quoteDigest,
      payer: p.payer,
      payee: p.payee,
      token: p.token,
      amountBaseUnits: p.recipientAmountBaseUnits,
      settledAt: nowSeconds(),
      receiptId: `local:${p.attemptId}`,
    };
    store.transaction(() => {
      if (store.get("consumed", p.quoteDigest))
        throw new Error("Order already paid");
      store.put("consumed", p.quoteDigest, p.payer, { attemptId: p.attemptId });
      store.put("payment", p.attemptId, p.payer, { prepared: p, settlement });
    });
    if (record.scenario === "unknown")
      throw new Error("Simulated response lost after acceptance");
    return settlement;
  });
  app.get<{ Params: { id: string } }>(
    "/simulator/payments/:id",
    async (req, reply) => {
      const payment = store.get<{ settlement: Settlement }>(
        "payment",
        req.params.id,
      );
      if (!payment)
        return reply
          .code(404)
          .send({ error: "Not observed; do not retry automatically" });
      return payment.settlement;
    },
  );
  app.post<{ Params: { id: string }; Body: { attemptId: Hex; rfqId: Hex } }>(
    "/vendors/:id/fulfil",
    async (req) => {
      const record = store.get<VendorRecord>(
        "quote",
        `${req.params.id}:${req.body.rfqId}`,
      );
      const profile = secrets.vendors.find((v) => v.id === req.params.id);
      const payment = store.get<{
        prepared: PreparedPayment;
        settlement: Settlement;
      }>("payment", req.body.attemptId);
      if (!record || !profile || !payment)
        throw new Error("Payment not verified by receiving agent");
      verifySettlement(payment.prepared, payment.settlement);
      if (quoteDigest(record.signed.quote) !== payment.settlement.quoteDigest)
        throw new Error("Wrong payment order");
      const previous = store.get<Delivery>("delivery", req.body.attemptId);
      if (previous) return previous;
      if (
        record.scenario === "slow-delivery" &&
        nowSeconds() <
          payment.settlement.settledAt +
            record.signed.terms.deliveryWithinSeconds +
            2
      )
        throw new Error("Receiving agent delivery delayed");
      const report = analyze(record.rfq.fixture);
      const payload = {
        report,
        attemptId: req.body.attemptId,
        quoteDigest: payment.settlement.quoteDigest,
        artifactHash: hash(report),
        deliveredAt: nowSeconds(),
      };
      const delivery: Delivery = {
        ...payload,
        signature: await privateKeyToAccount(profile.privateKey).signTypedData(
          deliveryPayload(payload),
        ),
      };
      store.put("delivery", req.body.attemptId, record.rfq.buyer, delivery);
      return delivery;
    },
  );
  app.addHook("onClose", async () => {
    store.close();
  });
  return { app, store, vendors: publicVendors(secrets) };
}
