import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { Engine } from "./engine.js";
it("reports simulator readiness and requires owner/origin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proofbid-api-"));
  const engine = new Engine(readConfig({ DATA_DIR: dir }));
  const app = createApp({ engine, startWorker: false });
  try {
    expect((await app.inject("/health/ready")).json()).toMatchObject({
      profile: "local",
      liveHsp: false,
    });
    engine.workerError = "Worker storage unavailable";
    const unhealthy = await app.inject("/health/ready");
    expect(unhealthy.statusCode).toBe(503);
    expect(unhealthy.json()).toMatchObject({
      ok: false,
      worker: "unavailable",
    });
    engine.workerError = undefined;
    expect((await app.inject("/health/ready")).statusCode).toBe(200);
    expect((await app.inject("/api/rfqs")).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "POST", url: "/api/rfqs", payload: {} }))
        .statusCode,
    ).toBe(403);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});
