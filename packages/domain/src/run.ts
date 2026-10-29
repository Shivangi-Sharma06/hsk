import type {
  Delivery,
  PreparedPayment,
  RequestInput,
  Rfq,
  Settlement,
  SignedQuote,
} from "./index.js";
export type RunState =
  | "COLLECTING"
  | "READY"
  | "NO_VALID_QUOTES"
  | "CHECKING_CONDITIONS"
  | "AWAITING_APPROVAL"
  | "RESERVED_AWAITING_SIGNATURE"
  | "SUBMITTING"
  | "SUBMISSION_UNKNOWN"
  | "SETTLED_VERIFIED"
  | "DELIVERY_PENDING"
  | "DELIVERY_OVERDUE"
  | "DELIVERY_REJECTED"
  | "FULFILLED"
  | "CANCELLED"
  | "EXPIRED_UNPAID";
export type Offer = { vendorId: string; signed?: SignedQuote; reason?: string };
export type Run = {
  id: string;
  rfq: Rfq;
  input: RequestInput;
  state: RunState;
  version: number;
  quotes: Offer[];
  createdAtMs: number;
  selectedQuote?: SignedQuote;
  prepared?: PreparedPayment;
  approvalDigest?: string;
  settlement?: Settlement;
  delivery?: Delivery;
  error?: string;
  mismatches?: string[];
};
export type PublicRun = Omit<Run, "delivery"> & {
  deliveryVerified: boolean;
  artifactHash?: string;
};
export function publicRun(run: Run): PublicRun {
  const { delivery, ...rest } = run;
  return {
    ...rest,
    deliveryVerified: !!delivery,
    artifactHash: delivery?.artifactHash,
  };
}
