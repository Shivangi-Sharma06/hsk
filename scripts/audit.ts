import { readFileSync, statSync } from "node:fs";
import { getAddress, type Hex } from "viem";
import {
  anchorCalldata,
  validateDigest,
  type AnchorCall,
} from "../packages/domain/src/anchor.js";
import { verifyBundle } from "../packages/domain/src/proof.js";
import { anchorClient } from "./lib/anchor-deployment.js";
import {
  verifyAnchorReceipt,
  type AnchorDeployment,
} from "./lib/anchor-receipt.js";
const args = process.argv.slice(2).filter((v) => v !== "--");
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
function read(name: string): unknown {
  const path = flag(name);
  if (!path || statSync(path).size > 2 * 1024 * 1024)
    throw new Error(`Provide --${name} with a JSON file under 2 MiB`);
  return JSON.parse(readFileSync(path, "utf8"));
}
const command = args[0];
if (!["prepare", "check"].includes(command ?? ""))
  throw new Error(
    "Use audit:prepare or audit:verify with --bundle, --manifest and --trusted-vendor",
  );
const trusted = flag("trusted-vendor");
if (!trusted)
  throw new Error("Pin the receiving agent signer with --trusted-vendor 0x...");
getAddress(trusted);
const bundle = read("bundle");
await verifyBundle(bundle, trusted);
const checked = bundle as {
  rfq: { buyer: Hex; rfqId: Hex };
  prepared: null | { quoteDigest: Hex };
  approvalDigest: Hex | null;
};
if (!checked.prepared || !checked.approvalDigest)
  throw new Error("This bundle has no reviewed payment");
const record: AnchorCall = {
  buyer: checked.rfq.buyer,
  rfqId: checked.rfq.rfqId,
  attempt: 1,
  quoteDigest: checked.prepared.quoteDigest,
  approvalDigest: checked.approvalDigest,
};
const manifest = read("manifest") as Partial<AnchorDeployment> | null;
if (
  !manifest ||
  !manifest.address ||
  !manifest.deploymentId ||
  !manifest.runtimeCodeHash ||
  ![31337, 133].includes(manifest.chainId ?? 0)
)
  throw new Error(
    "Use a verified local/testnet deployment manifest. Local payment evidence cannot be submitted as mainnet payment evidence.",
  );
getAddress(manifest.address);
validateDigest(manifest.deploymentId);
validateDigest(manifest.runtimeCodeHash);
const deployment = manifest as AnchorDeployment;
if (command === "prepare")
  console.log(
    JSON.stringify(
      {
        chainId: deployment.chainId,
        from: record.buyer,
        to: deployment.address,
        value: "0x0",
        data: anchorCalldata(record),
        record,
        scope:
          "Unsigned audit commitment. Wallet transaction and native gas required. No payment or HSP execution is proven.",
      },
      null,
      2,
    ),
  );
else {
  const tx = flag("tx");
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx))
    throw new Error("Provide --tx with the audit transaction hash");
  const network = deployment.chainId === 133 ? "testnet" : "local";
  const confirmations = network === "local" ? 1 : 5;
  console.log(
    JSON.stringify(
      await verifyAnchorReceipt(
        anchorClient(network, process.env.ANCHOR_RPC_URL),
        deployment,
        record,
        tx as Hex,
        confirmations,
      ),
      null,
      2,
    ),
  );
}
