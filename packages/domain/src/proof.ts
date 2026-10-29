import { Type } from "@sinclair/typebox";
import {
  analyze,
  approvalDigest,
  hash,
  parse,
  preparePayment,
  preparedSchema,
  rfqSchema,
  signedQuoteSchema,
  settlementSchema,
  verifyDelivery,
  verifyQuote,
  verifySettlement,
  type Vendor,
} from "./index.js";
const proofSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    mode: Type.Literal("local"),
    chainVerified: Type.Literal(false),
    scope: Type.String(),
    rfq: rfqSchema,
    signedQuote: Type.Union([signedQuoteSchema, Type.Null()]),
    prepared: Type.Union([preparedSchema, Type.Null()]),
    approvalDigest: Type.Union([Type.String(), Type.Null()]),
    settlement: Type.Union([settlementSchema, Type.Null()]),
    delivery: Type.Union([
      Type.Object(
        {
          artifactHash: Type.String(),
          signature: Type.String(),
          deliveredAt: Type.Integer(),
          inputHash: Type.String(),
          analyzerVersion: Type.String(),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    events: Type.Array(Type.Unknown()),
    bundleHash: Type.String(),
  },
  { additionalProperties: false },
);
export async function verifyBundle(value: unknown, trustedVendor?: string) {
  const bundle = parse(proofSchema, value);
  const { bundleHash, ...contents } = bundle;
  if (hash(contents) !== bundleHash) throw new Error("Bundle digest mismatch");
  if (bundle.signedQuote) {
    const s = bundle.signedQuote;
    const vendor: Vendor = {
      id: s.vendorId,
      name: "Self-declared signer",
      signer: s.quote.vendorSigner,
      payee: s.quote.payee,
      amountBaseUnits: s.quote.amountBaseUnits,
      deliverySeconds: s.terms.deliveryWithinSeconds,
    };
    await verifyQuote(s, bundle.rfq, vendor, s.quote.issuedAt, 0);
    if (
      trustedVendor &&
      trustedVendor.toLowerCase() !== s.quote.vendorSigner.toLowerCase()
    )
      throw new Error("Vendor does not match trusted signer");
  }
  if (bundle.prepared) {
    if (!bundle.signedQuote) throw new Error("Missing signed offer");
    const expected = {
      ...preparePayment(bundle.rfq, bundle.signedQuote),
      attemptId: bundle.prepared.attemptId,
    };
    if (
      hash(expected) !== hash(bundle.prepared) ||
      approvalDigest(bundle.prepared) !== bundle.approvalDigest
    )
      throw new Error("Approval/quote binding mismatch");
  }
  if (bundle.settlement) {
    if (!bundle.prepared) throw new Error("Missing payment preparation");
    verifySettlement(bundle.prepared, bundle.settlement);
  }
  if (bundle.delivery) {
    if (!bundle.prepared || !bundle.signedQuote || !bundle.settlement)
      throw new Error("Delivery has no associated payment claim");
    const report = analyze(bundle.rfq.fixture);
    if (
      bundle.delivery.inputHash !== report.inputHash ||
      bundle.delivery.analyzerVersion !== report.analyzerVersion
    )
      throw new Error("Delivery input mismatch");
    await verifyDelivery(
      {
        deliveredAt: bundle.delivery.deliveredAt,
        signature: bundle.delivery.signature as `0x${string}`,
        report,
        attemptId: bundle.prepared.attemptId,
        quoteDigest: bundle.prepared.quoteDigest,
        artifactHash: bundle.delivery.artifactHash as `0x${string}`,
      },
      bundle.prepared,
      bundle.signedQuote,
      bundle.rfq.fixture,
    );
  }
  return {
    integrityValid: true,
    quoteSignatureValid: !!bundle.signedQuote,
    deliverySignatureValid: !!bundle.delivery,
    vendorPinned: !!trustedVendor && !!bundle.signedQuote,
    mode: "local",
    chainVerified: false,
    payerAuthorizationVerified: false,
    note: "Local consistency and vendor signatures only. Raw payer authorization is deliberately excluded. No HSP execution or chain payment is proven.",
  };
}
