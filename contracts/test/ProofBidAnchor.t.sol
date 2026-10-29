// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProofBidAnchor} from "../src/ProofBidAnchor.sol";

// Only the cheatcodes used here; no external testing-library dependency is needed.
interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectEmit(bool, bool, bool, bool, address) external;
    function deal(address, uint256) external;
}

contract ProofBidAnchorTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant DEPLOYMENT = keccak256("proofbid-test");
    bytes32 private constant RFQ = keccak256("rfq");
    bytes32 private constant QUOTE = keccak256("quote");
    bytes32 private constant APPROVAL = keccak256("approval");
    ProofBidAnchor private anchorContract;

    event Anchored(
        address indexed buyer,
        bytes32 indexed rfqId,
        uint32 indexed attempt,
        bytes32 quoteDigest,
        bytes32 approvalDigest
    );

    function setUp() public {
        anchorContract = new ProofBidAnchor(DEPLOYMENT);
    }

    function test_recordsExactDigestsAndEmitsBuyerEvent() public {
        assert(anchorContract.deploymentId() == DEPLOYMENT);
        vm.expectEmit(true, true, true, true, address(anchorContract));
        emit Anchored(address(this), RFQ, 1, QUOTE, APPROVAL);
        anchorContract.anchor(RFQ, 1, QUOTE, APPROVAL);
        (bytes32 q, bytes32 a) = anchorContract.commitments(address(this), RFQ, 1);
        assert(q == QUOTE && a == APPROVAL);
    }

    function test_rejectsOverwriteEvenWithDifferentDigests() public {
        anchorContract.anchor(RFQ, 1, QUOTE, APPROVAL);
        vm.expectRevert(ProofBidAnchor.AlreadyAnchored.selector);
        anchorContract.anchor(RFQ, 1, APPROVAL, QUOTE);
    }

    function test_otherBuyerCannotOverwriteOrSquatOriginalBuyersRecord() public {
        address other = address(0xBEEF);
        vm.prank(other);
        anchorContract.anchor(RFQ, 1, APPROVAL, QUOTE);
        anchorContract.anchor(RFQ, 1, QUOTE, APPROVAL);
        (bytes32 ownQuote,) = anchorContract.commitments(address(this), RFQ, 1);
        (bytes32 otherQuote,) = anchorContract.commitments(other, RFQ, 1);
        assert(ownQuote == QUOTE && otherQuote == APPROVAL);
    }

    function test_attemptsAndRequestsAreIndependent() public {
        anchorContract.anchor(RFQ, 1, QUOTE, APPROVAL);
        anchorContract.anchor(RFQ, 2, APPROVAL, QUOTE);
        anchorContract.anchor(QUOTE, 1, APPROVAL, QUOTE);
        (bytes32 q,) = anchorContract.commitments(address(this), RFQ, 1);
        assert(q == QUOTE);
    }

    function test_rejectsZeroFieldsAndAttempt() public {
        vm.expectRevert(ProofBidAnchor.ZeroDigest.selector);
        new ProofBidAnchor(bytes32(0));
        vm.expectRevert(ProofBidAnchor.ZeroDigest.selector);
        anchorContract.anchor(bytes32(0), 1, QUOTE, APPROVAL);
        vm.expectRevert(ProofBidAnchor.ZeroDigest.selector);
        anchorContract.anchor(RFQ, 1, bytes32(0), APPROVAL);
        vm.expectRevert(ProofBidAnchor.ZeroDigest.selector);
        anchorContract.anchor(RFQ, 1, QUOTE, bytes32(0));
        vm.expectRevert(ProofBidAnchor.InvalidAttempt.selector);
        anchorContract.anchor(RFQ, 0, QUOTE, APPROVAL);
    }

    function test_rejectsNativeTokenTransfersAndValueOnCalls() public {
        vm.deal(address(this), 2 ether);
        (bool sent,) = address(anchorContract).call{value: 1 ether}("");
        assert(!sent);
        (bool called,) = address(anchorContract).call{value: 1 ether}(
            abi.encodeCall(ProofBidAnchor.anchor, (RFQ, 1, QUOTE, APPROVAL))
        );
        assert(!called);
        (bytes32 q,) = anchorContract.commitments(address(this), RFQ, 1);
        assert(q == bytes32(0));
    }

    function testFuzz_buyerOwnsImmutableRecord(address buyer, bytes32 rfq, uint32 attempt, bytes32 q, bytes32 a)
        public
    {
        if (buyer == address(0) || rfq == bytes32(0) || attempt == 0 || q == bytes32(0) || a == bytes32(0)) {
            return;
        }
        vm.prank(buyer);
        anchorContract.anchor(rfq, attempt, q, a);
        (bytes32 storedQ, bytes32 storedA) = anchorContract.commitments(buyer, rfq, attempt);
        assert(storedQ == q && storedA == a);
        vm.expectRevert(ProofBidAnchor.AlreadyAnchored.selector);
        vm.prank(buyer);
        anchorContract.anchor(rfq, attempt, a, q);
        (storedQ, storedA) = anchorContract.commitments(buyer, rfq, attempt);
        assert(storedQ == q && storedA == a);
    }
}

contract AnchorHandler {
    ProofBidAnchor public immutable target;
    bytes32 public immutable namespace;
    uint32 public count;

    constructor(ProofBidAnchor target_) {
        target = target_;
        namespace = target_.deploymentId();
    }

    function record(bytes32 seed) public {
        if (count >= 256) return;
        count++;
        bytes32 rfq = keccak256(abi.encode(seed, count));
        bytes32 q = keccak256(abi.encode("quote", count));
        bytes32 a = keccak256(abi.encode("approval", count));
        target.anchor(rfq, count, q, a);
        (bytes32 storedQ, bytes32 storedA) = target.commitments(address(this), rfq, count);
        assert(storedQ == q && storedA == a);
        (bool overwritten,) = address(target).call(abi.encodeCall(ProofBidAnchor.anchor, (rfq, count, a, q)));
        assert(!overwritten);
    }
}

contract ProofBidAnchorInvariantTest {
    ProofBidAnchor private target;
    AnchorHandler private handler;

    function setUp() public {
        target = new ProofBidAnchor(keccak256("invariant"));
        handler = new AnchorHandler(target);
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariant_namespaceNeverChanges() public view {
        assert(target.deploymentId() == handler.namespace());
    }
}
