import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  defineChain,
  encodeDeployData,
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  http,
  keccak256,
  type Hex,
} from "viem";
import { anchorAbi, validateDigest } from "../../packages/domain/src/anchor.js";
export const networks = {
  local: {
    chainId: 31337,
    name: "Local Anvil",
    rpc: "http://127.0.0.1:8545",
    explorer: null,
  },
  testnet: {
    chainId: 133,
    name: "HashKey Testnet",
    rpc: "https://testnet.hsk.xyz",
    explorer: "https://testnet-explorer.hsk.xyz",
  },
  mainnet: {
    chainId: 177,
    name: "HashKey Mainnet",
    rpc: "https://mainnet.hsk.xyz",
    explorer: "https://hashkey.blockscout.com",
  },
} as const;
export type AnchorNetwork = keyof typeof networks;
type Artifact = {
  bytecode: { object: Hex };
  deployedBytecode: {
    object: Hex;
    immutableReferences: Record<
      string,
      Array<{ start: number; length: number }>
    >;
  };
  metadata: { compiler: { version: string }; settings: { evmVersion: string } };
};
export function compileAnchor() {
  execFileSync(
    resolve("node_modules/.bin/forge"),
    ["build", "--root", "contracts"],
    { stdio: "pipe" },
  );
  return JSON.parse(
    readFileSync(
      "contracts/out/ProofBidAnchor.sol/ProofBidAnchor.json",
      "utf8",
    ),
  ) as Artifact;
}
export function deploymentPlan(
  network: AnchorNetwork,
  namespace: string,
  artifact = compileAnchor(),
) {
  if (!Object.hasOwn(networks, network))
    throw new Error("Choose local, testnet or mainnet");
  validateDigest(namespace);
  namespace = namespace.toLowerCase();
  validateDigest(namespace);
  if (
    !artifact.metadata.compiler.version.startsWith("0.8.28+") ||
    artifact.metadata.settings.evmVersion !== "paris"
  )
    throw new Error("Unexpected contract compiler settings");
  return {
    schemaVersion: 1 as const,
    network,
    chainId: networks[network].chainId,
    namespace,
    data: encodeDeployData({
      abi: anchorAbi,
      bytecode: artifact.bytecode.object,
      args: [namespace],
    }),
    constructorArguments: encodeAbiParameters(
      [{ type: "bytes32" }],
      [namespace],
    ),
    compilerVersion: artifact.metadata.compiler.version,
    creationCodeHash: keccak256(artifact.bytecode.object),
    runtimeCode: runtimeCode(artifact, namespace),
    explorer: networks[network].explorer,
  };
}
export type DeploymentPlan = ReturnType<typeof deploymentPlan>;
function runtimeCode(artifact: Artifact, namespace: Hex): Hex {
  let bytes = artifact.deployedBytecode.object.slice(2);
  for (const locations of Object.values(
    artifact.deployedBytecode.immutableReferences,
  ))
    for (const { start, length } of locations) {
      if (length !== 32) throw new Error("Unexpected immutable width");
      bytes =
        bytes.slice(0, start * 2) +
        namespace.slice(2) +
        bytes.slice((start + length) * 2);
    }
  return `0x${bytes}`;
}
export function anchorClient(
  network: AnchorNetwork,
  rpc: string = networks[network].rpc,
) {
  const url = new URL(rpc);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid anchor RPC URL");
  const config = networks[network];
  return createPublicClient({
    chain: defineChain({
      id: config.chainId,
      name: config.name,
      nativeCurrency: {
        name: network === "local" ? "Ether" : "HSK",
        symbol: network === "local" ? "ETH" : "HSK",
        decimals: 18,
      },
      rpcUrls: { default: { http: [rpc] } },
    }),
    transport: http(rpc, { timeout: 10000, retryCount: 0 }),
  });
}
export type AnchorClient = ReturnType<typeof anchorClient>;
export async function checkAnchorDeployment(
  client: AnchorClient,
  plan: DeploymentPlan,
  txHash: Hex,
  expectedDeployer?: Hex,
) {
  if ((await client.getChainId()) !== plan.chainId)
    throw new Error("RPC chain ID does not match deployment plan");
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const tx = await client.getTransaction({ hash: txHash });
  if (
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    tx.to !== null ||
    tx.input !== plan.data
  )
    throw new Error("Transaction is not the expected successful deployment");
  if (expectedDeployer && getAddress(tx.from) !== getAddress(expectedDeployer))
    throw new Error("Unexpected deployer");
  if (
    getAddress(receipt.contractAddress) !==
    getAddress(getContractAddress({ from: tx.from, nonce: BigInt(tx.nonce) }))
  )
    throw new Error("Unexpected deployment address");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new Error("Deployment block is not canonical");
  const bytecode = await client.getBytecode({
    address: receipt.contractAddress,
  });
  if (bytecode !== plan.runtimeCode)
    throw new Error("Deployed bytecode does not match compiled contract");
  const namespace = await client.readContract({
    address: receipt.contractAddress,
    abi: anchorAbi,
    functionName: "deploymentId",
  });
  if (namespace !== plan.namespace)
    throw new Error("Unexpected contract namespace");
  return {
    schemaVersion: 1,
    network: plan.network,
    chainId: plan.chainId,
    address: receipt.contractAddress,
    deployer: tx.from,
    deploymentId: namespace,
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    runtimeCodeHash: keccak256(bytecode),
    compilerVersion: plan.compilerVersion,
    explorerUrl: plan.explorer
      ? `${plan.explorer}/address/${receipt.contractAddress}`
      : null,
    sourceVerified: false,
    finality: "canonical inclusion checked; verify finality separately",
  };
}
