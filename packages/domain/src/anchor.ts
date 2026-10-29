import {
  encodeFunctionData,
  getAddress,
  isHex,
  parseAbi,
  type Hex,
} from "viem";
export const anchorAbi = parseAbi([
  "constructor(bytes32 deploymentId_)",
  "function deploymentId() view returns (bytes32)",
  "function commitments(address buyer, bytes32 rfqId, uint32 attempt) view returns (bytes32 quoteDigest, bytes32 approvalDigest)",
  "function anchor(bytes32 rfqId, uint32 attempt, bytes32 quoteDigest, bytes32 approvalDigest)",
  "event Anchored(address indexed buyer, bytes32 indexed rfqId, uint32 indexed attempt, bytes32 quoteDigest, bytes32 approvalDigest)",
  "error ZeroDigest()",
  "error InvalidAttempt()",
  "error AlreadyAnchored()",
]);
export type AnchorCall = {
  buyer: Hex;
  rfqId: Hex;
  attempt: number;
  quoteDigest: Hex;
  approvalDigest: Hex;
};
export function validateDigest(value: string): asserts value is Hex {
  if (
    !isHex(value) ||
    !/^0x[0-9a-fA-F]{64}$/.test(value) ||
    /^0x0{64}$/.test(value)
  )
    throw new Error("Expected a nonzero bytes32 digest");
}
export function anchorCalldata(record: AnchorCall): Hex {
  getAddress(record.buyer);
  validateDigest(record.rfqId);
  validateDigest(record.quoteDigest);
  validateDigest(record.approvalDigest);
  if (
    !Number.isSafeInteger(record.attempt) ||
    record.attempt < 1 ||
    record.attempt > 4294967295
  )
    throw new Error("Invalid anchor attempt");
  return encodeFunctionData({
    abi: anchorAbi,
    functionName: "anchor",
    args: [
      record.rfqId,
      record.attempt,
      record.quoteDigest,
      record.approvalDigest,
    ],
  });
}
