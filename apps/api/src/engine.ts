import { join } from "node:path";
import { verifyTypedData, type Hex } from "viem";
import {
  approvalDigest,
  compareConditions,
  createRfq,
  hash,
  nowSeconds,
  paymentPayload,
  preparePayment,
  quoteDigest,
  rankQuotes,
  verifyDelivery,
  verifyQuote,
  verifySettlement,
  type Delivery,
  type RequestInput,
  type Run,
  type Settlement,
  type SignedQuote,
} from "@proofbid/domain";
import { Store, type Job } from "./store.js";
import {
  localSecrets,
  publicVendors,
  type Secrets,
} from "../../../scripts/local.js";
import type { readConfig } from "./config.js";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class Engine {
  readonly store: Store;
  readonly secrets: Secrets;
  readonly vendors;
  private timer?: ReturnType<typeof setInterval>;
  private working?: Promise<void>;
  workerError?: string;
  constructor(
    readonly config: ReturnType<typeof readConfig>,
    options: { store?: Store; secrets?: Secrets; vendorOrigin?: string } = {},
  ) {
    this.store =
      options.store ?? new Store(join(config.dataDir, "buyer.sqlite"));
    this.secrets = options.secrets ?? localSecrets(config.dataDir);
    this.vendors = publicVendors(this.secrets);
    this.vendorOrigin =
      options.vendorOrigin ?? `http://127.0.0.1:${config.vendorPort}`;
  }
  readonly vendorOrigin: string;
  async peer<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.vendorOrigin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${this.secrets.peerToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(2200),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty vendor response");
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("Vendor response too large");
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const result = JSON.parse(text) as { error?: string };
    if (!response.ok)
      throw new Error(result.error ?? "Receiving agent unavailable");
    return result as T;
  }
  run(id: string, buyer: string): Run {
    const r = this.store.get<Run>("run", id);
    if (!r || r.rfq.buyer.toLowerCase() !== buyer.toLowerCase())
      throw new AppError(404, "Request not found");
    return r;
  }
  save(run: Run, event: string, data: unknown = {}) {
    run.version++;
    this.store.put("run", run.id, run.rfq.buyer, run);
    this.store.event(run.id, event, data);
  }
  idem<T>(
    buyer: string,
    route: string,
    key: string,
    input: unknown,
    fn: () => T,
  ): T {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
      throw new AppError(400, "A valid Idempotency-Key is required");
    return this.store.transaction(() => {
      const scope = `${buyer}:${route}`;
      const old = this.store.db
        .prepare(
          "SELECT request_hash,response FROM idempotency WHERE scope=? AND key=?",
        )
        .get(scope, key) as
        { request_hash: string; response: string } | undefined;
      const digest = hash(input);
      if (old) {
        if (old.request_hash !== digest)
          throw new AppError(
            409,
            "Idempotency key reused with different input",
          );
        return JSON.parse(old.response) as T;
      }
      const result = fn();
      this.store.db
        .prepare("INSERT INTO idempotency VALUES(?,?,?,?)")
        .run(scope, key, digest, JSON.stringify(result));
      return result;
    });
  }
  create(buyer: Hex, input: RequestInput, key: string) {
    return this.idem(buyer, "create", key, input, () => {
      const rfq = createRfq(input, buyer);
      if (BigInt(rfq.maxAmountBaseUnits) > 10000000n)
        throw new AppError(400, "Local payment cap is 10 simulated USDC");
      const run: Run = {
        id: rfq.rfqId,
        rfq,
        input,
        state: "COLLECTING",
        version: 0,
        quotes: [],
        createdAtMs: Date.now(),
      };
      this.save(run, "Request created");
      this.store.enqueue("collect", run.id);
      return { id: run.id };
    });
  }
  select(
    buyer: string,
    id: string,
    digest: string,
    version: number,
    key: string,
  ) {
    return this.idem(buyer, `select:${id}`, key, { digest, version }, () => {
      const run = this.run(id, buyer);
      if (run.version !== version || run.state !== "READY" || run.prepared)
        throw new AppError(
          409,
          "Refresh the request before selecting an offer",
        );
      const offer = run.quotes.find(
        (q) => q.signed && quoteDigest(q.signed.quote) === digest,
      );
      if (!offer?.signed || offer.reason)
        throw new AppError(400, "Select an eligible offer");
      run.selectedQuote = offer.signed;
      run.state = "CHECKING_CONDITIONS";
      delete run.error;
      delete run.mismatches;
      this.save(run, "Checking receiving-agent conditions");
      this.store.enqueue("conditions", id);
      return { id };
    });
  }
  approve(
    buyer: string,
    id: string,
    digest: string,
    version: number,
    key: string,
  ) {
    return this.idem(buyer, `approve:${id}`, key, { digest, version }, () => {
      const run = this.run(id, buyer);
      if (
        run.version !== version ||
        run.state !== "AWAITING_APPROVAL" ||
        !run.prepared ||
        digest !== run.approvalDigest
      )
        throw new AppError(
          409,
          "Payment review is stale; refresh before signing",
        );
      if (run.prepared.validUntil < nowSeconds() + 60)
        throw new AppError(
          409,
          "Offer is too close to expiry; start a new request",
        );
      const spent = this.store
        .list<{
          amount: string;
          createdAtMs: number;
          state: "reserved" | "spent";
        }>("spend", buyer)
        .filter(
          (s) =>
            s.state === "reserved" || s.createdAtMs > Date.now() - 86400000,
        )
        .reduce((sum, s) => sum + BigInt(s.amount), 0n);
      if (spent + BigInt(run.prepared.payerMaxDebitBaseUnits) > 25000000n)
        throw new AppError(
          409,
          "Local 24-hour spend cap reached, including pending payments",
        );
      this.store.put("spend", run.prepared.attemptId, buyer, {
        amount: run.prepared.payerMaxDebitBaseUnits,
        createdAtMs: Date.now(),
        state: "reserved",
      });
      run.state = "RESERVED_AWAITING_SIGNATURE";
      this.save(run, "Spend reserved; waiting for wallet signature");
      return { prepared: run.prepared, version: run.version };
    });
  }
  async authorize(
    buyer: string,
    id: string,
    digest: string,
    signature: Hex,
    version: number,
    key: string,
  ) {
    const initial = this.run(id, buyer);
    if (!initial.prepared || initial.approvalDigest !== digest)
      throw new AppError(409, "Payment draft mismatch");
    if (initial.prepared.validUntil < nowSeconds() + 30)
      throw new AppError(
        409,
        "Authorization expired; funds remain reserved until its lifetime is resolved",
      );
    if (
      !(await verifyTypedData({
        ...paymentPayload(initial.prepared),
        address: initial.prepared.payer,
        signature,
      }))
    )
      throw new AppError(400, "Invalid payment signature");
    return this.idem(
      buyer,
      `authorize:${id}`,
      key,
      { digest, signature, version },
      () => {
        const run = this.run(id, buyer);
        if (
          run.version !== version ||
          run.state !== "RESERVED_AWAITING_SIGNATURE"
        )
          throw new AppError(
            409,
            "This authorization was already used or changed",
          );
        this.store.put("signature", run.prepared!.attemptId, buyer, {
          signature,
        });
        run.state = "SUBMITTING";
        this.save(run, "Local authorization verified");
        this.store.enqueue("payment", id);
        return { id };
      },
    );
  }
  reconcile(buyer: string, id: string) {
    this.store.transaction(() => {
      const run = this.run(id, buyer);
      if (
        !run.prepared ||
        ![
          "SUBMITTING",
          "SUBMISSION_UNKNOWN",
          "DELIVERY_PENDING",
          "DELIVERY_OVERDUE",
          "DELIVERY_REJECTED",
        ].includes(run.state)
      )
        throw new AppError(409, "No pending operation to reconcile");
      this.store.enqueue(run.settlement ? "delivery" : "payment", id);
    });
  }
  cancel(buyer: string, id: string) {
    this.store.transaction(() => {
      const run = this.run(id, buyer);
      if (
        ![
          "COLLECTING",
          "READY",
          "CHECKING_CONDITIONS",
          "AWAITING_APPROVAL",
        ].includes(run.state)
      )
        throw new AppError(
          409,
          "A signature may still execute; this payment cannot be reset or cancelled locally",
        );
      run.state = "CANCELLED";
      this.save(run, "Request cancelled before authorization");
      this.store.db.prepare("DELETE FROM jobs WHERE run_id=?").run(id);
    });
  }
  async collect(run: Run) {
    const offers = await Promise.all(
      this.vendors.map(async (vendor) => {
        try {
          const signed = await this.peer<SignedQuote>(
            `/vendors/${vendor.id}/rfq`,
            { rfq: run.rfq, scenario: run.input.scenario },
          );
          await verifyQuote(signed, run.rfq, vendor);
          return { vendorId: vendor.id, signed };
        } catch (e) {
          return {
            vendorId: vendor.id,
            reason: e instanceof Error ? e.message : "Offer unavailable",
          };
        }
      }),
    );
    this.store.transaction(() => {
      const current = this.store.get<Run>("run", run.id)!;
      if (current.state !== "COLLECTING") return;
      const valid = rankQuotes(
        offers.flatMap((o) => (o.signed ? [o.signed] : [])),
      );
      current.quotes = [
        ...valid.map((signed) => ({ vendorId: signed.vendorId, signed })),
        ...offers.filter((o) => !o.signed),
      ];
      current.state = valid.length ? "READY" : "NO_VALID_QUOTES";
      this.save(current, "Offers checked", {
        eligible: valid.length,
        total: offers.length,
      });
    });
  }
  async conditions(run: Run) {
    const signed = run.selectedQuote!;
    try {
      const received = await this.peer<SignedQuote>(
        `/vendors/${signed.vendorId}/conditions`,
        { rfqId: run.id, quoteDigest: quoteDigest(signed.quote) },
      );
      const mismatches = compareConditions(signed, received);
      if (mismatches.length) {
        this.store.transaction(() => {
          const current = this.store.get<Run>("run", run.id)!;
          if (
            current.state !== "CHECKING_CONDITIONS" ||
            current.version !== run.version
          )
            return;
          current.state = "READY";
          current.mismatches = mismatches;
          current.error = `Receiving agent changed ${mismatches.join(", ")}. No wallet signature requested.`;
          const offer = current.quotes.find(
            (q) => q.vendorId === signed.vendorId,
          );
          if (offer) offer.reason = current.error;
          this.save(current, "Conditions mismatch blocked", {
            fields: mismatches,
          });
        });
        return;
      }
      await verifyQuote(
        received,
        run.rfq,
        this.vendors.find((v) => v.id === signed.vendorId)!,
      );
      const prepared = preparePayment(run.rfq, received);
      this.store.transaction(() => {
        const current = this.store.get<Run>("run", run.id)!;
        if (
          current.state !== "CHECKING_CONDITIONS" ||
          current.version !== run.version
        )
          return;
        current.prepared = prepared;
        current.approvalDigest = approvalDigest(prepared);
        current.state = "AWAITING_APPROVAL";
        this.save(current, "Conditions match; payment ready for review");
        this.store.enqueue("expire", run.id, (prepared.validUntil + 1) * 1000);
      });
    } catch (e) {
      this.store.transaction(() => {
        const current = this.store.get<Run>("run", run.id)!;
        if (
          current.state !== "CHECKING_CONDITIONS" ||
          current.version !== run.version
        )
          return;
        current.state = "READY";
        current.error =
          e instanceof Error ? e.message : "Could not verify conditions";
        this.save(current, "Conditions check failed");
      });
    }
  }
  async payment(run: Run) {
    const p = run.prepared!;
    let settlement: Settlement;
    try {
      const dispatch = this.store.transaction(() => {
        if (this.store.get("dispatch", p.attemptId)) return false;
        this.store.put("dispatch", p.attemptId, run.rfq.buyer, {
          startedAtMs: Date.now(),
        });
        return true;
      });
      if (dispatch) {
        const auth = this.store.get<{ signature: Hex }>(
          "signature",
          p.attemptId,
        );
        if (!auth) throw new Error("Recorded authorization unavailable");
        if (p.validUntil < nowSeconds())
          throw new Error(
            "Authorization expired before dispatch; reconcile required",
          );
        settlement = await this.peer<Settlement>("/simulator/payments", {
          prepared: p,
          signature: auth.signature,
          signed: run.selectedQuote,
        });
      } else
        settlement = await this.peer<Settlement>(
          `/simulator/payments/${p.attemptId}`,
        );
      verifySettlement(p, settlement);
    } catch (e) {
      this.store.transaction(() => {
        const current = this.store.get<Run>("run", run.id)!;
        if (current.settlement || current.delivery) return;
        current.state = "SUBMISSION_UNKNOWN";
        current.error =
          e instanceof Error ? e.message : "Submission is uncertain";
        this.save(current, "Payment uncertain; second payment blocked");
      });
      throw e;
    }
    this.store.transaction(() => {
      const current = this.store.get<Run>("run", run.id)!;
      if (current.settlement || current.delivery) return;
      current.settlement = settlement;
      current.state = "DELIVERY_PENDING";
      delete current.error;
      this.store.put("spend", p.attemptId, run.rfq.buyer, {
        amount: p.payerMaxDebitBaseUnits,
        createdAtMs: Date.now(),
        state: "spent",
      });
      this.save(
        current,
        "Simulated settlement verified; receiving agent checking",
      );
      this.store.enqueue("delivery", run.id);
    });
  }
  async deliver(run: Run) {
    try {
      const delivery = await this.peer<Delivery>(
        `/vendors/${run.selectedQuote!.vendorId}/fulfil`,
        { attemptId: run.prepared!.attemptId, rfqId: run.id },
      );
      await verifyDelivery(
        delivery,
        run.prepared!,
        run.selectedQuote!,
        run.rfq.fixture,
      );
      this.store.transaction(() => {
        const current = this.store.get<Run>("run", run.id)!;
        current.delivery = delivery;
        current.state = "FULFILLED";
        delete current.error;
        this.save(current, "Signed report verified", {
          artifactHash: delivery.artifactHash,
        });
      });
    } catch (e) {
      this.store.transaction(() => {
        const current = this.store.get<Run>("run", run.id)!;
        if (current.delivery) return;
        current.error = e instanceof Error ? e.message : "Report unavailable";
        if (current.error === "Delivery verification failed")
          current.state = "DELIVERY_REJECTED";
        else if (
          nowSeconds() >=
          current.settlement!.settledAt +
            current.selectedQuote!.terms.deliveryWithinSeconds
        )
          current.state = "DELIVERY_OVERDUE";
        this.save(current, "Waiting for verified delivery");
      });
      throw e;
    }
  }
  expire(run: Run) {
    this.store.transaction(() => {
      const current = this.store.get<Run>("run", run.id);
      if (
        !current?.prepared ||
        !["AWAITING_APPROVAL", "RESERVED_AWAITING_SIGNATURE"].includes(
          current.state,
        ) ||
        current.prepared.validUntil >= nowSeconds() ||
        this.store.get("dispatch", current.prepared.attemptId)
      )
        return;
      current.state = "EXPIRED_UNPAID";
      this.store.remove("spend", current.prepared.attemptId);
      this.save(
        current,
        "Unsubmitted local authorization expired; reservation released",
      );
    });
  }
  async workOnce() {
    const job = this.store.transaction(() => {
      const row = this.store.db
        .prepare(
          "SELECT * FROM jobs WHERE due<=? AND lease<? ORDER BY due LIMIT 1",
        )
        .get(Date.now(), Date.now()) as Job | undefined;
      if (row)
        this.store.db
          .prepare("UPDATE jobs SET lease=?,tries=tries+1 WHERE id=?")
          .run(Date.now() + 15000, row.id);
      return row;
    });
    if (!job) return;
    try {
      const run = this.store.get<Run>("run", job.run_id);
      if (run && run.state !== "CANCELLED") {
        if (job.kind === "expire") this.expire(run);
        if (job.kind === "collect" && run.state === "COLLECTING")
          await this.collect(run);
        if (job.kind === "conditions" && run.state === "CHECKING_CONDITIONS")
          await this.conditions(run);
        if (job.kind === "payment" && !run.settlement) await this.payment(run);
        if (job.kind === "delivery" && run.settlement && !run.delivery)
          await this.deliver(run);
      }
      this.store.db.prepare("DELETE FROM jobs WHERE id=?").run(job.id);
    } catch {
      this.store.db
        .prepare("UPDATE jobs SET due=?,lease=0 WHERE id=?")
        .run(
          Date.now() + Math.min(30000, 1000 * 2 ** Math.min(job.tries, 5)),
          job.id,
        );
    }
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.working)
        this.working = this.workOnce()
          .then(
            () => {
              this.workerError = undefined;
            },
            () => {
              this.workerError = "Worker storage unavailable";
            },
          )
          .finally(() => {
            this.working = undefined;
          });
    }, 200);
    this.timer.unref();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.working;
    this.store.close();
  }
}
