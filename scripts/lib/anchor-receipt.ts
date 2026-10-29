import {
  getAddress,
  keccak256,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {
  anchorAbi,
  anchorCalldata,
  validateDigest,
  type AnchorCall,
} from "../../packages/domain/src/anchor.js";
import type { AnchorClient } from "./anchor-deployment.js";
export type AnchorDeployment = {
  address: Address;
  chainId: number;
  deploymentId: Hex;
  runtimeCodeHash: Hex;
};
/** Verifies an audit commitment only. This never proves token settlement or HSP execution. */
export async function verifyAnchorReceipt(
  client: AnchorClient,
  deployment: AnchorDeployment,
  record: AnchorCall,
  hash: Hex,
  confirmations = 5,
) {
  const data = anchorCalldata(record);
  validateDigest(deployment.deploymentId);
  validateDigest(deployment.runtimeCodeHash);
  if (
    !Number.isSafeInteger(confirmations) ||
    confirmations < 1 ||
    confirmations > 100
  )
    throw new Error("Invalid confirmation requirement");
  if ((await client.getChainId()) !== deployment.chainId)
    throw new Error("Anchor chain mismatch");
  const receipt = await client.getTransactionReceipt({ hash });
  const tx = await client.getTransaction({ hash });
  if (
    receipt.status !== "success" ||
    !tx.to ||
    getAddress(tx.to) !== getAddress(deployment.address) ||
    getAddress(tx.from) !== getAddress(record.buyer) ||
    tx.input.toLowerCase() !== data.toLowerCase() ||
    tx.value !== 0n
  )
    throw new Error("Anchor transaction does not match buyer commitment");
  const blockNumber = receipt.blockNumber;
  const [code, namespace, commitment, head] = await Promise.all([
    client.getBytecode({ address: deployment.address, blockNumber }),
    client.readContract({
      address: deployment.address,
      abi: anchorAbi,
      functionName: "deploymentId",
      blockNumber,
    }),
    client.readContract({
      address: deployment.address,
      abi: anchorAbi,
      functionName: "commitments",
      args: [record.buyer, record.rfqId, record.attempt],
      blockNumber,
    }),
    client.getBlockNumber({ cacheTime: 0 }),
  ]);
  if (
    !code ||
    keccak256(code) !== deployment.runtimeCodeHash.toLowerCase() ||
    namespace !== deployment.deploymentId.toLowerCase()
  )
    throw new Error("Unexpected anchor contract code or namespace");
  if (
    commitment[0] !== record.quoteDigest.toLowerCase() ||
    commitment[1] !== record.approvalDigest.toLowerCase()
  )
    throw new Error("Stored anchor commitment mismatch");
  const logs = parseEventLogs({
    abi: anchorAbi,
    logs: receipt.logs.filter(
      (log) => getAddress(log.address) === getAddress(deployment.address),
    ),
    eventName: "Anchored",
  });
  if (
    logs.length !== 1 ||
    getAddress(logs[0]!.args.buyer) !== getAddress(record.buyer) ||
    logs[0]!.args.rfqId !== record.rfqId.toLowerCase() ||
    logs[0]!.args.attempt !== record.attempt ||
    logs[0]!.args.quoteDigest !== record.quoteDigest.toLowerCase() ||
    logs[0]!.args.approvalDigest !== record.approvalDigest.toLowerCase()
  )
    throw new Error("Anchor event mismatch");
  if (head < blockNumber || head - blockNumber + 1n < BigInt(confirmations))
    throw new Error("Anchor needs more confirmations");
  const block = await client.getBlock({ blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new Error("Anchor block is not canonical");
  return {
    auditCommitmentVerified: true,
    paymentVerified: false,
    hspExecutionVerified: false,
    chainId: deployment.chainId,
    contract: deployment.address,
    deploymentId: namespace,
    transactionHash: hash,
    blockNumber: blockNumber.toString(),
    blockHash: receipt.blockHash,
    confirmations: (head - blockNumber + 1n).toString(),
    record,
  };
}
