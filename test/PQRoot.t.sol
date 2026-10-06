// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {PQRoot} from "../contracts/PQRoot.sol";
import {RootFactory} from "../contracts/RootFactory.sol";
import {MockPQ, MockUSDC, MockBarkeep, MockTab} from "./mocks/Mocks.sol";

contract PQRootTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant PQ = 0x1800000000000000000000000000000000000004;
    address internal constant BARKEEP = 0xccebC58DD1F5937B36D5f9F89f0754424f4D443c;

    RootFactory internal factory;
    address internal userA = address(0xA11CE);
    address internal userB = address(0xB0B);
    address internal agentA = address(0xA6E7A);
    address internal agentB = address(0xA6E7B);
    address internal payee = address(0xBEEF);

    function setUp() public {
        vm.chainId(5042);
        vm.etch(USDC, type(MockUSDC).runtimeCode);
        vm.etch(PQ, type(MockPQ).runtimeCode);
        vm.etch(BARKEEP, type(MockBarkeep).runtimeCode);
        factory = new RootFactory();
    }

    function test_two_users_are_isolated() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 5_000_000);
        PQRoot b = _root(userB, bytes32(uint256(2)), 5_000_000);
        assertTrue(address(a) != address(b));
        assertEq(a.registrar(), userA);
        assertEq(b.registrar(), userB);
        assertEq(factory.registrarOf(address(a)), userA);
        assertEq(factory.rootCount(userA), 1);
        assertEq(factory.rootAt(userA, 0), address(a));

        MockUSDC(USDC).mint(address(a), 4_000_000);
        MockUSDC(USDC).mint(address(b), 4_000_000);

        address tabA = _open(a, agentA, 1_000_000, 200_000);
        address tabB = _open(b, agentB, 2_000_000, 200_000);
        assertEq(MockTab(tabA).owner(), address(a));
        assertEq(MockTab(tabB).owner(), address(b));
        assertEq(MockTab(tabA).agent(), agentA);
        assertEq(a.openExposure(), 1_000_000);
        assertEq(b.openExposure(), 2_000_000);

        bytes memory steal = _actionClose(tabB);
        uint64 nonceA = a.nextNonce();
        uint64 soon = uint64(block.timestamp + 1 hours);
        bytes memory stealSig = _sigFor(a, steal, nonceA, soon);
        vm.expectRevert(PQRoot.AlreadyClosed.selector);
        a.execute(steal, nonceA, soon, stealSig);
        assertEq(b.openExposure(), 2_000_000);
        assertEq(MockUSDC(USDC).balanceOf(tabB), 2_000_000);

        vm.expectRevert(PQRoot.AlreadyClosed.selector);
        a.reclaim(tabB);

        bytes memory forged = _actionTransfer(payee, 1);
        bytes memory badSig = _sig(a.pqVk(), bytes32(uint256(1)), false);
        vm.prank(agentA);
        vm.expectRevert(PQRoot.InvalidSignature.selector);
        a.execute(forged, 1, uint64(block.timestamp + 1 days), badSig);
    }

    function test_exposure_tracks_caps_not_balances() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 3_000_000);
        MockUSDC(USDC).mint(address(a), 3_000_000);
        address tab = _open(a, agentA, 1_000_000, 200_000);
        assertEq(a.openExposure(), 1_000_000);
        MockUSDC(USDC).mint(tab, 5);
        assertEq(a.openExposure(), 1_000_000);
        MockUSDC(USDC).mint(address(a), 7);
        assertEq(a.openExposure(), 1_000_000);

        vm.warp(block.timestamp + 2 days);
        uint256 rootBefore = MockUSDC(USDC).balanceOf(address(a));
        a.reclaim(tab);
        assertEq(a.openExposure(), 0);
        assertEq(MockUSDC(USDC).balanceOf(tab), 0);
        assertEq(MockUSDC(USDC).balanceOf(address(a)), rootBefore + 1_000_005);
        vm.expectRevert(PQRoot.SweepNotNeeded.selector);
        a.retrySweep(tab);
    }

    function test_failed_sweep_does_not_double_subtract() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 3_000_000);
        MockUSDC(USDC).mint(address(a), 1_000_000);
        address tab = _open(a, agentA, 1_000_000, 200_000);
        MockUSDC(USDC).setFailTransfers(true);
        vm.warp(block.timestamp + 2 days);
        a.reclaim(tab);
        assertEq(a.openExposure(), 0);
        (,,, bool needs) = a.tabs(tab);
        assertTrue(needs);
        assertEq(MockUSDC(USDC).balanceOf(tab), 1_000_000);

        a.retrySweep(tab);
        assertEq(a.openExposure(), 0);
        assertEq(MockUSDC(USDC).balanceOf(tab), 1_000_000);

        MockUSDC(USDC).setFailTransfers(false);
        a.retrySweep(tab);
        assertEq(a.openExposure(), 0);
        assertEq(MockUSDC(USDC).balanceOf(tab), 0);
        assertEq(MockUSDC(USDC).balanceOf(address(a)), 1_000_000);
    }

    function test_replay_wrong_nonce_tamper_and_deadline() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 5_000_000);
        MockUSDC(USDC).mint(address(a), 2_000_000);
        bytes memory action = _actionOpen(agentA, 100_000, 50_000, uint64(block.timestamp + 1 days));
        bytes memory sig = _sigFor(a, action, 0, uint64(block.timestamp + 1 hours));
        a.execute(action, 0, uint64(block.timestamp + 1 hours), sig);
        vm.expectRevert(PQRoot.BadNonce.selector);
        a.execute(action, 0, uint64(block.timestamp + 1 hours), sig);

        bytes memory transfer = _actionTransfer(payee, 10);
        uint64 soon = uint64(block.timestamp + 1 hours);
        bytes memory sigNonce0 = _sigFor(a, transfer, 0, soon);
        bytes memory sigNonce2 = _sigFor(a, transfer, 2, soon);
        vm.expectRevert(PQRoot.BadNonce.selector);
        a.execute(transfer, 0, soon, sigNonce0);
        vm.expectRevert(PQRoot.BadNonce.selector);
        a.execute(transfer, 2, soon, sigNonce2);

        bytes memory bad = _actionTransfer(payee, 11);
        bytes memory sigRight = _sigFor(a, transfer, 1, soon);
        vm.expectRevert(PQRoot.InvalidSignature.selector);
        a.execute(bad, 1, soon, sigRight);

        uint64 past = uint64(block.timestamp - 1);
        bytes memory sigPast = _sigFor(a, transfer, 1, past);
        vm.expectRevert(PQRoot.Expired.selector);
        a.execute(transfer, 1, past, sigPast);

        uint64 far = uint64(block.timestamp + 8 days);
        bytes memory sigFar = _sigFor(a, transfer, 1, far);
        vm.expectRevert(PQRoot.DeadlineTooFar.selector);
        a.execute(transfer, 1, far, sigFar);
    }

    function test_cross_root_replay_fails() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 5_000_000);
        PQRoot b = _root(userB, bytes32(uint256(2)), 5_000_000);
        MockUSDC(USDC).mint(address(b), 100);
        bytes memory action = _actionTransfer(payee, 10);
        bytes memory sig = _sigFor(a, action, 0, uint64(block.timestamp + 1 hours));
        vm.expectRevert(PQRoot.InvalidSignature.selector);
        b.execute(action, 0, uint64(block.timestamp + 1 hours), sig);
    }

    function test_rotation_invalidates_old_key() public {
        bytes32 vk = bytes32(uint256(1));
        PQRoot a = _root(userA, vk, 5_000_000);
        bytes memory rotate = abi.encode(uint8(4), bytes32(uint256(9)));
        a.execute(rotate, 0, uint64(block.timestamp + 1 hours), _sigForKey(a, vk, rotate, 0, uint64(block.timestamp + 1 hours)));
        assertEq(a.pqVk(), bytes32(uint256(9)));

        bytes memory transfer = _actionTransfer(payee, 1);
        uint64 soon = uint64(block.timestamp + 1 hours);
        bytes memory oldSig = _sigForKey(a, vk, transfer, 1, soon);
        vm.expectRevert(PQRoot.InvalidSignature.selector);
        a.execute(transfer, 1, soon, oldSig);

        MockUSDC(USDC).mint(address(a), 10);
        a.execute(
            transfer,
            1,
            uint64(block.timestamp + 1 hours),
            _sigForKey(a, bytes32(uint256(9)), transfer, 1, uint64(block.timestamp + 1 hours))
        );
        assertEq(MockUSDC(USDC).balanceOf(payee), 1);
    }

    function test_set_exposure_cannot_undercut_open_caps() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 5_000_000);
        MockUSDC(USDC).mint(address(a), 2_000_000);
        _open(a, agentA, 1_000_000, 200_000);
        bytes memory shrink = abi.encode(uint8(5), uint256(100));
        uint64 soon = uint64(block.timestamp + 1 hours);
        bytes memory shrinkSig = _sigFor(a, shrink, 1, soon);
        vm.expectRevert(PQRoot.ExposureExceeded.selector);
        a.execute(shrink, 1, soon, shrinkSig);
        bytes memory grow = abi.encode(uint8(5), uint256(9_000_000));
        a.execute(grow, 1, uint64(block.timestamp + 1 hours), _sigFor(a, grow, 1, uint64(block.timestamp + 1 hours)));
        assertEq(a.maxOpenExposure(), 9_000_000);
        assertEq(a.openExposure(), 1_000_000);
    }

    function test_early_reclaim_and_direct_close() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 5_000_000);
        MockUSDC(USDC).mint(address(a), 1_000_000);
        address tab = _open(a, agentA, 500_000, 100_000);
        vm.expectRevert(PQRoot.NotExpired.selector);
        a.reclaim(tab);
        vm.prank(userA);
        vm.expectRevert(bytes("NotOwner"));
        MockTab(tab).close();
    }

    function test_open_over_exposure_reverts_clean() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 100);
        MockUSDC(USDC).mint(address(a), 1_000);
        bytes memory action = _actionOpen(agentA, 101, 10, uint64(block.timestamp + 1 days));
        uint64 soon = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sigFor(a, action, 0, soon);
        vm.expectRevert(PQRoot.ExposureExceeded.selector);
        a.execute(action, 0, soon, sig);
        assertEq(a.nextNonce(), 0);
        assertEq(a.openExposure(), 0);
        assertEq(MockUSDC(USDC).balanceOf(address(a)), 1_000);
    }

    function test_precompile_revert_bubbles_and_bad_sig_does_not_consume_nonce() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 100);
        bytes memory action = _actionTransfer(payee, 1);
        bytes memory boom = _sigFor(a, action, 0, uint64(block.timestamp + 1 hours));
        boom[32] = 0xff;
        vm.expectRevert(MockPQ.InvalidSignatureLength.selector);
        a.execute(action, 0, uint64(block.timestamp + 1 hours), boom);
        assertEq(a.nextNonce(), 0);
    }

    function test_predict_matches_create_and_same_salt_differs_by_wallet() public {
        bytes32 salt = bytes32(uint256(7));
        address predicted = factory.predictRoot(userA, salt);
        vm.prank(userA);
        address created = factory.createRoot(bytes32(uint256(1)), 1, salt);
        assertEq(predicted, created);
        assertTrue(factory.predictRoot(userB, salt) != predicted);
    }

    function test_implementation_cannot_be_initialized() public {
        address impl = factory.implementation();
        vm.expectRevert(PQRoot.AlreadyInitialized.selector);
        PQRoot(impl).initialize(bytes32(uint256(1)), 1, userA);
    }

    function test_registrar_is_not_an_admin() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 100);
        MockUSDC(USDC).mint(address(a), 50);
        bytes memory action = _actionTransfer(userA, 50);
        bytes memory badSig = _sig(a.pqVk(), bytes32(uint256(5)), false);
        vm.prank(userA);
        vm.expectRevert(PQRoot.InvalidSignature.selector);
        a.execute(action, 0, uint64(block.timestamp + 1 hours), badSig);
        assertEq(MockUSDC(USDC).balanceOf(address(a)), 50);
    }

    function test_signer_digest_matches_contract_for_every_action() public {
        PQRoot a = _root(userA, bytes32(uint256(1)), 5_000_000);
        uint64 deadline = 1_893_456_000;
        bytes[] memory actions = new bytes[](5);
        actions[0] = _actionOpen(agentA, 100_000, 50_000, deadline);
        actions[1] = _actionClose(address(0x4444444444444444444444444444444444444444));
        actions[2] = _actionTransfer(payee, 10);
        actions[3] = abi.encode(uint8(4), bytes32(uint256(9)));
        actions[4] = abi.encode(uint8(5), uint256(9_000_000));
        for (uint64 i = 0; i < actions.length; ++i) {
            assertEq(a.digestFor(actions[i], i, deadline), _rustDigest(address(a), i, deadline, actions[i]));
        }
    }

    function testFuzz_exposure_never_exceeds_max(uint96 cap1, uint96 cap2) public {
        uint256 c1 = bound(cap1, 1, 1_000_000);
        uint256 c2 = bound(cap2, 1, 1_000_000);
        uint256 maxE = c1 + c2;
        PQRoot a = _root(userA, bytes32(uint256(1)), maxE);
        MockUSDC(USDC).mint(address(a), maxE);
        _openRaw(a, agentA, c1, c1);
        if (c2 > 0) _openRaw(a, agentB, c2, c2);
        assertLe(a.openExposure(), a.maxOpenExposure());
        assertEq(a.openExposure(), c1 + c2);
    }

    function _root(address user, bytes32 vk, uint256 maxE) internal returns (PQRoot) {
        vm.prank(user);
        return PQRoot(factory.createRoot(vk, maxE, keccak256(abi.encode(user, vk))));
    }

    function _open(PQRoot root, address agent, uint256 cap, uint256 maxPerCall) internal returns (address tab) {
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory action = _actionOpen(agent, cap, maxPerCall, expiry);
        uint64 nonce = root.nextNonce();
        root.execute(action, nonce, uint64(block.timestamp + 1 hours), _sigFor(root, action, nonce, uint64(block.timestamp + 1 hours)));
        address[] memory payees = _one(payee);
        tab = IBarkeepFactory(BARKEEP).predictTab(address(root), agent, payees, maxPerCall, expiry, bytes32(uint256(nonce)));
    }

    function _openRaw(PQRoot root, address agent, uint256 cap, uint256 maxPerCall) internal {
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory action = _actionOpen(agent, cap, maxPerCall, expiry);
        uint64 nonce = root.nextNonce();
        root.execute(action, nonce, uint64(block.timestamp + 12 hours), _sigFor(root, action, nonce, uint64(block.timestamp + 12 hours)));
    }

    function _exec(PQRoot root, bytes memory action) internal {
        uint64 nonce = root.nextNonce();
        root.execute(action, nonce, uint64(block.timestamp + 1 hours), _sigFor(root, action, nonce, uint64(block.timestamp + 1 hours)));
    }

    function _actionOpen(address agent, uint256 cap, uint256 maxPerCall, uint64 expiry) internal view returns (bytes memory) {
        return abi.encode(uint8(1), agent, _one(payee), maxPerCall, expiry, cap);
    }

    function _actionClose(address tab) internal pure returns (bytes memory) {
        return abi.encode(uint8(2), tab);
    }

    function _actionTransfer(address to, uint256 amount) internal pure returns (bytes memory) {
        return abi.encode(uint8(3), to, amount);
    }

    function _one(address a) internal pure returns (address[] memory p) {
        p = new address[](1);
        p[0] = a;
    }

    function _sigFor(PQRoot root, bytes memory action, uint64 nonce, uint64 deadline) internal view returns (bytes memory) {
        return _sig(root.pqVk(), root.digestFor(action, nonce, deadline), true);
    }

    function _sigForKey(PQRoot root, bytes32 vk, bytes memory action, uint64 nonce, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sig(vk, root.digestFor(action, nonce, deadline), true);
    }

    /// Test signature only. Real SLH-DSA signatures are produced by signer/ and checked on Arc.
    function _rustDigest(address root, uint64 nonce, uint64 deadline, bytes memory action)
        internal
        returns (bytes32)
    {
        string[] memory cmd = new string[](12);
        cmd[0] = "cargo";
        cmd[1] = "run";
        cmd[2] = "--quiet";
        cmd[3] = "--manifest-path";
        cmd[4] = "signer/Cargo.toml";
        cmd[5] = "--";
        cmd[6] = "digest";
        cmd[7] = vm.toString(block.chainid);
        cmd[8] = vm.toString(root);
        cmd[9] = vm.toString(nonce);
        cmd[10] = vm.toString(deadline);
        cmd[11] = vm.toString(action);
        return vm.parseBytes32(vm.ffiString(cmd));
    }

    function _sig(bytes32 vk, bytes32 digest, bool valid) internal pure returns (bytes memory sig) {
        sig = new bytes(7856);
        for (uint256 i = 0; i < 32; ++i) {
            sig[i] = digest[i];
            sig[33 + i] = vk[i];
        }
        sig[32] = valid ? bytes1(0x01) : bytes1(0x00);
    }
}

interface IBarkeepFactory {
    function predictTab(address owner, address agent, address[] memory payees, uint256 maxPerCall, uint64 expiry, bytes32 salt)
        external
        view
        returns (address);
}
