import { verifyAnchorReceipt } from "../scripts/lib/anchor-receipt.js";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { beforeAll, afterAll, expect, it } from "vitest";
import {
  createWalletClient,
  createTestClient,
  http,
  keccak256,
  toHex,
  parseEventLogs,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anchorAbi, anchorCalldata } from "../packages/domain/src/anchor.js";
import {
  anchorClient,
  deploymentPlan,
  checkAnchorDeployment,
  type AnchorClient,
  type DeploymentPlan,
} from "../scripts/lib/anchor-deployment.js";
let node: ChildProcess;
let client: AnchorClient;
let plan: DeploymentPlan;
let rpc: string;
const account = privateKeyToAccount(generatePrivateKey());
beforeAll(async () => {
  plan = deploymentPlan("local", keccak256(toHex("test deployment")));
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  rpc = `http://127.0.0.1:${port}`;
  node = spawn(
    resolve("node_modules/.bin/anvil"),
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "31337",
      "--silent",
    ],
    { stdio: "ignore" },
  );
  client = anchorClient("local", rpc);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (node.exitCode !== null) throw new Error("Anvil exited");
    try {
      await client.getChainId();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!ready) throw new Error("Anvil did not start");
  await createTestClient({
    chain: client.chain,
    mode: "anvil",
    transport: http(rpc),
  }).setBalance({ address: account.address, value: 10n ** 20n });
}, 30000);
afterAll(async () => {
  if (node && node.exitCode === null) {
    const exited = once(node, "exit");
    node.kill("SIGTERM");
    await exited;
  }
});
it("deploys exact compiled code, anchors buyer commitments and rejects overwrite on a real local EVM", async () => {
  const wallet = createWalletClient({
    account,
    chain: client.chain,
    transport: http(rpc),
  });
  const hash = await wallet.sendTransaction({ data: plan.data });
  await client.waitForTransactionReceipt({ hash });
  const manifest = await checkAnchorDeployment(
    client,
    plan,
    hash,
    account.address,
  );
  expect(manifest).toMatchObject({
    chainId: 31337,
    deploymentId: plan.namespace,
    sourceVerified: false,
  });
  const record = {
    buyer: account.address,
    rfqId: keccak256(toHex("request")),
    attempt: 1,
    quoteDigest: keccak256(toHex("quote")),
    approvalDigest: keccak256(toHex("approval")),
  };
  const data = anchorCalldata(record);
  const { request } = await client.simulateContract({
    account,
    address: manifest.address,
    abi: anchorAbi,
    functionName: "anchor",
    args: [
      record.rfqId,
      record.attempt,
      record.quoteDigest,
      record.approvalDigest,
    ],
  });
  const anchored = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: anchored });
  expect((await client.getTransaction({ hash: anchored })).input).toBe(data);
  expect(
    await verifyAnchorReceipt(client, manifest, record, anchored, 1),
  ).toMatchObject({
    auditCommitmentVerified: true,
    paymentVerified: false,
    hspExecutionVerified: false,
  });
  await expect(
    verifyAnchorReceipt(client, manifest, record, anchored, 5),
  ).rejects.toThrow(/confirmations/);
  await expect(
    verifyAnchorReceipt(
      client,
      { ...manifest, runtimeCodeHash: record.rfqId },
      record,
      anchored,
      1,
    ),
  ).rejects.toThrow(/code/);
  await expect(
    verifyAnchorReceipt(
      client,
      manifest,
      { ...record, approvalDigest: record.rfqId },
      anchored,
      1,
    ),
  ).rejects.toThrow(/commitment/);

  expect(
    parseEventLogs({
      abi: anchorAbi,
      logs: receipt.logs,
      eventName: "Anchored",
    })[0]?.args,
  ).toEqual(record);
  expect(
    await client.readContract({
      address: manifest.address,
      abi: anchorAbi,
      functionName: "commitments",
      args: [account.address, record.rfqId, 1],
    }),
  ).toEqual([record.quoteDigest, record.approvalDigest]);
  await expect(
    client.simulateContract({
      account,
      address: manifest.address,
      abi: anchorAbi,
      functionName: "anchor",
      args: [record.rfqId, 1, record.quoteDigest, record.approvalDigest],
    }),
  ).rejects.toThrow(/AlreadyAnchored/);
  await expect(
    checkAnchorDeployment(client, { ...plan, chainId: 133 }, hash),
  ).rejects.toThrow(/chain ID/);
  await expect(
    checkAnchorDeployment(client, { ...plan, runtimeCode: "0x00" }, hash),
  ).rejects.toThrow(/bytecode/);
  await expect(
    checkAnchorDeployment(
      client,
      plan,
      hash,
      privateKeyToAccount(generatePrivateKey()).address,
    ),
  ).rejects.toThrow(/deployer/);
  await expect(checkAnchorDeployment(client, plan, anchored)).rejects.toThrow(
    /deployment/,
  );
  expect(() => anchorCalldata({ ...record, attempt: 0 })).toThrow();
  expect(() =>
    anchorCalldata({ ...record, quoteDigest: `0x${"0".repeat(64)}` }),
  ).toThrow();
});
