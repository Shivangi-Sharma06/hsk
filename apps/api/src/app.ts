import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import {
  analyze,
  deployment,
  hash,
  newId,
  publicRun,
  requestSchema,
  type Run,
} from "@proofbid/domain";
import { readConfig } from "./config.js";
import { Engine, AppError } from "./engine.js";

type Challenge = {
  buyer: Hex;
  message: string;
  expires: number;
  consumed: boolean;
};
type Session = { buyer: Hex; expires: number };
const version = Type.Integer({ minimum: 1 });
const digest = Type.String({ pattern: "^0x[0-9a-f]{64}$" });
const object = (
  properties: Record<
    string,
    ReturnType<typeof Type.String> | ReturnType<typeof Type.Integer>
  >,
) => Type.Object(properties, { additionalProperties: false });
export function createApp(
  options: { engine?: Engine; startWorker?: boolean; logger?: boolean } = {},
) {
  const engine = options.engine ?? new Engine(readConfig());
  const { config, store } = engine;
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.body",
          ],
        }
      : false,
    bodyLimit: 65536,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  app.register(cookie);
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.headers.origin !== config.origin
    )
      return reply.code(403).send({ error: "Request origin is not allowed" });
  });
  app.setErrorHandler((error, _req, reply) => {
    const status =
      error instanceof AppError
        ? error.status
        : ((error as { statusCode?: number }).statusCode ?? 500);
    reply
      .code(status)
      .send({
        error:
          status === 500
            ? "Request failed safely; check readiness and try again"
            : error instanceof Error
              ? error.message
              : "Invalid request",
      });
  });
  const owner = (req: { cookies: Record<string, string | undefined> }) => {
    const raw = req.cookies.proofbid;
    const session = raw ? store.get<Session>("session", hash(raw)) : undefined;
    if (!session || session.expires < Date.now())
      throw new AppError(401, "Sign in with your wallet");
    return session.buyer;
  };
  const key = (req: { headers: Record<string, unknown> }) =>
    String(req.headers["idempotency-key"] ?? "");
  app.get("/health/live", async () => ({ ok: true }));
  app.get("/health/ready", async () => ({
    ok: store.db.isOpen,
    profile: "local",
    liveHsp: false,
    mainnet: false,
  }));
  app.get("/api/config", async () => ({
    profile: "local",
    liveHsp: false,
    mainnet: false,
    chainId: deployment.chainId,
    token: deployment.token,
    decimals: 6,
    perPaymentCap: "10000000",
    dailyCap: "25000000",
    vendors: engine.vendors,
    fixtures: ["customers", "inventory"].map((id) => ({
      id,
      ...analyze(id as "customers" | "inventory"),
    })),
  }));
  app.post<{ Body: { address: Hex } }>(
    "/api/auth/challenge",
    {
      schema: {
        body: object({
          address: Type.String({ pattern: "^0x[0-9a-fA-F]{40}$" }),
        }),
      },
    },
    async (req) => {
      const buyer = getAddress(req.body.address);
      const id = newId();
      const expires = Date.now() + 300000;
      const message = createSiweMessage({
        address: buyer,
        chainId: 133,
        domain: new URL(config.origin).host,
        uri: config.origin,
        version: "1",
        nonce: id.slice(2),
        statement:
          "Sign in to ProofBid local simulation. This does not authorize a payment.",
        issuedAt: new Date(),
        expirationTime: new Date(expires),
      });
      store.put("challenge", id, buyer, {
        buyer,
        message,
        expires,
        consumed: false,
      });
      return { id, message };
    },
  );
  app.post<{ Body: { id: string; signature: Hex } }>(
    "/api/auth/verify",
    {
      schema: {
        body: object({
          id: digest,
          signature: Type.String({ pattern: "^0x[0-9a-fA-F]{130}$" }),
        }),
      },
    },
    async (req, reply) => {
      const c = store.get<Challenge>("challenge", req.body.id);
      if (!c || c.consumed || c.expires < Date.now())
        throw new AppError(401, "Sign-in challenge expired or already used");
      if (
        !(await verifyMessage({
          address: c.buyer,
          message: c.message,
          signature: req.body.signature,
        }))
      )
        throw new AppError(401, "Invalid sign-in signature");
      const token = newId();
      store.transaction(() => {
        const current = store.get<Challenge>("challenge", req.body.id);
        if (!current || current.consumed)
          throw new AppError(401, "Sign-in challenge already used");
        store.put("challenge", req.body.id, c.buyer, { ...c, consumed: true });
        store.put("session", hash(token), c.buyer, {
          buyer: c.buyer,
          expires: Date.now() + 8 * 3600000,
        });
      });
      reply.setCookie("proofbid", token, {
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 3600,
      });
      return { buyer: c.buyer };
    },
  );
  app.get("/api/auth/session", async (req) => ({ buyer: owner(req) }));
  app.delete("/api/auth/session", async (req, reply) => {
    if (req.cookies.proofbid)
      store.remove("session", hash(req.cookies.proofbid));
    reply.clearCookie("proofbid", { path: "/" });
    return { ok: true };
  });
  app.post<{ Body: Parameters<Engine["create"]>[1] }>(
    "/api/rfqs",
    { schema: { body: requestSchema } },
    async (req, reply) => {
      const result = engine.create(owner(req), req.body, key(req));
      reply.code(202);
      return result;
    },
  );
  app.get("/api/rfqs", async (req) =>
    store.list<Run>("run", owner(req)).slice(0, 50).map(publicRun),
  );
  app.get<{ Params: { id: string } }>("/api/rfqs/:id", async (req) =>
    publicRun(engine.run(req.params.id, owner(req))),
  );
  app.post<{
    Params: { id: string };
    Body: { quoteDigest: string; version: number };
  }>(
    "/api/rfqs/:id/select",
    { schema: { body: object({ quoteDigest: digest, version }) } },
    async (req, reply) => {
      const r = engine.select(
        owner(req),
        req.params.id,
        req.body.quoteDigest,
        req.body.version,
        key(req),
      );
      reply.code(202);
      return r;
    },
  );
  app.post<{
    Params: { id: string };
    Body: { approvalDigest: string; version: number };
  }>(
    "/api/rfqs/:id/approve",
    { schema: { body: object({ approvalDigest: digest, version }) } },
    async (req) =>
      engine.approve(
        owner(req),
        req.params.id,
        req.body.approvalDigest,
        req.body.version,
        key(req),
      ),
  );
  app.post<{
    Params: { id: string };
    Body: { approvalDigest: string; version: number; signature: Hex };
  }>(
    "/api/rfqs/:id/authorize",
    {
      schema: {
        body: object({
          approvalDigest: digest,
          version,
          signature: Type.String({ pattern: "^0x[0-9a-fA-F]{130}$" }),
        }),
      },
    },
    async (req, reply) => {
      const r = await engine.authorize(
        owner(req),
        req.params.id,
        req.body.approvalDigest,
        req.body.signature,
        req.body.version,
        key(req),
      );
      reply.code(202);
      return r;
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/rfqs/:id/reconcile",
    async (req) => {
      engine.reconcile(owner(req), req.params.id);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>("/api/rfqs/:id/cancel", async (req) => {
    engine.cancel(owner(req), req.params.id);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>(
    "/api/rfqs/:id/events",
    async (req, reply) => {
      const buyer = owner(req);
      engine.run(req.params.id, buyer);
      let after = Number(req.headers["last-event-id"] ?? 0);
      if (!Number.isSafeInteger(after) || after < 0)
        throw new AppError(400, "Invalid event cursor");
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      let closed = false;
      const flush = () => {
        if (closed) return;
        try {
          owner(req);
          for (const event of store.events(req.params.id, after)) {
            if (
              !reply.raw.write(
                `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`,
              )
            ) {
              reply.raw.end();
              return;
            }
            after = Number(event.id);
          }
          reply.raw.write(": heartbeat\n\n");
        } catch {
          reply.raw.end();
        }
      };
      const cleanup = () => {
        closed = true;
        clearInterval(timer);
      };
      reply.raw.on("close", cleanup);
      const timer = setInterval(flush, 1000);
      flush();
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/rfqs/:id/delivery",
    async (req, reply) => {
      const run = engine.run(req.params.id, owner(req));
      if (run.state !== "FULFILLED" || !run.delivery)
        throw new AppError(409, "Verified report is not available yet");
      reply.header(
        "Content-Disposition",
        `attachment; filename="proofbid-report-${run.id.slice(2, 10)}.json"`,
      );
      return run.delivery;
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/rfqs/:id/proof",
    async (req, reply) => {
      const run = engine.run(req.params.id, owner(req));
      const bundle = {
        schemaVersion: 1,
        mode: "local",
        chainVerified: false,
        scope: "Local simulation; no chain payment or HSP execution",
        rfq: run.rfq,
        signedQuote: run.selectedQuote ?? null,
        prepared: run.prepared ?? null,
        approvalDigest: run.approvalDigest ?? null,
        settlement: run.settlement ?? null,
        delivery: run.delivery
          ? {
              artifactHash: run.delivery.artifactHash,
              signature: run.delivery.signature,
              deliveredAt: run.delivery.deliveredAt,
              inputHash: run.delivery.report.inputHash,
              analyzerVersion: run.delivery.report.analyzerVersion,
            }
          : null,
        events: store.events(run.id),
      };
      reply.header(
        "Content-Disposition",
        `attachment; filename="proofbid-proof-${run.id.slice(2, 10)}.json"`,
      );
      return { ...bundle, bundleHash: hash(bundle) };
    },
  );
  const web = resolve("apps/web/dist");
  if (existsSync(web)) {
    app.register(staticFiles, { root: web });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") || req.url.startsWith("/health/")
        ? reply.code(404).send({ error: "Not found" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onReady", async () => {
    if (options.startWorker !== false) engine.start();
  });
  app.addHook("onClose", async () => {
    await engine.stop();
  });
  return app;
}
