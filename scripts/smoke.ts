import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  paymentPayload,
  quoteDigest,
  type PreparedPayment,
  type PublicRun,
} from "../packages/domain/src/index.js";
import { vendorApp } from "../apps/vendors/src/app.js";
import { createApp } from "../apps/api/src/app.js";
import { Engine } from "../apps/api/src/engine.js";
import { readConfig } from "../apps/api/src/config.js";
const dir = mkdtempSync(join(tmpdir(), "proofbid-smoke-"));
const config = readConfig({ DATA_DIR: dir });
const vendor = vendorApp({ dataDir: dir });
const vendorOrigin = await vendor.app.listen({ port: 0, host: "127.0.0.1" });
const engine = new Engine(config, { vendorOrigin });
const app = createApp({ engine, startWorker: false });
const origin = await app.listen({ port: 0, host: "127.0.0.1" });
let cookie = "";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${origin}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: config.origin,
      cookie,
      ...(body === undefined
        ? {}
        : {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0]!;
  assert.equal(r.ok, true, await r.clone().text());
  return r.json() as Promise<T>;
}
try {
  const buyer = privateKeyToAccount(generatePrivateKey());
  const challenge = await request<{ id: string; message: string }>(
    "/auth/challenge",
    { address: buyer.address },
  );
  await request("/auth/verify", {
    id: challenge.id,
    signature: await buyer.signMessage({ message: challenge.message }),
  });
  const { id } = await request<{ id: string }>("/rfqs", {
    fixture: "customers",
    budget: "2",
    maxDeliverySeconds: 60,
    scenario: "unknown",
  });
  await engine.workOnce();
  let run = await request<PublicRun>(`/rfqs/${id}`);
  assert.equal(run.state, "READY");
  await request(`/rfqs/${id}/select`, {
    quoteDigest: quoteDigest(run.quotes[0]!.signed!.quote),
    version: run.version,
  });
  await engine.workOnce();
  run = await request(`/rfqs/${id}`);
  const approval = await request<{
    prepared: PreparedPayment;
    version: number;
  }>(`/rfqs/${id}/approve`, {
    approvalDigest: run.approvalDigest,
    version: run.version,
  });
  await request(`/rfqs/${id}/authorize`, {
    approvalDigest: run.approvalDigest,
    version: approval.version,
    signature: await buyer.signTypedData(paymentPayload(approval.prepared)),
  });
  await engine.workOnce();
  assert.equal(engine.run(id, buyer.address).state, "SUBMISSION_UNKNOWN");
  engine.store.db.prepare("UPDATE jobs SET due=0 WHERE kind='payment'").run();
  await engine.workOnce();
  await engine.workOnce();
  run = await request(`/rfqs/${id}`);
  assert.equal(run.state, "FULFILLED");
  assert.equal(vendor.store.list("payment").length, 1);
  const started = performance.now();
  const latencies: number[] = [];
  const batch = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const begin = performance.now();
      const result = await request<{ id: string }>("/rfqs", {
        fixture: "inventory",
        budget: "2",
        maxDeliverySeconds: 60,
        scenario: "honest",
      });
      latencies.push(performance.now() - begin);
      return result;
    }),
  );
  for (let n = 0; n < 10; n++) await engine.workOnce();
  for (const item of batch)
    assert.equal(engine.run(item.id, buyer.address).state, "READY");
  const elapsed = performance.now() - started;
  assert.ok(
    elapsed < 6000,
    "10 RFQs should complete within the local collection budget",
  );
  latencies.sort((a, b) => a - b);
  console.log(
    `Local smoke load: 10 concurrent RFQs / 30 vendor calls in ${elapsed.toFixed(0)}ms; create-request HTTP p95 ${latencies[Math.ceil(latencies.length * 0.95) - 1]!.toFixed(1)}ms. Reference machine only; external HSP/chain latency excluded.`,
  );
  console.log(
    "PASS: HTTP sign-in → signed offer → approval → lost response → reconciliation → verified report. One simulated payment; no funds moved.",
  );
} finally {
  await app.close();
  await vendor.app.close();
  rmSync(dir, { recursive: true, force: true });
}
