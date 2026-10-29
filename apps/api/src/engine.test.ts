import { verifyBundle } from "../../../packages/domain/src/proof.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  paymentPayload,
  quoteDigest,
  type RequestInput,
  type Run,
} from "@proofbid/domain";
import { vendorApp } from "../../vendors/src/app.js";
import { readConfig } from "./config.js";
import { Engine } from "./engine.js";
import { createApp } from "./app.js";
import { localSecrets } from "../../../scripts/local.js";
const buyer = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
let dir: string;
let vendor: ReturnType<typeof vendorApp>;
let engine: Engine;
const input: RequestInput = {
  fixture: "customers",
  budget: "2",
  maxDeliverySeconds: 60,
  scenario: "honest",
};
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "proofbid-flow-"));
  const secrets = localSecrets(dir);
  vendor = vendorApp({ dataDir: dir, secrets });
  const vendorOrigin = await vendor.app.listen({ port: 0, host: "127.0.0.1" });
  engine = new Engine(readConfig({ DATA_DIR: dir }), { secrets, vendorOrigin });
});
afterEach(async () => {
  await engine.stop();
  await vendor.app.close();
  rmSync(dir, { recursive: true, force: true });
});
const create = async (scenario: RequestInput["scenario"] = "honest") => {
  const { id } = engine.create(
    buyer.address,
    { ...input, scenario },
    crypto.randomUUID(),
  );
  await engine.workOnce();
  expect(engine.run(id, buyer.address).state).toBe("READY");
  return id;
};
const select = async (id: string, vendorId = "a") => {
  const run = engine.run(id, buyer.address);
  const offer = run.quotes.find((q) => q.vendorId === vendorId)!.signed!;
  engine.select(
    buyer.address,
    id,
    quoteDigest(offer.quote),
    run.version,
    crypto.randomUUID(),
  );
  await engine.workOnce();
  return engine.run(id, buyer.address);
};
const authorize = async (run: Run) => {
  const approved = engine.approve(
    buyer.address,
    run.id,
    run.approvalDigest!,
    run.version,
    crypto.randomUUID(),
  );
  const signature = await buyer.signTypedData(
    paymentPayload(approved.prepared),
  );
  await engine.authorize(
    buyer.address,
    run.id,
    run.approvalDigest!,
    signature,
    approved.version,
    crypto.randomUUID(),
  );
};
describe("durable A2A payment orchestration", () => {
  it("completes one signed purchase and delivers a real verified report", async () => {
    const id = await create();
    const run = await select(id);
    expect(run.state).toBe("AWAITING_APPROVAL");
    await authorize(run);
    await engine.workOnce();
    expect(engine.run(id, buyer.address).state).toBe("DELIVERY_PENDING");
    await engine.workOnce();
    const completed = engine.run(id, buyer.address);
    expect(completed.state).toBe("FULFILLED");
    expect(completed.delivery!.report).toMatchObject({
      rowCount: 4,
      duplicateCount: 1,
      missingFieldCount: 2,
    });
    expect(vendor.store.list("payment")).toHaveLength(1);
    expect(() =>
      engine.select(
        buyer.address,
        id,
        quoteDigest(run.selectedQuote!.quote),
        completed.version,
        crypto.randomUUID(),
      ),
    ).toThrow();
  });
  it.each(["price", "payee"] as const)(
    "blocks %s drift before reservation or signature",
    async (scenario) => {
      const id = await create(scenario);
      const run = await select(id, "c");
      expect(run.state).toBe("READY");
      expect(run.mismatches).toEqual([
        scenario === "price" ? "amountBaseUnits" : "payee",
      ]);
      expect(engine.store.list("spend")).toHaveLength(0);
      expect(vendor.store.list("payment")).toHaveLength(0);
      const safe = await select(id, "a");
      expect(safe.state).toBe("AWAITING_APPROVAL");
    },
  );
  it("recovers an accepted payment after lost response and buyer restart", async () => {
    const id = await create("unknown");
    await authorize(await select(id));
    await engine.workOnce();
    expect(engine.run(id, buyer.address).state).toBe("SUBMISSION_UNKNOWN");
    expect(() => engine.cancel(buyer.address, id)).toThrow();
    expect(() =>
      engine.select(
        buyer.address,
        id,
        "x",
        engine.run(id, buyer.address).version,
        crypto.randomUUID(),
      ),
    ).toThrow();
    expect(vendor.store.list("payment")).toHaveLength(1);
    const config = engine.config,
      vendorOrigin = engine.vendorOrigin;
    await engine.stop();
    engine = new Engine(config, { vendorOrigin });
    engine.store.db
      .prepare("UPDATE jobs SET due=0,lease=0 WHERE kind='payment'")
      .run();
    await engine.workOnce();
    await engine.workOnce();
    expect(engine.run(id, buyer.address).state).toBe("FULFILLED");
    expect(vendor.store.list("payment")).toHaveLength(1);
  });
  it("rejects double approvals and replays without creating another debit", async () => {
    const id = await create();
    const run = await select(id);
    const key = crypto.randomUUID();
    const first = engine.approve(
      buyer.address,
      id,
      run.approvalDigest!,
      run.version,
      key,
    );
    expect(
      engine.approve(buyer.address, id, run.approvalDigest!, run.version, key),
    ).toEqual(first);
    expect(() =>
      engine.approve(
        buyer.address,
        id,
        run.approvalDigest!,
        run.version,
        crypto.randomUUID(),
      ),
    ).toThrow();
    const sig = await buyer.signTypedData(paymentPayload(first.prepared));
    const authKey = crypto.randomUUID();
    await engine.authorize(
      buyer.address,
      id,
      run.approvalDigest!,
      sig,
      first.version,
      authKey,
    );
    await engine.authorize(
      buyer.address,
      id,
      run.approvalDigest!,
      sig,
      first.version,
      authKey,
    );
    await expect(
      engine.authorize(
        buyer.address,
        id,
        run.approvalDigest!,
        sig,
        first.version,
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    expect(engine.store.list("spend")).toHaveLength(1);
  });
  it("enforces request idempotency and owner isolation", async () => {
    const key = crypto.randomUUID();
    const result = engine.create(buyer.address, input, key);
    expect(engine.create(buyer.address, input, key)).toEqual(result);
    expect(() =>
      engine.create(buyer.address, { ...input, budget: "3" }, key),
    ).toThrow();
    expect(() => engine.run(result.id, stranger.address)).toThrow();
  });
  it("keeps pending exposure across policy rollover", async () => {
    const id = await create();
    const run = await select(id);
    engine.store.put("spend", "other", buyer.address, {
      amount: "25000000",
      createdAtMs: 1,
      state: "reserved",
    });
    expect(() =>
      engine.approve(
        buyer.address,
        id,
        run.approvalDigest!,
        run.version,
        crypto.randomUUID(),
      ),
    ).toThrow(/cap/);
    expect(engine.run(id, buyer.address).state).toBe("AWAITING_APPROVAL");
  });
  it("rejects a report with a mismatching signed result", async () => {
    const id = await create();
    await authorize(await select(id));
    await engine.workOnce();
    const run = engine.run(id, buyer.address);
    const honest = await engine.peer("/vendors/a/fulfil", {
      attemptId: run.prepared!.attemptId,
      rfqId: id,
    });
    const altered = structuredClone(honest) as { report: { rowCount: number } };
    altered.report.rowCount = 999;
    vendor.store.put(
      "delivery",
      run.prepared!.attemptId,
      buyer.address,
      altered,
    );
    await engine.workOnce();
    expect(engine.run(id, buyer.address).state).toBe("DELIVERY_REJECTED");
    expect(engine.run(id, buyer.address).settlement).toBeDefined();
  });
  it("releases only expired undispatched local reservations", async () => {
    const id = await create();
    const run = await select(id);
    engine.approve(
      buyer.address,
      id,
      run.approvalDigest!,
      run.version,
      crypto.randomUUID(),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 601000);
      engine.expire(engine.run(id, buyer.address));
      expect(engine.run(id, buyer.address).state).toBe("EXPIRED_UNPAID");
      expect(engine.store.list("spend")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("requires an original fresh sign-in challenge and hides payer signatures in proof", async () => {
    const app = createApp({ engine, startWorker: false });
    const headers = { origin: engine.config.origin };
    try {
      const c = (
        await app.inject({
          method: "POST",
          url: "/api/auth/challenge",
          headers,
          payload: { address: buyer.address },
        })
      ).json<{ id: string; message: string }>();
      const signature = await buyer.signMessage({ message: c.message });
      const signed = await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers,
        payload: { id: c.id, signature },
      });
      expect(signed.statusCode).toBe(200);
      const cookie = String(signed.headers["set-cookie"]).split(";")[0]!;
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/verify",
            headers,
            payload: { id: c.id, signature },
          })
        ).statusCode,
      ).toBe(401);
      const id = await create();
      const run = await select(id);
      await authorize(run);
      await engine.workOnce();
      await engine.workOnce();
      const proof = await app.inject({
        url: `/api/rfqs/${id}/proof`,
        headers: { cookie },
      });
      expect(proof.statusCode).toBe(200);
      const raw = engine.store.get<{ signature: string }>(
        "signature",
        run.prepared!.attemptId,
      )!.signature;
      expect(proof.body).not.toContain(raw);
      expect(
        await verifyBundle(proof.json(), run.selectedQuote!.quote.vendorSigner),
      ).toMatchObject({
        quoteSignatureValid: true,
        deliverySignatureValid: true,
        vendorPinned: true,
        chainVerified: false,
        payerAuthorizationVerified: false,
      });
      expect(proof.json()).toMatchObject({
        mode: "local",
        chainVerified: false,
      });
    } finally {
      /* engine is closed in afterEach */ await app.close();
      engine = new Engine(readConfig({ DATA_DIR: dir }), {
        vendorOrigin: engine.vendorOrigin,
      });
    }
  });
});
