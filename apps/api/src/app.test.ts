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
it("trusts client addresses only when forwarded by the local reverse proxy", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proofbid-proxy-"));
  const engine = new Engine(readConfig({ DATA_DIR: dir }));
  const app = createApp({ engine, startWorker: false });
  app.get("/test/proxy-ip", async (req) => ({ ip: req.ip }));
  try {
    const forwarded = { "x-forwarded-for": "198.51.100.7" };
    expect(
      (
        await app.inject({
          url: "/test/proxy-ip",
          remoteAddress: "127.0.0.1",
          headers: forwarded,
        })
      ).json(),
    ).toEqual({ ip: "198.51.100.7" });
    expect(
      (
        await app.inject({
          url: "/test/proxy-ip",
          remoteAddress: "203.0.113.9",
          headers: forwarded,
        })
      ).json(),
    ).toEqual({ ip: "203.0.113.9" });
  } finally {
    await app.close();
    rmSync(dir, { recursive: true });
  }
});
