// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ProofBidAnchor
/// @notice Immutable, buyer-owned audit records. This contract neither moves funds nor verifies payment or delivery.
contract ProofBidAnchor {
    error ZeroDigest();
    error InvalidAttempt();
    error AlreadyAnchored();

    struct Commitment {
        bytes32 quoteDigest;
        bytes32 approvalDigest;
    }

    /// @notice Identifies the ProofBid deployment whose audit records this contract stores.
    bytes32 public immutable deploymentId;

    /// @notice Returns the original digests for a buyer, RFQ and attempt; zero values mean absent.
    mapping(address buyer => mapping(bytes32 rfqId => mapping(uint32 attempt => Commitment))) public commitments;

    /// @notice Emitted once for each buyer-owned audit record.
    event Anchored(
        address indexed buyer,
        bytes32 indexed rfqId,
        uint32 indexed attempt,
        bytes32 quoteDigest,
        bytes32 approvalDigest
    );

    /// @param deploymentId_ Nonzero namespace used by this ProofBid deployment.
    constructor(bytes32 deploymentId_) {
        if (deploymentId_ == bytes32(0)) revert ZeroDigest();
        deploymentId = deploymentId_;
    }

    /// @notice Records digests under the caller's identity, once per RFQ and attempt. No third-party buyer can be supplied.
    /// @param rfqId Nonzero request identifier.
    /// @param attempt Positive attempt number; different attempts are separate immutable records.
    /// @param quoteDigest Digest of the selected signed quote.
    /// @param approvalDigest Digest of the exact public payment preparation reviewed by the buyer.
    function anchor(bytes32 rfqId, uint32 attempt, bytes32 quoteDigest, bytes32 approvalDigest) external {
        if (rfqId == bytes32(0) || quoteDigest == bytes32(0) || approvalDigest == bytes32(0)) revert ZeroDigest();
        if (attempt == 0) revert InvalidAttempt();
        Commitment storage record = commitments[msg.sender][rfqId][attempt];
        if (record.quoteDigest != bytes32(0)) revert AlreadyAnchored();
        record.quoteDigest = quoteDigest;
        record.approvalDigest = approvalDigest;
        emit Anchored(msg.sender, rfqId, attempt, quoteDigest, approvalDigest);
    }
}
