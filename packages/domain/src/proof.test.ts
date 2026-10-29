import { verifyBundle } from "./proof.js";
import { expect, it } from "vitest";
import { hash, createRfq } from "./index.js";
it("detects bundle changes and never claims chain or payer proof", async () => {
  const rfq = createRfq(
    {
      fixture: "customers",
      budget: "1",
      maxDeliverySeconds: 60,
      scenario: "honest",
    },
    "0x1111111111111111111111111111111111111111",
  );
  const data = {
    schemaVersion: 1,
    mode: "local",
    chainVerified: false,
    scope: "simulation",
    rfq,
    signedQuote: null,
    prepared: null,
    approvalDigest: null,
    settlement: null,
    delivery: null,
    events: [],
  };
  const bundle = { ...data, bundleHash: hash(data) };
  expect(await verifyBundle(bundle)).toMatchObject({
    integrityValid: true,
    chainVerified: false,
    payerAuthorizationVerified: false,
    vendorPinned: false,
  });
  await expect(
    verifyBundle({ ...bundle, scope: "fake success" }),
  ).rejects.toThrow(/digest/);
});
