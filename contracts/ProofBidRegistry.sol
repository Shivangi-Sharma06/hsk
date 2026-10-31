// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ProofBidRegistry
 * @notice On-chain anchor for ProofBid's cryptographic 3-way match
 *         (RFQ <-> EIP-712 signed vendor bid <-> HSP Payment Mandate).
 *
 * PRIVACY MODEL
 *  - Commercial terms (price, token, SLA, quote expiry) are NEVER stored on-chain and are NOT
 *    in the commit transaction. Only an opaque `bidHash` is committed.
 *  - `bidHash` includes a buyer-generated secret `salt` (>=128 bits of entropy). Without it,
 *    low-entropy terms (price/SLA/expiry) could be brute-forced from the public hash.
 *  - Terms + salt are disclosed only (a) to the HSP verifier via the `view` `verifyMandate`
 *    (an off-chain eth_call, no transaction) and (b) in a `reportTamper` transaction, which is
 *    the one place calldata necessarily reveals them. Buyers who prefer private evidence can use
 *    `raiseDispute` and show evidence to the arbiter off-chain.
 *  - Events carry hashes, addresses and statuses, never amounts.
 *  - NOTE: `private`/`internal` hides nothing on a public chain. All storage is world-readable;
 *    the design therefore never writes secrets to storage.
 *
 * APPROVAL MODEL
 *  - A buyer "owner" wallet (the payer / mandate signer) may authorise agent keys. Commitments by
 *    an agent are PENDING_APPROVAL until the owner approves them (auto-approve is opt-in).
 *  - A compromised agent cannot approve, change policy, add agents, or (by default) confirm
 *    delivery. It can only propose commitments and take conservative actions (dispute).
 *
 * SETTLEMENT MODEL
 *  - Only VERIFIER_ROLE (HSP gateway / ProofBid verifier) records settlement.
 *  - Slashed funds go to a pull-payment ledger (`claim`); slashing makes no external calls.
 *  - Fallback: after a REJECTED / EXPIRED / SLASHED commitment, the same rfqId can be committed
 *    again to the next-best vendor (PRD FR-9.4).
 *
 * TRUST ASSUMPTIONS (see SECURITY_NOTES.md): verifier, arbiter and admin are privileged and
 * should be separate multisigs; non-delivery / unsigned-tamper slashing depends on the arbiter.
 */
contract ProofBidRegistry is AccessControlDefaultAdminRules, EIP712, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 ROLES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    enum Status {
        NONE,
        PENDING_APPROVAL, // committed by an agent, awaiting owner approval
        APPROVED, //         eligible to be settled through HSP
        SETTLED, //          HSP transfer recorded, delivery clock running
        DELIVERED, //        terminal: success
        DISPUTED, //         buyer raised dispute, awaiting arbiter
        EXPIRED, //          terminal (retryable): never settled / dispute timed out
        REJECTED, //         terminal (retryable): owner cancelled
        SLASHED //           terminal (retryable for the RFQ): vendor slashed
    }

    enum VerifyResult {
        OK,
        NO_COMMITMENT,
        NOT_APPROVED,
        BAD_STATUS,
        COMMITMENT_EXPIRED,
        QUOTE_EXPIRED,
        VENDOR_INELIGIBLE,
        PAYEE_MISMATCH,
        REF_MISMATCH,
        TERMS_MISMATCH
    }

    enum SlashReason {
        TAMPER_EVIDENCE,
        DISPUTE_RESOLVED
    }

    struct Vendor {
        uint128 bond;
        uint64 withdrawAvailableAt;
        uint32 reputation; // 0..MAX_REPUTATION
        uint16 openCommitments;
        bool registered;
        bool blacklisted;
        bool withdrawPending;
    }

    struct Commitment {
        bytes32 bidHash;
        bytes32 settlementRef; // HSP payment reference recorded at settlement
        address vendor;
        address committedBy; // owner or authorised agent that made the commit
        Status status;
        uint64 committedAt;
        uint64 validUntil; // must be settled before validUntil + settlementGrace
        uint64 deliveryDeadline;
        uint64 disputeDeadline;
        uint64 disputedAt;
    }

    /// @dev Layout of the vendor-signed Quote AND of the vendor-signed PaymentConditions.
    ///      `vendorAddress` is the payee. In a Quote it must equal the signer.
    struct Terms {
        bytes32 rfqId;
        address vendorAddress;
        address tokenAddress;
        uint256 unitPrice;
        uint256 totalAmount;
        bytes32 slaHash;
        uint256 expiry;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 rfqId,address vendorAddress,address tokenAddress,uint256 unitPrice,uint256 totalAmount,bytes32 slaHash,uint256 expiry)"
    );
    bytes32 public constant CONDITIONS_TYPEHASH = keccak256(
        "PaymentConditions(bytes32 rfqId,address vendorAddress,address tokenAddress,uint256 unitPrice,uint256 totalAmount,bytes32 slaHash,uint256 expiry)"
    );

    uint256 public constant MAX_BPS = 10_000;
    uint32 public constant MAX_REPUTATION = 1000;
    uint32 public constant REPUTATION_STEP = 10;

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable bondToken;

    // --- bounded, admin-tunable parameters ---
    address public treasury;
    uint256 public minBond;
    uint16 public buyerShareBps = 5_000; // share of a slashed bond credited to the buyer
    uint32 public withdrawCooldown = 3 days;
    uint32 public maxCommitWindow = 1 days; // max (validUntil - now) at commit time
    uint32 public settlementGrace = 1 hours; // buffer after validUntil for in-flight settlement
    uint32 public deliveryWindow = 1 days; // time vendor has to deliver after settlement
    uint32 public disputeWindow = 2 days; // buyer dispute period after deliveryDeadline
    uint32 public arbiterTimeout = 14 days; // after this, anyone can close an unresolved dispute
    uint16 public maxOpenCommitments = 10; // bounds a vendor's concurrent exposure vs. its bond
    bool public permissionedBuyers = true; // enterprise mode: only allowlisted owners can buy

    mapping(address vendor => Vendor) private _vendors;
    // owner(payer) => rfqId => commitment. Namespaced per buyer so nobody can squat an rfqId.
    mapping(address owner => mapping(bytes32 rfqId => Commitment)) private _commitments;

    mapping(address owner => bool) public buyerAllowed;
    mapping(address agent => address owner) public agentOwner;
    mapping(address owner => uint256) public agentCount;
    mapping(address owner => bool) public autoApproveAgentCommits;
    mapping(address owner => bool) public agentMayConfirmDelivery;

    mapping(bytes32 hspRef => bool) public settlementRefUsed;
    mapping(address account => uint256) public claimable; // pull-payment ledger

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event VendorRegistered(address indexed vendor);
    event BondToppedUp(address indexed vendor, uint256 newBond);
    event WithdrawalRequested(address indexed vendor, uint64 availableAt);
    event WithdrawalCancelled(address indexed vendor);
    event BondWithdrawn(address indexed vendor);
    event BuyerAllowlistUpdated(address indexed owner, bool allowed);
    event AgentAuthorized(address indexed owner, address indexed agent);
    event AgentRevoked(address indexed owner, address indexed agent);
    event AutoApproveUpdated(address indexed owner, bool enabled);
    event AgentConfirmUpdated(address indexed owner, bool enabled);

    event BidCommitted(
        address indexed owner, bytes32 indexed rfqId, address indexed vendor, bytes32 bidHash, Status status
    );
    event CommitmentApproved(address indexed owner, bytes32 indexed rfqId);
    event CommitmentRejected(address indexed owner, bytes32 indexed rfqId);
    event MandateRejected(address indexed owner, bytes32 indexed rfqId, VerifyResult reason);
    event Settled(address indexed owner, bytes32 indexed rfqId, bytes32 hspRef, uint64 deliveryDeadline);
    event Delivered(address indexed owner, bytes32 indexed rfqId, address indexed vendor, bytes32 receiptHash);
    event DisputeRaised(address indexed owner, bytes32 indexed rfqId, address indexed by);
    event DisputeClosed(address indexed owner, bytes32 indexed rfqId, Status newStatus);
    event CommitmentExpired(address indexed owner, bytes32 indexed rfqId);
    event VendorSlashed(
        address indexed vendor, address indexed owner, bytes32 indexed rfqId, SlashReason reason, uint256 amount
    );
    event Claimed(address indexed account, uint256 amount);

    event ParamsUpdated(bytes32 indexed param, uint256 value);
    event TreasuryUpdated(address indexed treasury);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error ZeroValue();
    error InvalidParam();
    error NotBuyerAllowed();
    error NotAuthorized();
    error VendorNotEligible();
    error VendorAlreadyRegistered();
    error VendorNotRegistered();
    error VendorBlacklisted();
    error BondTooLow();
    error OpenCommitmentsExist();
    error TooManyOpenCommitments();
    error WithdrawalNotPending();
    error WithdrawalPending();
    error CooldownActive();
    error CommitmentExists();
    error BadValidUntil();
    error BadStatus();
    error TooLate();
    error TooEarly();
    error SelfDealing();
    error SettlementRefReused();
    error InvalidEvidence();
    error NothingToClaim();
    error UnsupportedToken();
    error AgentAlreadyAssigned();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(IERC20 bondToken_, address admin, uint48 adminTransferDelay, address treasury_, uint256 minBond_)
        AccessControlDefaultAdminRules(adminTransferDelay, admin)
        EIP712("ProofBid", "1")
    {
        if (address(bondToken_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (minBond_ == 0 || minBond_ > type(uint128).max) revert InvalidParam();
        bondToken = bondToken_;
        treasury = treasury_;
        minBond = minBond_;
    }

    /*//////////////////////////////////////////////////////////////
                       BUYER / AGENT ACCESS MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Owner (payer wallet) authorises an agent key to commit bids on its behalf.
    /// @dev Only the owner can do this, so a compromised agent cannot add more agents.
    function authorizeAgent(address agent) external {
        if (agent == address(0)) revert ZeroAddress();
        if (agent == msg.sender) revert InvalidParam();
        if (agentOwner[agent] != address(0)) revert AgentAlreadyAssigned();
        if (agentOwner[msg.sender] != address(0)) revert NotAuthorized(); // agents cannot own agents
        if (agentCount[agent] != 0 || buyerAllowed[agent]) revert InvalidParam(); // agent is itself a buyer
        Vendor storage av = _vendors[agent];
        if (av.registered || av.blacklisted) revert InvalidParam(); // vendors can never be agents

        agentOwner[agent] = msg.sender;
        agentCount[msg.sender] += 1;
        emit AgentAuthorized(msg.sender, agent);
    }

    function revokeAgent(address agent) external {
        if (agentOwner[agent] != msg.sender) revert NotAuthorized();
        delete agentOwner[agent];
        agentCount[msg.sender] -= 1;
        emit AgentRevoked(msg.sender, agent);
    }

    /// @notice Owner chooses whether agent commits skip the approval step. Default: false.
    function setAutoApproveAgentCommits(bool enabled) external {
        if (agentOwner[msg.sender] != address(0)) revert NotAuthorized();
        autoApproveAgentCommits[msg.sender] = enabled;
        emit AutoApproveUpdated(msg.sender, enabled);
    }

    /// @notice Owner chooses whether its agents may confirm delivery (irreversible). Default: false.
    function setAgentMayConfirmDelivery(bool enabled) external {
        if (agentOwner[msg.sender] != address(0)) revert NotAuthorized();
        agentMayConfirmDelivery[msg.sender] = enabled;
        emit AgentConfirmUpdated(msg.sender, enabled);
    }

    function setBuyerAllowed(address owner, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (owner == address(0)) revert ZeroAddress();
        if (allowed) {
            if (agentOwner[owner] != address(0)) revert InvalidParam();
            Vendor storage ov = _vendors[owner];
            if (ov.registered || ov.blacklisted) revert InvalidParam(); // vendors cannot be buyers
        }
        buyerAllowed[owner] = allowed;
        emit BuyerAllowlistUpdated(owner, allowed);
    }

    /*//////////////////////////////////////////////////////////////
                         VENDOR BONDS & REPUTATION
    //////////////////////////////////////////////////////////////*/

    function registerVendor(uint256 bondAmount) external whenNotPaused nonReentrant {
        Vendor storage v = _vendors[msg.sender];
        if (v.blacklisted) revert VendorBlacklisted();
        if (v.registered) revert VendorAlreadyRegistered();
        if (agentOwner[msg.sender] != address(0) || agentCount[msg.sender] != 0 || buyerAllowed[msg.sender]) {
            revert NotAuthorized(); // buyers/agents cannot be vendors
        }
        if (bondAmount < minBond) revert BondTooLow();
        if (bondAmount > type(uint128).max) revert InvalidParam();

        v.registered = true;
        v.bond = uint128(bondAmount);
        _pullExact(msg.sender, bondAmount);

        emit VendorRegistered(msg.sender);
        emit BondToppedUp(msg.sender, bondAmount);
    }

    function topUpBond(uint256 amount) external whenNotPaused nonReentrant {
        Vendor storage v = _vendors[msg.sender];
        if (!v.registered) revert VendorNotRegistered();
        if (v.blacklisted) revert VendorBlacklisted();
        if (amount == 0) revert ZeroValue();
        uint256 newBond = uint256(v.bond) + amount;
        if (newBond > type(uint128).max) revert InvalidParam();

        v.bond = uint128(newBond);
        _pullExact(msg.sender, amount);
        emit BondToppedUp(msg.sender, newBond);
    }

    /// @notice Step 1 of exit: stops new commitments immediately; funds released after cooldown.
    function requestBondWithdrawal() external {
        Vendor storage v = _vendors[msg.sender];
        if (!v.registered) revert VendorNotRegistered();
        if (v.blacklisted) revert VendorBlacklisted();
        if (v.withdrawPending) revert WithdrawalPending();
        if (v.openCommitments != 0) revert OpenCommitmentsExist();

        v.withdrawPending = true;
        v.withdrawAvailableAt = uint64(block.timestamp) + withdrawCooldown;
        emit WithdrawalRequested(msg.sender, v.withdrawAvailableAt);
    }

    function cancelBondWithdrawal() external {
        Vendor storage v = _vendors[msg.sender];
        if (!v.withdrawPending) revert WithdrawalNotPending();
        v.withdrawPending = false;
        v.withdrawAvailableAt = 0;
        emit WithdrawalCancelled(msg.sender);
    }

    /// @notice Step 2 of exit. Deregisters the vendor and returns the bond. Reputation is preserved.
    function executeBondWithdrawal() external nonReentrant {
        Vendor storage v = _vendors[msg.sender];
        if (!v.withdrawPending) revert WithdrawalNotPending();
        if (v.blacklisted) revert VendorBlacklisted();
        if (block.timestamp < v.withdrawAvailableAt) revert CooldownActive();
        if (v.openCommitments != 0) revert OpenCommitmentsExist();

        uint256 amount = v.bond;
        // effects before interaction
        v.bond = 0;
        v.registered = false;
        v.withdrawPending = false;
        v.withdrawAvailableAt = 0;
        bondToken.safeTransfer(msg.sender, amount);
        emit BondWithdrawn(msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                         COMMIT / APPROVE WORKFLOW
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Lock the winning bid's hash on-chain. No price/terms are disclosed.
     * @param rfqId      RFQ identifier (namespaced under the buyer owner).
     * @param bidHash    keccak256(abi.encode(rfqId, vendor, token, totalAmount, slaHash, quoteExpiry, salt, chainId)),
     *                   see {computeBidHash}.
     * @param vendor     Winning vendor address (must be bonded and not blacklisted).
     * @param validUntil Timestamp until which this commitment may be settled.
     * @dev msg.sender is either the buyer owner (auto-approved) or an agent authorised by it.
     *      A previously REJECTED / EXPIRED / SLASHED rfqId may be committed again (fallback to next bid).
     */
    function commitWinningBid(bytes32 rfqId, bytes32 bidHash, address vendor, uint64 validUntil)
        external
        whenNotPaused
    {
        if (rfqId == bytes32(0) || bidHash == bytes32(0)) revert ZeroValue();

        address owner = agentOwner[msg.sender];
        bool byOwner = owner == address(0);
        if (byOwner) owner = msg.sender;

        if (permissionedBuyers && !buyerAllowed[owner]) revert NotBuyerAllowed();
        if (vendor == owner || vendor == msg.sender) revert SelfDealing();

        Commitment storage c = _commitments[owner][rfqId];
        Status prev = c.status;
        if (prev != Status.NONE) {
            // fallback path: only failed attempts may be replaced; live or successful ones never
            if (prev != Status.REJECTED && prev != Status.EXPIRED && prev != Status.SLASHED) {
                revert CommitmentExists();
            }
            delete _commitments[owner][rfqId];
        }

        if (validUntil <= block.timestamp || validUntil > block.timestamp + maxCommitWindow) revert BadValidUntil();

        Vendor storage v = _vendors[vendor];
        if (!_isEligible(v)) revert VendorNotEligible();
        if (v.openCommitments >= maxOpenCommitments) revert TooManyOpenCommitments();
        v.openCommitments += 1;

        Status st = (byOwner || autoApproveAgentCommits[owner]) ? Status.APPROVED : Status.PENDING_APPROVAL;

        c.bidHash = bidHash;
        c.vendor = vendor;
        c.committedBy = msg.sender;
        c.status = st;
        c.committedAt = uint64(block.timestamp);
        c.validUntil = validUntil;

        emit BidCommitted(owner, rfqId, vendor, bidHash, st);
    }

    /// @notice Owner approves a commitment made by its agent. Only the owner wallet can do this.
    function approveCommitment(bytes32 rfqId) external {
        Commitment storage c = _commitments[msg.sender][rfqId];
        if (c.status != Status.PENDING_APPROVAL) revert BadStatus();
        if (block.timestamp > c.validUntil) revert TooLate();
        c.status = Status.APPROVED;
        emit CommitmentApproved(msg.sender, rfqId);
    }

    /// @notice Owner rejects / cancels a commitment that has not been settled yet.
    function rejectCommitment(bytes32 rfqId) external {
        Commitment storage c = _commitments[msg.sender][rfqId];
        if (c.status != Status.PENDING_APPROVAL && c.status != Status.APPROVED) revert BadStatus();
        c.status = Status.REJECTED;
        _closeOpen(c.vendor);
        emit CommitmentRejected(msg.sender, rfqId);
    }

    /// @notice Anyone may release an unsettled, expired commitment so the vendor's slot is freed.
    function releaseExpired(address owner, bytes32 rfqId) external {
        Commitment storage c = _commitments[owner][rfqId];
        if (c.status != Status.PENDING_APPROVAL && c.status != Status.APPROVED) revert BadStatus();
        if (block.timestamp <= uint256(c.validUntil) + settlementGrace) revert TooEarly();
        c.status = Status.EXPIRED;
        _closeOpen(c.vendor);
        emit CommitmentExpired(owner, rfqId);
    }

    /*//////////////////////////////////////////////////////////////
                         3-WAY MATCH VERIFICATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Verify that the HSP Payment Mandate matches the committed bid byte-for-byte.
     * @dev `view`: intended to be called off-chain (eth_call) by the HSP gateway / verifier, so the
     *      terms never appear in an on-chain transaction. Returns a reason code instead of reverting
     *      to drive the attack-simulation trace. Without the secret `salt` an attacker cannot
     *      produce an OK result or learn the terms.
     * @param payer  Buyer owner wallet (mandate payer).
     * @param payee  Mandate destination account.
     * @param salt   Secret salt shared by the buyer with the verifier.
     * @param ref    Value in the mandate's metadata/reference field (must equal bidHash).
     */
    function verifyMandate(
        address payer,
        bytes32 rfqId,
        address payee,
        address token,
        uint256 totalAmount,
        bytes32 slaHash,
        uint256 quoteExpiry,
        bytes32 salt,
        bytes32 ref
    ) external view returns (bool ok, VerifyResult result) {
        Commitment storage c = _commitments[payer][rfqId];

        if (c.status == Status.NONE) return (false, VerifyResult.NO_COMMITMENT);
        if (c.status == Status.PENDING_APPROVAL) return (false, VerifyResult.NOT_APPROVED);
        if (c.status != Status.APPROVED) return (false, VerifyResult.BAD_STATUS);
        if (block.timestamp > c.validUntil) return (false, VerifyResult.COMMITMENT_EXPIRED);
        if (quoteExpiry < block.timestamp) return (false, VerifyResult.QUOTE_EXPIRED);

        Vendor storage v = _vendors[c.vendor];
        if (!v.registered || v.blacklisted || v.withdrawPending) return (false, VerifyResult.VENDOR_INELIGIBLE);

        if (payee != c.vendor) return (false, VerifyResult.PAYEE_MISMATCH);
        if (ref != c.bidHash) return (false, VerifyResult.REF_MISMATCH);
        if (computeBidHash(rfqId, payee, token, totalAmount, slaHash, quoteExpiry, salt) != c.bidHash) {
            return (false, VerifyResult.TERMS_MISMATCH);
        }
        return (true, VerifyResult.OK);
    }

    /// @notice Canonical commitment hash. Binds chainId to prevent cross-chain replay.
    function computeBidHash(
        bytes32 rfqId,
        address vendor,
        address token,
        uint256 totalAmount,
        bytes32 slaHash,
        uint256 quoteExpiry,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(abi.encode(rfqId, vendor, token, totalAmount, slaHash, quoteExpiry, salt, block.chainid));
    }

    /*//////////////////////////////////////////////////////////////
                          SETTLEMENT (VERIFIER ONLY)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Record that HSP executed the A2A transfer for a commitment.
     * @dev Deliberately NOT pausable: if funds already moved, the record must be writable.
     *      Also tolerates the two benign races where the owner rejected, or the buyer disputed,
     *      between HSP's verification and its execution, so a real payment is never left unrecorded.
     */
    function markSettled(address payer, bytes32 rfqId, bytes32 hspRef) external onlyRole(VERIFIER_ROLE) {
        if (hspRef == bytes32(0)) revert ZeroValue();
        if (settlementRefUsed[hspRef]) revert SettlementRefReused();

        Commitment storage c = _commitments[payer][rfqId];
        Status st = c.status;
        if (block.timestamp > uint256(c.validUntil) + settlementGrace) revert TooLate();

        if (st == Status.APPROVED) {
            c.status = Status.SETTLED;
        } else if (st == Status.REJECTED) {
            // race: owner rejected after verification, before execution. Re-open vendor slot.
            _vendors[c.vendor].openCommitments += 1;
            c.status = Status.SETTLED;
        } else if (st == Status.DISPUTED && c.settlementRef == bytes32(0)) {
            // race: pre-settlement dispute; keep DISPUTED so the arbiter decides, but record payment.
        } else {
            revert BadStatus();
        }

        settlementRefUsed[hspRef] = true;
        c.settlementRef = hspRef;
        c.deliveryDeadline = uint64(block.timestamp) + deliveryWindow;
        c.disputeDeadline = c.deliveryDeadline + disputeWindow;

        emit Settled(payer, rfqId, hspRef, c.deliveryDeadline);
    }

    /// @notice Verifier records an off-chain rejection (audit trail only, no state change).
    function recordMandateRejection(address payer, bytes32 rfqId, VerifyResult reason)
        external
        onlyRole(VERIFIER_ROLE)
    {
        if (_commitments[payer][rfqId].status == Status.NONE) revert BadStatus();
        emit MandateRejected(payer, rfqId, reason);
    }

    /*//////////////////////////////////////////////////////////////
                       DELIVERY, DISPUTE & RESOLUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Buyer confirms delivery (irreversible: ends dispute rights, raises vendor reputation).
    ///         Owner only, unless the owner enabled `agentMayConfirmDelivery`.
    /// @param receiptHash Optional opaque hash of the delivery receipt (PRD FR-7.3); emitted only.
    function confirmDelivery(address payer, bytes32 rfqId, bytes32 receiptHash) external {
        if (msg.sender != payer && !(agentOwner[msg.sender] == payer && agentMayConfirmDelivery[payer])) {
            revert NotAuthorized();
        }
        Commitment storage c = _commitments[payer][rfqId];
        if (c.status != Status.SETTLED) revert BadStatus();
        _completeDelivery(payer, rfqId, c, receiptHash);
    }

    /// @notice Buyer (owner or agent) raises a dispute. Allowed while APPROVED (e.g. off-chain
    ///         tampering attempt, evidence shown privately to the arbiter) or within the dispute
    ///         window after settlement (non-delivery).
    function raiseDispute(address payer, bytes32 rfqId) external {
        _requireBuyerSide(payer);
        Commitment storage c = _commitments[payer][rfqId];
        Status st = c.status;
        if (st == Status.SETTLED) {
            if (block.timestamp > c.disputeDeadline) revert TooLate();
        } else if (st == Status.APPROVED) {
            if (block.timestamp > uint256(c.validUntil) + settlementGrace) revert TooLate();
        } else {
            revert BadStatus();
        }
        c.status = Status.DISPUTED;
        c.disputedAt = uint64(block.timestamp);
        emit DisputeRaised(payer, rfqId, msg.sender);
    }

    /// @notice If no dispute is raised before the dispute window closes, anyone can finalise.
    function finalizeSettled(address payer, bytes32 rfqId) external {
        Commitment storage c = _commitments[payer][rfqId];
        if (c.status != Status.SETTLED) revert BadStatus();
        if (block.timestamp <= c.disputeDeadline) revert TooEarly();
        _completeDelivery(payer, rfqId, c, bytes32(0));
    }

    function resolveDispute(address payer, bytes32 rfqId, bool vendorAtFault) external onlyRole(ARBITER_ROLE) {
        Commitment storage c = _commitments[payer][rfqId];
        if (c.status != Status.DISPUTED) revert BadStatus();
        if (vendorAtFault) {
            _slash(payer, rfqId, c, SlashReason.DISPUTE_RESOLVED);
        } else if (c.settlementRef != bytes32(0)) {
            _completeDelivery(payer, rfqId, c, bytes32(0));
        } else if (block.timestamp <= c.validUntil) {
            // pre-settlement dispute dismissed: commitment goes back to APPROVED
            c.status = Status.APPROVED;
            emit DisputeClosed(payer, rfqId, Status.APPROVED);
        } else {
            c.status = Status.EXPIRED;
            _closeOpen(c.vendor);
            emit DisputeClosed(payer, rfqId, Status.EXPIRED);
        }
    }

    /// @notice Liveness fallback: if the arbiter never resolves, anyone can close the dispute
    ///         after `arbiterTimeout`. No fault is assigned and no reputation changes.
    function expireDispute(address payer, bytes32 rfqId) external {
        Commitment storage c = _commitments[payer][rfqId];
        if (c.status != Status.DISPUTED) revert BadStatus();
        if (block.timestamp <= uint256(c.disputedAt) + arbiterTimeout) revert TooEarly();
        c.status = Status.EXPIRED;
        _closeOpen(c.vendor);
        emit DisputeClosed(payer, rfqId, Status.EXPIRED);
    }

    /*//////////////////////////////////////////////////////////////
                           TAMPER EVIDENCE SLASH
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Slash a vendor that signed conflicting, harmful terms for a committed bid
     *         (bait-and-switch: higher price, different payee, token or SLA).
     * @dev Evidence = (1) the vendor-signed Quote that hashes (with `salt`) to the committed `bidHash`,
     *      and (2) a vendor-signed PaymentConditions message for the SAME rfqId that is harmful to the
     *      buyer. Both are verified on-chain via EIP-712. Terms are disclosed in this transaction's
     *      calldata by the reporter's choice; use `raiseDispute` for private evidence.
     *      Callable by the buyer owner, its agent, the verifier service (automatic slashing) or the arbiter.
     *      Contract-wallet vendors cannot be evidenced here (ECDSA only).
     */
    function reportTamper(
        address payer,
        bytes32 rfqId,
        bytes32 salt,
        Terms calldata quote,
        bytes calldata quoteSig,
        Terms calldata conditions,
        bytes calldata conditionsSig
    ) external {
        if (!hasRole(ARBITER_ROLE, msg.sender) && !hasRole(VERIFIER_ROLE, msg.sender)) _requireBuyerSide(payer);

        Commitment storage c = _commitments[payer][rfqId];
        Status st = c.status;
        if (
            st != Status.PENDING_APPROVAL && st != Status.APPROVED && st != Status.SETTLED && st != Status.DISPUTED
        ) revert BadStatus();

        address vendor = c.vendor;
        if (quote.rfqId != rfqId || conditions.rfqId != rfqId || quote.vendorAddress != vendor) {
            revert InvalidEvidence();
        }

        // (1) the quote must be the committed winner and signed by the vendor
        if (
            computeBidHash(
                    quote.rfqId, quote.vendorAddress, quote.tokenAddress, quote.totalAmount, quote.slaHash, quote.expiry, salt
                ) != c.bidHash
        ) revert InvalidEvidence();
        if (_recover(QUOTE_TYPEHASH, quote, quoteSig) != vendor) revert InvalidEvidence();

        // (2) a harmful conditions message, also signed by the vendor.
        //     conditions.vendorAddress is the (possibly swapped) payee; the signer is what binds identity.
        bool harmful = conditions.vendorAddress != quote.vendorAddress || conditions.tokenAddress != quote.tokenAddress
            || conditions.totalAmount > quote.totalAmount || conditions.unitPrice > quote.unitPrice
            || conditions.slaHash != quote.slaHash;
        if (!harmful) revert InvalidEvidence();
        if (_recover(CONDITIONS_TYPEHASH, conditions, conditionsSig) != vendor) revert InvalidEvidence();

        _slash(payer, rfqId, c, SlashReason.TAMPER_EVIDENCE);
    }

    /*//////////////////////////////////////////////////////////////
                            PULL PAYMENTS
    //////////////////////////////////////////////////////////////*/

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        bondToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW HELPERS
    //////////////////////////////////////////////////////////////*/

    function getVendor(address vendor) external view returns (Vendor memory) {
        return _vendors[vendor];
    }

    function getCommitment(address owner, bytes32 rfqId) external view returns (Commitment memory) {
        return _commitments[owner][rfqId];
    }

    function isVendorEligible(address vendor) external view returns (bool) {
        return _isEligible(_vendors[vendor]);
    }

    /// @dev On-chain ReputationScore input for the buyer agent's scoring engine (0..1000).
    function reputationOf(address vendor) external view returns (uint32) {
        return _vendors[vendor].reputation;
    }

    function quoteDigest(Terms calldata t) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(QUOTE_TYPEHASH, t));
    }

    function conditionsDigest(Terms calldata t) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(CONDITIONS_TYPEHASH, t));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN (BOUNDED PARAMETERS)
    //////////////////////////////////////////////////////////////*/

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setMinBond(uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (v == 0 || v > type(uint128).max) revert InvalidParam();
        minBond = v;
        emit ParamsUpdated("minBond", v);
    }

    function setBuyerShareBps(uint16 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (v > MAX_BPS) revert InvalidParam();
        buyerShareBps = v;
        emit ParamsUpdated("buyerShareBps", v);
    }

    function setWindows(
        uint32 withdrawCooldown_,
        uint32 maxCommitWindow_,
        uint32 settlementGrace_,
        uint32 deliveryWindow_,
        uint32 disputeWindow_,
        uint32 arbiterTimeout_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // sane bounds so governance cannot brick or trivialise the protocol
        if (withdrawCooldown_ < 1 days || withdrawCooldown_ > 30 days) revert InvalidParam();
        if (maxCommitWindow_ < 5 minutes || maxCommitWindow_ > 7 days) revert InvalidParam();
        if (settlementGrace_ > 1 days) revert InvalidParam();
        if (deliveryWindow_ < 1 hours || deliveryWindow_ > 30 days) revert InvalidParam();
        if (disputeWindow_ < 1 hours || disputeWindow_ > 30 days) revert InvalidParam();
        if (arbiterTimeout_ < 1 days || arbiterTimeout_ > 90 days) revert InvalidParam();
        withdrawCooldown = withdrawCooldown_;
        maxCommitWindow = maxCommitWindow_;
        settlementGrace = settlementGrace_;
        deliveryWindow = deliveryWindow_;
        disputeWindow = disputeWindow_;
        arbiterTimeout = arbiterTimeout_;
        emit ParamsUpdated("windows", block.timestamp);
    }

    function setMaxOpenCommitments(uint16 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (v == 0) revert InvalidParam();
        maxOpenCommitments = v;
        emit ParamsUpdated("maxOpenCommitments", v);
    }

    function setPermissionedBuyers(bool v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        permissionedBuyers = v;
        emit ParamsUpdated("permissionedBuyers", v ? 1 : 0);
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL / PRIVATE LOGIC
    //////////////////////////////////////////////////////////////*/

    function _isEligible(Vendor storage v) private view returns (bool) {
        return v.registered && !v.blacklisted && !v.withdrawPending && v.bond >= minBond;
    }

    function _requireBuyerSide(address payer) private view {
        if (msg.sender != payer && agentOwner[msg.sender] != payer) revert NotAuthorized();
    }

    function _closeOpen(address vendor) private {
        Vendor storage v = _vendors[vendor];
        if (v.openCommitments > 0) v.openCommitments -= 1;
    }

    function _completeDelivery(address payer, bytes32 rfqId, Commitment storage c, bytes32 receiptHash) private {
        c.status = Status.DELIVERED;
        address vendor = c.vendor;
        Vendor storage v = _vendors[vendor];
        if (v.openCommitments > 0) v.openCommitments -= 1;

        uint32 rep = v.reputation + REPUTATION_STEP;
        v.reputation = rep > MAX_REPUTATION ? MAX_REPUTATION : rep;
        emit Delivered(payer, rfqId, vendor, receiptHash);
    }

    function _slash(address payer, bytes32 rfqId, Commitment storage c, SlashReason reason) private {
        address vendor = c.vendor;
        Vendor storage v = _vendors[vendor];

        uint256 bond = v.bond;
        // effects
        v.bond = 0;
        v.blacklisted = true;
        v.reputation = 0;
        v.withdrawPending = false;
        v.withdrawAvailableAt = 0;
        if (v.openCommitments > 0) v.openCommitments -= 1;
        c.status = Status.SLASHED;

        // accounting via pull-payment ledger (no external calls here)
        uint256 buyerShare = (bond * buyerShareBps) / MAX_BPS;
        if (buyerShare > 0) claimable[payer] += buyerShare;
        uint256 rest = bond - buyerShare;
        if (rest > 0) claimable[treasury] += rest;

        emit VendorSlashed(vendor, payer, rfqId, reason, bond);
    }

    /// @dev Pull tokens and require the full amount arrived (rejects fee-on-transfer tokens).
    function _pullExact(address from, uint256 amount) private {
        uint256 beforeBal = bondToken.balanceOf(address(this));
        bondToken.safeTransferFrom(from, address(this), amount);
        if (bondToken.balanceOf(address(this)) - beforeBal != amount) revert UnsupportedToken();
    }

    function _structHash(bytes32 typehash, Terms calldata t) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                typehash, t.rfqId, t.vendorAddress, t.tokenAddress, t.unitPrice, t.totalAmount, t.slaHash, t.expiry
            )
        );
    }

    /// @dev Strict recovery: rejects malformed / malleable signatures and the zero address.
    function _recover(bytes32 typehash, Terms calldata t, bytes calldata sig) private view returns (address) {
        bytes32 digest = _hashTypedDataV4(_structHash(typehash, t));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer == address(0)) revert InvalidEvidence();
        return signer;
    }
}
