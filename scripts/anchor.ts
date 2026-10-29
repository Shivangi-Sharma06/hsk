import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  createWalletClient,
  http,
  getContractAddress,
  keccak256,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployment } from "../packages/domain/src/index.js";
import { validateDigest } from "../packages/domain/src/anchor.js";
import {
  anchorClient,
  checkAnchorDeployment,
  deploymentPlan,
  networks,
  type AnchorNetwork,
  type DeploymentPlan,
} from "./lib/anchor-deployment.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const command = args[0];
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const network = flag("network") as AnchorNetwork;
if (
  !["prepare", "deploy", "check"].includes(command ?? "") ||
  !Object.hasOwn(networks, network)
)
  throw new Error(
    "Usage: pnpm contracts:prepare|contracts:deploy|contracts:verify --network local|testnet|mainnet --deployment-id 0x... [--tx 0x...]",
  );
const namespace =
  flag("deployment-id") ?? (network === "mainnet" ? undefined : deployment.id);
if (!namespace)
  throw new Error("Mainnet requires a new explicit deployment namespace");
validateDigest(namespace);
if (network === "mainnet" && namespace === deployment.id)
  throw new Error("Mainnet cannot reuse the local simulation namespace");
const dir = resolve(process.env.ANCHOR_OUTPUT_DIR ?? "data/anchor");
const relative = resolve("data");
if (dir !== relative && !dir.startsWith(relative + "/"))
  throw new Error("Deployment records must remain inside ignored data/");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const plan = deploymentPlan(network, namespace);
const prefix = join(dir, `${network}-${namespace.slice(2)}`);
function save(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
}
if (command === "prepare") {
  if (existsSync(`${prefix}.plan.json`)) {
    if (
      JSON.stringify(
        JSON.parse(readFileSync(`${prefix}.plan.json`, "utf8")),
      ) !== JSON.stringify(plan)
    )
      throw new Error(
        "An existing deployment plan differs; choose a fresh deployment namespace.",
      );
  } else save(`${prefix}.plan.json`, plan);
  console.log(
    `Unsigned deployment prepared: ${prefix}.plan.json. Chain ${plan.chainId}. No transaction sent.`,
  );
  console.log(
    "After deployment, verify with: pnpm contracts:verify --network " +
      network +
      " --deployment-id " +
      namespace +
      " --tx 0xYOUR_DEPLOYMENT_TX",
  );
} else {
  const client = anchorClient(
    network,
    process.env.ANCHOR_RPC_URL ?? networks[network].rpc,
  );
  if ((await client.getChainId()) !== plan.chainId)
    throw new Error("RPC chain ID mismatch");
  let txHash: Hex;
  if (command === "check") {
    const value = flag("tx");
    if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value))
      throw new Error("Provide the deployment transaction hash with --tx");
    txHash = value as Hex;
  } else {
    if (!args.includes("--broadcast"))
      throw new Error(
        "Nothing sent. Use contracts:prepare for unsigned output, or pass --broadcast deliberately when ready to deploy.",
      );
    if (network === "mainnet" && !args.includes("--mainnet-release"))
      throw new Error(
        "Mainnet requires explicit --mainnet-release activation.",
      );
    const key = process.env.ANCHOR_DEPLOYER_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
      throw new Error(
        "Set ANCHOR_DEPLOYER_KEY privately on the server; never use the merchant JWT key.",
      );
    if (existsSync(`${prefix}.pending.json`))
      throw new Error(
        "Deployment attempt already recorded. Check its tx hash; do not create another nonce blindly.",
      );
    const account = privateKeyToAccount(key as Hex);
    const wallet = createWalletClient({
      account,
      chain: client.chain,
      transport: http(process.env.ANCHOR_RPC_URL ?? networks[network].rpc, {
        retryCount: 0,
        timeout: 10000,
      }),
    });
    const gas = await client.estimateGas({
      account: account.address,
      data: plan.data,
    });
    const cap = process.env.ANCHOR_MAX_FEE_WEI;
    if (!cap || !/^\d+$/.test(cap) || BigInt(cap) <= 0n)
      throw new Error(
        "Set a positive ANCHOR_MAX_FEE_WEI budget before broadcasting.",
      );
    const request = await wallet.prepareTransactionRequest({
      account,
      data: plan.data,
      nonce: await client.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      }),
      gas: gas + gas / 5n,
    });
    const fee = request.maxFeePerGas ?? request.gasPrice;
    if (fee === undefined || request.gas * fee > BigInt(cap))
      throw new Error(
        "Estimated deployment fee exceeds the configured budget.",
      );
    if (
      (await client.getBalance({ address: account.address })) <
      request.gas * fee
    )
      throw new Error("Deployer needs native gas funds.");
    const raw = await wallet.signTransaction(request);
    txHash = keccak256(raw);
    const predictedAddress = getContractAddress({
      from: account.address,
      nonce: BigInt(request.nonce),
    });
    save(`${prefix}.pending.json`, {
      plan: plan as DeploymentPlan,
      txHash,
      predictedAddress,
      deployer: account.address,
      nonce: request.nonce,
      rawTransaction: raw,
    });
    try {
      await client.sendRawTransaction({ serializedTransaction: raw });
    } catch {
      throw new Error(
        `Deployment submission uncertain. Recorded tx ${txHash}. Use contracts:verify; do not sign a new deployment.`,
      );
    }
    console.log("Deployment submitted:", txHash);
    await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: network === "mainnet" ? 5 : 1,
      timeout: 120000,
    });
  }
  const manifest = await checkAnchorDeployment(client, plan, txHash);
  const path = `${prefix}.verified.json`;
  if (!existsSync(path)) save(path, manifest);
  console.log(
    "Verified deployed bytecode and constructor namespace:",
    manifest.address,
  );
  console.log("Manifest:", path);
  console.log(
    "Explorer source verification is a separate step. Standard input is available from: pnpm exec forge verify-contract " +
      manifest.address +
      " src/ProofBidAnchor.sol --root contracts --show-standard-json-input",
  );
}
