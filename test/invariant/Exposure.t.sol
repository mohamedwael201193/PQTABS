// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {PQRoot} from "../../contracts/PQRoot.sol";
import {RootFactory} from "../../contracts/RootFactory.sol";
import {MockPQ, MockUSDC, MockBarkeep, MockTab} from "../mocks/Mocks.sol";

interface IBarkeepView {
    function predictTab(
        address owner,
        address agent,
        address[] memory payees,
        uint256 maxPerCall,
        uint64 expiry,
        bytes32 salt
    ) external view returns (address);
}

/// Stateful check: openExposure equals the sum of caps of currently open tabs.
contract ExposureHandler {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    PQRoot public immutable root;
    MockUSDC public immutable usdc;
    address public immutable agent = address(0xA11CE);
    address public immutable payee = address(0xBEEF);
    address internal constant BARKEEP = 0xccebC58DD1F5937B36D5f9F89f0754424f4D443c;

    address[] public opened;

    constructor(PQRoot root_, MockUSDC usdc_) {
        root = root_;
        usdc = usdc_;
    }

    function open(uint96 rawCap) external {
        uint256 cap = _bound(rawCap, 1, 50_000);
        if (root.openExposure() + cap > root.maxOpenExposure()) return;
        if (usdc.balanceOf(address(root)) < cap) usdc.mint(address(root), cap);
        uint64 expiry = uint64(block.timestamp + 2 days);
        address[] memory payees = _payees();
        bytes memory action = abi.encode(uint8(1), agent, payees, cap, expiry, cap);
        uint64 nonce = root.nextNonce();
        uint64 deadline = uint64(block.timestamp + 1 hours);
        try root.execute(action, nonce, deadline, _sig(action, nonce, deadline)) {
            opened.push(
                IBarkeepView(BARKEEP).predictTab(address(root), agent, payees, cap, expiry, bytes32(uint256(nonce)))
            );
        } catch {}
    }

    function close(uint256 index) external {
        address tab = _pick(index);
        if (tab == address(0)) return;
        (,, bool isOpen,) = root.tabs(tab);
        if (!isOpen) return;
        bytes memory action = abi.encode(uint8(2), tab);
        uint64 nonce = root.nextNonce();
        uint64 deadline = uint64(block.timestamp + 1 hours);
        try root.execute(action, nonce, deadline, _sig(action, nonce, deadline)) {} catch {}
    }

    function reclaim(uint256 index) external {
        address tab = _pick(index);
        if (tab == address(0)) return;
        try root.reclaim(tab) {} catch {}
    }

    function spend(uint256 index, uint96 rawAmt) external {
        address tab = _pick(index);
        if (tab == address(0)) return;
        uint256 bal = usdc.balanceOf(tab);
        if (bal == 0) return;
        uint256 amt = _bound(rawAmt, 1, bal);
        VM.prank(agent);
        try MockTab(tab).spend(payee, amt) {} catch {}
    }

    function donate(uint96 rawAmt) external {
        uint256 amt = _bound(rawAmt, 1, 1_000);
        usdc.mint(address(root), amt);
        address tab = _pick(rawAmt);
        if (tab != address(0)) usdc.mint(tab, amt);
    }

    function warp(uint32 delta) external {
        VM.warp(block.timestamp + _bound(delta, 0, 3 days));
    }

    function retry(uint256 index) external {
        address tab = _pick(index);
        if (tab == address(0)) return;
        try root.retrySweep(tab) {} catch {}
    }

    function sumOpenCaps() public view returns (uint256 sum) {
        for (uint256 i = 0; i < opened.length; ++i) {
            (uint256 cap,, bool isOpen,) = root.tabs(opened[i]);
            if (isOpen) sum += cap;
        }
    }

    function _pick(uint256 index) internal view returns (address) {
        if (opened.length == 0) return address(0);
        return opened[_bound(index, 0, opened.length - 1)];
    }

    function _payees() internal view returns (address[] memory payees) {
        payees = new address[](1);
        payees[0] = payee;
    }

    function _sig(bytes memory action, uint64 nonce, uint64 deadline) internal view returns (bytes memory sig) {
        bytes32 digest = root.digestFor(action, nonce, deadline);
        bytes32 vk = root.pqVk();
        sig = new bytes(7856);
        for (uint256 i = 0; i < 32; ++i) {
            sig[i] = digest[i];
            sig[33 + i] = vk[i];
        }
        sig[32] = 0x01;
    }

    function _bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        if (max <= min) return min;
        return min + (x % (max - min + 1));
    }
}

contract ExposureInvariantTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant PQ = 0x1800000000000000000000000000000000000004;
    address internal constant BARKEEP = 0xccebC58DD1F5937B36D5f9F89f0754424f4D443c;

    PQRoot internal rootA;
    PQRoot internal rootB;
    ExposureHandler internal handler;

    function setUp() public {
        vm.chainId(5042);
        vm.etch(USDC, address(new MockUSDC()).code);
        vm.etch(PQ, address(new MockPQ()).code);
        vm.etch(BARKEEP, address(new MockBarkeep()).code);
        RootFactory factory = new RootFactory();
        vm.prank(address(0xA));
        rootA = PQRoot(factory.createRoot(bytes32(uint256(1)), 1_000_000, bytes32("a")));
        vm.prank(address(0xB));
        rootB = PQRoot(factory.createRoot(bytes32(uint256(2)), 1_000_000, bytes32("b")));
        handler = new ExposureHandler(rootA, MockUSDC(USDC));
        targetContract(address(handler));
    }

    function invariant_open_exposure_equals_sum_of_open_caps() public view {
        assertEq(rootA.openExposure(), handler.sumOpenCaps());
        assertLe(rootA.openExposure(), rootA.maxOpenExposure());
        assertEq(rootB.openExposure(), 0);
        assertEq(rootB.nextNonce(), 0);
    }
}
