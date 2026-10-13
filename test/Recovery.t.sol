// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {PQRootNext} from "../contracts/PQRootNext.sol";
import {RootFactoryNext} from "../contracts/RootFactoryNext.sol";
import {MockPQ, MockUSDC, MockBarkeep, MockTab, MockVault} from "./mocks/Mocks.sol";

/// Recovery, tab read-back, and the pinned vault.
contract RecoveryTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant PQ = 0x1800000000000000000000000000000000000004;
    address internal constant BARKEEP = 0xccebC58DD1F5937B36D5f9F89f0754424f4D443c;

    RootFactoryNext internal factory;
    address internal user = address(0xA11CE);
    address internal agent = address(0xA6E7A);
    address internal payee = address(0xBEEF);
    bytes32 internal spending = bytes32(uint256(1));
    bytes32 internal backup = bytes32(uint256(2));
    bytes32 internal nextKey = bytes32(uint256(9));

    function setUp() public {
        vm.chainId(5042);
        vm.etch(USDC, type(MockUSDC).runtimeCode);
        vm.etch(PQ, type(MockPQ).runtimeCode);
        vm.etch(BARKEEP, type(MockBarkeep).runtimeCode);
        factory = new RootFactoryNext(address(new MockVault()));
    }

    function test_spending_key_recovery_waits_and_then_replaces_the_key() public {
        PQRootNext root = _root(bytes32(0));
        _request(root, nextKey);
        assertEq(root.pendingVk(), nextKey);
        MockUSDC(USDC).mint(address(root), 10);
        bytes memory paused = abi.encode(uint8(3), payee, uint256(1));
        uint64 nonce = root.nextNonce();
        bytes memory pausedSig = _sig(root.pqVk(), root.digestFor(paused, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.TransfersPaused.selector);
        root.execute(paused, nonce, _soon(), pausedSig);
        vm.expectRevert(PQRootNext.RecoveryNotReady.selector);
        root.executeRecovery();
        vm.warp(block.timestamp + 7 days);
        root.executeRecovery();
        assertEq(root.pqVk(), nextKey);
        assertEq(root.pendingVk(), bytes32(0));
        _transferAs(root, nextKey, 1);
        assertEq(MockUSDC(USDC).balanceOf(payee), 1);
    }

    function test_owner_can_cancel_a_cooling_off_when_no_backup_exists() public {
        PQRootNext root = _root(bytes32(0));
        _request(root, nextKey);
        bytes memory cancel = abi.encode(uint8(7));
        _exec(root, cancel);
        assertEq(root.pendingVk(), bytes32(0));
        MockUSDC(USDC).mint(address(root), 5);
        _transfer(root, 1);
        assertEq(MockUSDC(USDC).balanceOf(payee), 1);
    }

    function test_backup_cancels_a_stolen_spending_key_request() public {
        PQRootNext root = _root(backup);
        _request(root, nextKey);
        bytes memory cancel = abi.encode(uint8(7));
        uint64 nonce = root.nextNonce();
        bytes memory cancelSig = _sig(root.pqVk(), root.digestFor(cancel, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.CancelNotAllowed.selector);
        root.execute(cancel, nonce, _soon(), cancelSig);
        root.cancelByBackup(0, _soon(), _backupSig(root, bytes32("backup-cancel"), 0, _soon(), nextKey));
        assertEq(root.pqVk(), spending);
        assertEq(root.pendingVk(), bytes32(0));
    }

    function test_lost_spending_key_recovers_through_the_backup_after_the_delay() public {
        PQRootNext root = _root(backup);
        root.requestByBackup(nextKey, 0, _soon(), _backupSig(root, bytes32("backup-request"), 0, _soon(), nextKey));
        bytes memory paused = abi.encode(uint8(3), payee, uint256(1));
        uint64 nonce = root.nextNonce();
        bytes memory pausedSig = _sig(root.pqVk(), root.digestFor(paused, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.TransfersPaused.selector);
        root.execute(paused, nonce, _soon(), pausedSig);
        vm.warp(block.timestamp + 7 days);
        root.executeRecovery();
        assertEq(root.pqVk(), nextKey);
        MockUSDC(USDC).mint(address(root), 4);
        _transferAs(root, nextKey, 1);
        assertEq(MockUSDC(USDC).balanceOf(payee), 1);
    }

    function test_spending_key_cancels_a_backup_request() public {
        PQRootNext root = _root(backup);
        root.requestByBackup(nextKey, 0, _soon(), _backupSig(root, bytes32("backup-request"), 0, _soon(), nextKey));
        _exec(root, abi.encode(uint8(7)));
        assertEq(root.pendingVk(), bytes32(0));
        vm.expectRevert(PQRootNext.RecoveryNotPending.selector);
        root.executeRecovery();
    }

    function test_replayed_backup_request_is_rejected() public {
        PQRootNext root = _root(backup);
        bytes memory sig = _backupSig(root, bytes32("backup-request"), 0, _soon(), nextKey);
        root.requestByBackup(nextKey, 0, _soon(), sig);
        vm.expectRevert(PQRootNext.BadNonce.selector);
        root.requestByBackup(nextKey, 0, _soon(), sig);
    }

    function test_backup_request_does_not_work_on_another_root() public {
        PQRootNext a = _root(backup);
        vm.prank(address(0xB0B));
        PQRootNext b = PQRootNext(factory.createRoot(spending, backup, 100, bytes32(uint256(8))));
        bytes memory sig = _backupSig(a, bytes32("backup-request"), 0, _soon(), nextKey);
        vm.expectRevert(PQRootNext.InvalidSignature.selector);
        b.requestByBackup(nextKey, 0, _soon(), sig);
    }

    function test_immediate_rotate_is_disabled() public {
        PQRootNext root = _root(backup);
        bytes memory rotate = abi.encode(uint8(4), nextKey);
        uint64 nonce = root.nextNonce();
        bytes memory rotateSig = _sig(root.pqVk(), root.digestFor(rotate, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.RotateDisabled.selector);
        root.execute(rotate, nonce, _soon(), rotateSig);
        assertEq(root.pqVk(), spending);
    }

    function test_open_rejects_a_tab_whose_agent_does_not_match() public {
        PQRootNext root = _root(bytes32(0));
        MockUSDC(USDC).mint(address(root), 1_000_000);
        MockBarkeep(BARKEEP).setLie(address(0x1111), 0, address(0));
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory action = abi.encode(uint8(1), agent, _one(payee), uint256(50_000), expiry, uint256(100_000));
        uint64 nonce = root.nextNonce();
        bytes memory sig = _sig(root.pqVk(), root.digestFor(action, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.UnexpectedTab.selector);
        root.execute(action, nonce, _soon(), sig);
        assertEq(root.nextNonce(), 0);
        assertEq(root.openExposure(), 0);
        assertEq(MockUSDC(USDC).balanceOf(address(root)), 1_000_000);
    }

    function test_open_rejects_an_expiry_past_ninety_days() public {
        PQRootNext root = _root(bytes32(0));
        MockUSDC(USDC).mint(address(root), 1_000_000);
        uint64 expiry = uint64(block.timestamp + 91 days);
        bytes memory action = abi.encode(uint8(1), agent, _one(payee), uint256(50_000), expiry, uint256(100_000));
        uint64 nonce = root.nextNonce();
        bytes memory sig = _sig(root.pqVk(), root.digestFor(action, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.ExpiryTooFar.selector);
        root.execute(action, nonce, _soon(), sig);
        assertEq(root.openExposure(), 0);
    }

    function test_reclaim_still_works_while_recovery_is_pending() public {
        PQRootNext root = _root(bytes32(0));
        MockUSDC(USDC).mint(address(root), 1_000_000);
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory action = abi.encode(uint8(1), agent, _one(payee), uint256(50_000), expiry, uint256(100_000));
        _exec(root, action);
        address tab = MockBarkeep(BARKEEP).predictTab(address(root), agent, _one(payee), 50_000, expiry, bytes32(uint256(0)));
        assertEq(MockTab(tab).owner(), address(root));
        _request(root, nextKey);
        vm.warp(expiry + 1);
        root.reclaim(tab);
        assertEq(root.openExposure(), 0);
        assertEq(MockUSDC(USDC).balanceOf(tab), 0);
    }

    function test_deposit_and_withdraw_round_trip_idle_usdc() public {
        PQRootNext root = _root(bytes32(0));
        MockUSDC(USDC).mint(address(root), 1_000_000);
        _exec(root, abi.encode(uint8(8), uint256(250_000)));
        assertEq(MockUSDC(USDC).balanceOf(address(root)), 750_000);
        assertEq(MockVault(factory.vault()).sharesOf(address(root)), 250_000);
        _exec(root, abi.encode(uint8(9), uint256(100_000)));
        assertEq(MockUSDC(USDC).balanceOf(address(root)), 850_000);
        assertEq(MockVault(factory.vault()).sharesOf(address(root)), 150_000);
    }

    function test_deposit_rejects_more_than_the_vault_will_take() public {
        PQRootNext root = _root(bytes32(0));
        MockUSDC(USDC).mint(address(root), 1_000_000);
        MockVault(factory.vault()).setMax(10);
        bytes memory action = abi.encode(uint8(8), uint256(11));
        uint64 nonce = root.nextNonce();
        bytes memory sig = _sig(root.pqVk(), root.digestFor(action, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.VaultRejected.selector);
        root.execute(action, nonce, _soon(), sig);
        assertEq(MockUSDC(USDC).balanceOf(address(root)), 1_000_000);
    }

    function test_yield_pauses_while_recovery_is_pending() public {
        PQRootNext root = _root(bytes32(0));
        MockUSDC(USDC).mint(address(root), 1_000_000);
        _exec(root, abi.encode(uint8(8), uint256(100)));
        _request(root, nextKey);
        bytes memory action = abi.encode(uint8(9), uint256(100));
        uint64 nonce = root.nextNonce();
        bytes memory sig = _sig(root.pqVk(), root.digestFor(action, nonce, _soon()), true);
        vm.expectRevert(PQRootNext.TransfersPaused.selector);
        root.execute(action, nonce, _soon(), sig);
        assertEq(MockVault(factory.vault()).sharesOf(address(root)), 100);
    }

    function test_both_keys_lost_cannot_start_recovery() public {
        PQRootNext root = _root(backup);
        bytes memory sig = _sig(bytes32(uint256(99)), root.digestFor(abi.encode(uint8(6), nextKey), 0, _soon()), true);
        vm.expectRevert(PQRootNext.InvalidSignature.selector);
        root.execute(abi.encode(uint8(6), nextKey), 0, _soon(), sig);
        assertEq(root.pendingVk(), bytes32(0));
    }

    function _root(bytes32 recoveryKey) internal returns (PQRootNext root) {
        vm.prank(user);
        root = PQRootNext(factory.createRoot(spending, recoveryKey, 5_000_000, keccak256(abi.encode(user, recoveryKey))));
    }

    function _request(PQRootNext root, bytes32 newVk) internal {
        _exec(root, abi.encode(uint8(6), newVk));
    }

    function _transfer(PQRootNext root, uint256 amount) internal {
        _transferAs(root, root.pqVk(), amount);
    }

    function _transferAs(PQRootNext root, bytes32 vk, uint256 amount) internal {
        bytes memory action = abi.encode(uint8(3), payee, amount);
        uint64 nonce = root.nextNonce();
        root.execute(action, nonce, _soon(), _sig(vk, root.digestFor(action, nonce, _soon()), true));
    }

    function _exec(PQRootNext root, bytes memory action) internal {
        uint64 nonce = root.nextNonce();
        root.execute(action, nonce, _soon(), _sig(root.pqVk(), root.digestFor(action, nonce, _soon()), true));
    }

    function _backupSig(PQRootNext root, bytes32 tag, uint64 nonce, uint64 deadline, bytes32 newVk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encode(keccak256("PQTABS_RECOVERY_V1"), block.chainid, address(root), tag, nonce, deadline, newVk)
        );
        return _sig(root.recoveryVk(), digest, true);
    }

    function _soon() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    function _one(address a) internal pure returns (address[] memory p) {
        p = new address[](1);
        p[0] = a;
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
