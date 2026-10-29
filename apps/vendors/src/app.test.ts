import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  createRfq,
  compareConditions,
  quoteDigest,
  verifyQuote,
  type SignedQuote,
} from "@proofbid/domain";
import { localSecrets } from "../../../scripts/local.js";
import { vendorApp } from "./app.js";
it("signs offers, preserves them across calls, and exposes conditions drift", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proofbid-vendor-"));
  const secrets = localSecrets(dir);
  const { app } = vendorApp({ dataDir: dir, secrets });
  try {
    const rfq = createRfq(
      {
        fixture: "customers",
        budget: "2",
        maxDeliverySeconds: 60,
        scenario: "price",
      },
      privateKeyToAccount(generatePrivateKey()).address,
    );
    const headers = { authorization: `Bearer ${secrets.peerToken}` };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/vendors/c/rfq",
          payload: { rfq, scenario: "price" },
        })
      ).statusCode,
    ).toBe(401);
    const r = await app.inject({
      method: "POST",
      url: "/vendors/c/rfq",
      headers,
      payload: { rfq, scenario: "price" },
    });
    expect(r.statusCode).toBe(200);
    const signed = r.json<SignedQuote>();
    await verifyQuote(signed, rfq, secrets.vendors[2]!);
    const retry = await app.inject({
      method: "POST",
      url: "/vendors/c/rfq",
      headers,
      payload: { rfq, scenario: "price" },
    });
    expect(retry.json()).toEqual(signed);
    const conditions = await app.inject({
      method: "POST",
      url: "/vendors/c/conditions",
      headers,
      payload: { rfqId: rfq.rfqId, quoteDigest: quoteDigest(signed.quote) },
    });
    expect(compareConditions(signed, conditions.json())).toEqual([
      "amountBaseUnits",
    ]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/vendors/c/fulfil",
          headers,
          payload: { attemptId: rfq.rfqId, rfqId: rfq.rfqId },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});
