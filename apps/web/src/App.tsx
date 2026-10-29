import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  deployment,
  formatAmount,
  hash,
  paymentPayload,
  quoteDigest,
  type PreparedPayment,
  type PublicRun,
  type RequestInput,
  type Vendor,
} from "@proofbid/domain";
import { api, download } from "./api.js";

type Config = {
  profile: "local";
  liveHsp: false;
  vendors: Vendor[];
  fixtures: Array<{ id: string; rowCount: number; inputHash: string }>;
};
type Event = { id: number; type: string; at: number; data: unknown };
const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;
const label = (state: string) => state.toLowerCase().replaceAll("_", " ");
export function App() {
  const cache = useQueryClient();
  const wallet = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const [demoKey, setDemoKey] = useState<Hex | undefined>(
    () => (sessionStorage.getItem("proofbid-local-key") as Hex) ?? undefined,
  );
  const demo = demoKey ? privateKeyToAccount(demoKey) : undefined;
  const [runId, setRunId] = useState<string | undefined>(() =>
    location.pathname.startsWith("/runs/")
      ? location.pathname.slice(6)
      : undefined,
  );
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState<RequestInput>({
    fixture: "customers",
    budget: "2.00",
    maxDeliverySeconds: 60,
    scenario: "honest",
  });
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<Config>("/config"),
  });
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api<{ buyer: Hex }>("/auth/session");
      } catch {
        return null;
      }
    },
  });
  const buyer = session.data?.buyer;
  const runQuery = useQuery({
    queryKey: ["run", runId, buyer],
    queryFn: () => api<PublicRun>(`/rfqs/${runId}`),
    enabled: !!runId && !!buyer,
    refetchInterval: 1500,
  });
  const run = runQuery.data;
  const history = useQuery({
    queryKey: ["history", buyer],
    queryFn: () => api<PublicRun[]>("/rfqs"),
    enabled: !!buyer,
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (!runId || !buyer) return;
    setEvents([]);
    const stream = new EventSource(`/api/rfqs/${runId}/events`);
    stream.onmessage = (e) => {
      const event = JSON.parse(e.data) as Event;
      setEvents((old) =>
        [...old.filter((v) => v.id !== event.id), event].slice(-30),
      );
      void cache.invalidateQueries({ queryKey: ["run", runId] });
    };
    return () => stream.close();
  }, [runId, buyer, cache]);
  useEffect(() => {
    const handle = () =>
      setRunId(
        location.pathname.startsWith("/runs/")
          ? location.pathname.slice(6)
          : undefined,
      );
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, []);
  const navigate = (id?: string) => {
    setRunId(id);
    historyPush(id ? `/runs/${id}` : "/");
    setError("");
    setHistoryOpen(false);
  };
  async function action(name: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await fn();
      await cache.invalidateQueries({ queryKey: ["run"] });
      await cache.invalidateQueries({ queryKey: ["history"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }
  async function login(local: boolean) {
    await action("Connecting wallet", async () => {
      let address: Hex;
      let localKey: Hex | undefined;
      if (local) {
        if (config.data?.profile !== "local")
          throw new Error("Demo wallets are local only");
        localKey = demoKey ?? generatePrivateKey();
        address = privateKeyToAccount(localKey).address;
      } else {
        const connection = wallet.address
          ? { accounts: [wallet.address] }
          : await connectAsync({ connector: connectors[0]! });
        address = connection.accounts[0]!;
        if (wallet.chainId !== 133) await switchChainAsync({ chainId: 133 });
      }
      const c = await api<{ id: string; message: string }>("/auth/challenge", {
        address,
      });
      const signature = localKey
        ? await privateKeyToAccount(localKey).signMessage({
            message: c.message,
          })
        : await signMessageAsync({ message: c.message });
      await api("/auth/verify", { id: c.id, signature });
      if (localKey) {
        sessionStorage.setItem("proofbid-local-key", localKey);
        setDemoKey(localKey);
      } else {
        sessionStorage.removeItem("proofbid-local-key");
        setDemoKey(undefined);
      }
      await cache.invalidateQueries({ queryKey: ["session"] });
    });
  }
  async function signPayment() {
    if (!run?.prepared || !run.approvalDigest) return;
    await action("Waiting for payment signature", async () => {
      const current = demo?.address ?? wallet.address;
      if (!current || current.toLowerCase() !== buyer?.toLowerCase())
        throw new Error("Connect the wallet that owns this request");
      if (!demo && wallet.chainId !== 133)
        throw new Error("Switch your wallet to HashKey Testnet");
      let prepared = run.prepared!;
      let version = run.version;
      if (run.state === "AWAITING_APPROVAL") {
        const reservation = await api<{
          prepared: PreparedPayment;
          version: number;
        }>(`/rfqs/${run.id}/approve`, {
          approvalDigest: run.approvalDigest,
          version,
        });
        prepared = reservation.prepared;
        version = reservation.version;
      }
      const signature = demo
        ? await demo.signTypedData(paymentPayload(prepared))
        : await signTypedDataAsync(paymentPayload(prepared));
      await api(`/rfqs/${run.id}/authorize`, {
        approvalDigest: hash(prepared),
        version,
        signature,
      });
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await action("Requesting offers", async () => {
      const result = await api<{ id: string }>("/rfqs", form);
      navigate(result.id);
    });
  }
  const vendorName = (id: string) =>
    config.data?.vendors.find((v) => v.id === id)?.name ?? id;
  const stage = !run
    ? 0
    : [
          "COLLECTING",
          "READY",
          "NO_VALID_QUOTES",
          "CHECKING_CONDITIONS",
        ].includes(run.state)
      ? 1
      : ["AWAITING_APPROVAL", "RESERVED_AWAITING_SIGNATURE"].includes(run.state)
        ? 2
        : 3;
  const unpaid =
    run && ["COLLECTING", "READY", "AWAITING_APPROVAL"].includes(run.state);
  const pending =
    run &&
    [
      "SUBMITTING",
      "SUBMISSION_UNKNOWN",
      "DELIVERY_PENDING",
      "DELIVERY_OVERDUE",
      "DELIVERY_REJECTED",
    ].includes(run.state);
  return (
    <div className="workspace">
      <header className="header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate();
          }}
        >
          <span className="brand-mark">
            P<span>↗</span>
          </span>
          ProofBid<span className="brand-caption">AGENT COMMERCE</span>
        </a>
        <div className="header-actions">
          <span className="mode">
            <i />
            Local simulator
          </span>
          {buyer ? (
            <button
              className="wallet small"
              onClick={() =>
                void action("Signing out", async () => {
                  await api("/auth/session", undefined, "DELETE");
                  disconnect();
                  sessionStorage.removeItem("proofbid-local-key");
                  setDemoKey(undefined);
                  await cache.invalidateQueries({ queryKey: ["session"] });
                })
              }
            >
              {short(buyer)} <span>↗</span>
            </button>
          ) : (
            <button
              className="small outline"
              onClick={() => void login(false)}
              disabled={!!busy}
            >
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <div className="notice">
        <span>LOCAL DEVELOPMENT</span> Real signatures. Simulated payments. No
        tokens move. HSP integration is awaiting API access.
      </div>
      <section className="intro">
        <div className="eyebrow">TRUST THE TERMS. VERIFY THE PAYMENT.</div>
        <h1>
          Let your agents negotiate.
          <br />
          <span>Keep the last word.</span>
        </h1>
        <p>
          Compare signed offers, inspect every payment condition,
          <br className="desktop" /> and approve exactly what you agreed to.
        </p>
        <div className="intro-side">
          <span className="outlined-icon">⤨</span>
          <span>
            One request.
            <br />
            Three receiving agents.
            <br />
            <strong>Your wallet decides.</strong>
          </span>
        </div>
      </section>
      <nav className="steps" aria-label="Purchase progress">
        {["Request", "Compare", "Approve", "Receipt"].map((s, i) => (
          <div
            className={i === stage ? "active" : i < stage ? "done" : ""}
            key={s}
          >
            <span>{i < stage ? "✓" : `0${i + 1}`}</span>
            {s}
            {i < 3 && <b>→</b>}
          </div>
        ))}
        <button onClick={() => setHistoryOpen(!historyOpen)} disabled={!buyer}>
          ↶ History
        </button>
      </nav>
      <div aria-live="polite">
        {error && (
          <div role="alert" className="alert">
            <strong>Action stopped.</strong> {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
      </div>
      {config.isError && (
        <div className="alert" role="alert">
          Backend unavailable. Start the API and vendor host with{" "}
          <code>pnpm dev</code>.
        </div>
      )}
      {!buyer ? (
        <section className="card welcome">
          <span className="pill">01 / GET STARTED</span>
          <h2>A clear agreement starts here.</h2>
          <p>
            Use your own wallet to sign in, or create an unfunded browser-only
            wallet for the local demo. Neither option can send real payments in
            this build.
          </p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => void login(true)}
              disabled={!!busy || !config.data}
            >
              {busy || "Create demo wallet →"}
            </button>
            <button
              className="outline"
              onClick={() => void login(false)}
              disabled={!!busy}
            >
              Use my wallet
            </button>
          </div>
          <small>
            Sign-in proves ownership. Payment approval is a separate step.
          </small>
        </section>
      ) : !runId ? (
        <section className="card request-card">
          <div className="section-title">
            <div>
              <span className="eyebrow">01 / REQUEST</span>
              <h2>What do you need?</h2>
            </div>
            <span className="pill">SIGNED DATASET REPORT</span>
          </div>
          <form onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <label>
                Dataset
                <select
                  value={form.fixture}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fixture: e.target.value as RequestInput["fixture"],
                    })
                  }
                >
                  <option value="customers">Customer records · 4 rows</option>
                  <option value="inventory">Inventory records · 3 rows</option>
                </select>
              </label>
              <label>
                Maximum total spend
                <div className="input-unit">
                  <input
                    aria-label="Maximum total spend"
                    inputMode="decimal"
                    pattern="(0|[1-9][0-9]*)(\.[0-9]{1,6})?"
                    value={form.budget}
                    onChange={(e) =>
                      setForm({ ...form, budget: e.target.value })
                    }
                    required
                  />
                  <span>USDC</span>
                </div>
              </label>
              <label>
                Delivery within
                <select
                  value={form.maxDeliverySeconds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxDeliverySeconds: Number(e.target.value),
                    })
                  }
                >
                  <option value="60">60 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="10">10 seconds</option>
                </select>
              </label>
            </div>
            <div className="request-bottom">
              <p>
                <span className="tiny-check">✓</span>One report · fixed input ·
                exact token amount
              </p>
              <button className="primary" type="submit" disabled={!!busy}>
                {busy || "Get signed offers →"}
              </button>
            </div>
            <details className="attack-lab">
              <summary>
                ⊕ Attack lab <span>Local only</span>
              </summary>
              <p>Choose a scenario before starting a new request.</p>
              <label>
                Scenario
                <select
                  aria-label="Attack scenario"
                  value={form.scenario}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scenario: e.target.value as RequestInput["scenario"],
                    })
                  }
                >
                  <option value="honest">Honest receiving agents</option>
                  <option value="price">Price changed after selection</option>
                  <option value="payee">
                    Recipient changed after selection
                  </option>
                  <option value="unknown">
                    Provider accepts, response is lost
                  </option>
                  <option value="slow-delivery">
                    Report delivery is delayed
                  </option>
                </select>
              </label>
            </details>
          </form>
        </section>
      ) : runQuery.isError ? (
        <section className="card">
          <h2>Request unavailable</h2>
          <p>This request may belong to a different wallet.</p>
          <button onClick={() => navigate()}>Start a new request</button>
        </section>
      ) : !run ? (
        <section className="card">
          <p>Loading request…</p>
        </section>
      ) : (
        <>
          <div className="run-heading">
            <div>
              <span className="eyebrow">
                DATASET QUALITY REPORT / {run.rfq.fixture.toUpperCase()}
              </span>
              <h2>
                {run.state === "FULFILLED"
                  ? "Your agreement, verified."
                  : "Your receiving agents are on it."}
              </h2>
              <p>
                Budget {formatAmount(run.rfq.maxAmountBaseUnits)} USDC{" "}
                <span>·</span> Delivery within {run.rfq.maxDeliverySeconds}s{" "}
                <span>·</span> Run {short(run.id)}
              </p>
            </div>
            <button className="outline small" onClick={() => navigate()}>
              New request +
            </button>
          </div>
          <div className="run-grid">
            <section className="card offers">
              <div className="section-title">
                <h3>
                  Signed offers{" "}
                  <span>
                    {run.quotes
                      .filter((q) => q.signed && !q.reason)
                      .length.toString()
                      .padStart(2, "0")}
                  </span>
                </h3>
                <span className="subtle">Price first</span>
              </div>
              {run.state === "COLLECTING" && (
                <div className="loading">
                  <i />
                  Asking the receiving agents…
                </div>
              )}
              {run.quotes.map((offer, i) => {
                const q = offer.signed;
                const selected =
                  q && run.selectedQuote?.quote.quoteId === q.quote.quoteId;
                return (
                  <div
                    className={`offer ${selected ? "selected" : ""} ${offer.reason ? "blocked" : ""}`}
                    key={offer.vendorId}
                  >
                    <div className="vendor-avatar">
                      {offer.vendorId.toUpperCase()}
                    </div>
                    <div className="offer-info">
                      <strong>
                        {vendorName(offer.vendorId)}{" "}
                        {i === 0 && !offer.reason && (
                          <span className="best">BEST PRICE</span>
                        )}
                      </strong>
                      <small>
                        {offer.reason
                          ? "Offer blocked"
                          : `Advertised delivery · ${q?.terms.deliveryWithinSeconds}s`}
                      </small>
                      {offer.reason && (
                        <p className="offer-error">{offer.reason}</p>
                      )}
                    </div>
                    {q && (
                      <div className="offer-price">
                        <strong>
                          {formatAmount(q.quote.amountBaseUnits)
                            .replace(/0+$/, "")
                            .replace(/\.$/, "")}
                        </strong>
                        <small>USDC</small>
                        <button
                          className={
                            selected ? "selected-button" : "text-button"
                          }
                          disabled={
                            !!busy || run.state !== "READY" || !!offer.reason
                          }
                          onClick={() =>
                            void action("Checking conditions", async () => {
                              await api(`/rfqs/${run.id}/select`, {
                                quoteDigest: quoteDigest(q.quote),
                                version: run.version,
                              });
                            })
                          }
                        >
                          {selected ? "Selected ✓" : "Select →"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {run.state === "NO_VALID_QUOTES" && (
                <p>
                  No offer meets your budget and service constraints. Start a
                  new request with explicitly updated limits.
                </p>
              )}
              <div className="offer-footnote">
                ◈ Offers are signed by the receiving agent.
                <br />A signature proves identity, not service quality.
              </div>
            </section>
            <section className="card review">
              <div className="section-title">
                <h3>Conditions match</h3>
                <span className="pill">BEFORE YOU SIGN</span>
              </div>
              {!run.selectedQuote ? (
                <div className="empty-review">
                  <span>⤨</span>
                  <h3>Choose an offer to inspect it.</h3>
                  <p>
                    We compare the signed conditions with the payment
                    authorization before your wallet is involved.
                  </p>
                </div>
              ) : (
                <>
                  <p className="review-subtitle">
                    Signed offer <span>→</span> Prepared authorization
                  </p>
                  {run.mismatches?.length || (run.error && !run.prepared) ? (
                    <div className="mismatch" role="alert">
                      <strong>
                        {run.mismatches?.length
                          ? "× Conditions changed"
                          : "× Conditions could not be verified"}
                      </strong>
                      <p>{run.error}</p>
                      <p>
                        Choose another eligible offer. No funds were reserved.
                      </p>
                    </div>
                  ) : run.state === "CHECKING_CONDITIONS" ? (
                    <p className="loading">
                      Checking signed terms and receiving-agent response…
                    </p>
                  ) : (
                    <>
                      <div className="match-rows">
                        <MatchRow
                          name="Receiving agent"
                          value={vendorName(run.selectedQuote.vendorId)}
                        />
                        <MatchRow
                          name="Recipient"
                          value={short(run.selectedQuote.quote.payee)}
                          detail={run.selectedQuote.quote.payee}
                        />
                        <MatchRow
                          name="Service & input"
                          value="Dataset report · quantity 1"
                          detail={run.rfq.inputHash}
                        />
                        <MatchRow
                          name="Asset & network"
                          value="USDC · HashKey testnet"
                          detail={`Chain 133 · ${deployment.token} · 6 decimals`}
                        />
                        <MatchRow
                          name="Recipient amount"
                          value={`${formatAmount(run.selectedQuote.quote.amountBaseUnits)} USDC`}
                        />
                        <MatchRow
                          name="Additional fees"
                          value="0 USDC · 0 native gas (simulated)"
                        />
                      </div>
                      {run.prepared && (
                        <div className="authorization">
                          <span>EXACT TOTAL YOU AUTHORIZE</span>
                          <div>
                            {formatAmount(run.prepared.payerMaxDebitBaseUnits)}
                            <small>USDC</small>
                          </div>
                          <p>Local simulation · no actual debit</p>
                          <p>
                            Authorization expires{" "}
                            {new Date(
                              run.prepared.validUntil * 1000,
                            ).toLocaleTimeString()}
                          </p>
                          {[
                            "AWAITING_APPROVAL",
                            "RESERVED_AWAITING_SIGNATURE",
                          ].includes(run.state) && (
                            <button
                              className="primary full"
                              onClick={() => void signPayment()}
                              disabled={!!busy}
                            >
                              {busy ||
                                (run.state === "RESERVED_AWAITING_SIGNATURE"
                                  ? "Resume payment signature →"
                                  : "Review & sign payment →")}
                            </button>
                          )}
                          <small>
                            Approve only if every condition matches your intent.
                          </small>
                        </div>
                      )}
                    </>
                  )}
                  {run.prepared && (
                    <details className="hash-details">
                      <summary>Inspect identifiers & binding</summary>
                      <dl>
                        <dt>RFQ digest</dt>
                        <dd>{hash(run.rfq)}</dd>
                        <dt>Typed quote digest</dt>
                        <dd>{quoteDigest(run.selectedQuote.quote)}</dd>
                        <dt>Approval digest</dt>
                        <dd>{run.approvalDigest}</dd>
                        <dt>Local signature domain</dt>
                        <dd>ProofBidLocalPayment · version 1</dd>
                      </dl>
                      <p>
                        These are different objects. Matching payment fields are
                        checked; their hashes are not expected to be equal.
                      </p>
                    </details>
                  )}
                </>
              )}
            </section>
          </div>
          {run.prepared &&
            !["AWAITING_APPROVAL", "RESERVED_AWAITING_SIGNATURE"].includes(
              run.state,
            ) && (
              <section
                className={`card receipt ${run.state === "FULFILLED" ? "fulfilled" : ""}`}
              >
                <div className="receipt-icon">
                  {run.state === "FULFILLED"
                    ? "✓"
                    : run.state === "SUBMISSION_UNKNOWN"
                      ? "?"
                      : "↗"}
                </div>
                <div className="receipt-copy">
                  <span className="eyebrow">PAYMENT & FULFILMENT</span>
                  <h2>
                    {run.state === "FULFILLED"
                      ? "Agreement kept. Report verified."
                      : run.state === "SUBMISSION_UNKNOWN"
                        ? "Payment status is uncertain."
                        : label(run.state)}
                  </h2>
                  <p>
                    {run.state === "SUBMISSION_UNKNOWN"
                      ? "A second payment is blocked. Reconciliation checks the original attempt; it does not submit another payment."
                      : (run.error ??
                        "Local signatures and payment conditions checked. No real chain payment was made.")}
                  </p>
                  <div className="receipt-facts">
                    <span className={run.settlement ? "verified" : ""}>
                      {run.settlement ? "✓" : "○"} Simulated settlement
                    </span>
                    <span className={run.deliveryVerified ? "verified" : ""}>
                      {run.deliveryVerified ? "✓" : "○"} Signed report verified
                    </span>
                    <span>○ Real chain settlement</span>
                  </div>
                </div>
                <div className="receipt-actions">
                  {run.deliveryVerified && (
                    <button
                      className="primary"
                      onClick={() =>
                        void action("Downloading report", () =>
                          download(
                            `/rfqs/${run.id}/delivery`,
                            "proofbid-report.json",
                          ),
                        )
                      }
                    >
                      Download report ↓
                    </button>
                  )}
                  {pending && (
                    <button
                      className="outline"
                      disabled={!!busy}
                      onClick={() =>
                        void action("Reconciling", async () => {
                          await api(`/rfqs/${run.id}/reconcile`, {});
                        })
                      }
                    >
                      Reconcile status ↻
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() =>
                      void action("Exporting proof", () =>
                        download(
                          `/rfqs/${run.id}/proof`,
                          "proofbid-proof.json",
                        ),
                      )
                    }
                  >
                    Export private proof ↗
                  </button>
                </div>
              </section>
            )}
          <section className="card activity">
            <div className="section-title">
              <h3>
                Activity <span>LIVE</span>
              </h3>
              {unpaid && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() =>
                    void action("Cancelling", async () => {
                      await api(`/rfqs/${run.id}/cancel`, {});
                    })
                  }
                >
                  Cancel unpaid request
                </button>
              )}
            </div>
            <ol>
              {events.slice(-8).map((event) => (
                <li key={event.id}>
                  <time>{new Date(event.at).toLocaleTimeString()}</time>
                  <span className="event-dot" />
                  {event.type}
                </li>
              ))}
            </ol>
            {run.error && !run.mismatches?.length && (
              <p className="offer-error">{run.error}</p>
            )}
          </section>
        </>
      )}
      {historyOpen && (
        <aside className="history" aria-label="Request history">
          <div className="section-title">
            <h3>Your requests</h3>
            <button
              aria-label="Close history"
              onClick={() => setHistoryOpen(false)}
            >
              ×
            </button>
          </div>
          {history.data?.length ? (
            history.data.map((r) => (
              <button
                key={r.id}
                className="history-row"
                onClick={() => navigate(r.id)}
              >
                <strong>{r.rfq.fixture} report</strong>
                <span>{label(r.state)}</span>
                <small>{new Date(r.createdAtMs).toLocaleString()}</small>
              </button>
            ))
          ) : (
            <p>No requests yet.</p>
          )}
        </aside>
      )}
      <footer>
        <span>
          <strong>ProofBid</strong> / Clear terms. Checked payments.
        </span>
        <span>
          Local simulator <span>·</span> HSP integration pending
        </span>
      </footer>
    </div>
  );
}
function historyPush(path: string) {
  window.history.pushState(null, "", path);
}
function MatchRow({
  name,
  value,
  detail,
}: {
  name: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="match-row">
      <span>{name}</span>
      <div>
        {detail ? (
          <details>
            <summary>{value}</summary>
            <code>{detail}</code>
          </details>
        ) : (
          value
        )}
      </div>
      <b aria-label="Matches">✓</b>
    </div>
  );
}
