// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

/// One user's post-quantum treasury. Cloned by RootFactory. The registrar
/// wallet is an index, not an admin. Only the SLH-DSA key moves funds or
/// opens tabs.
contract PQRoot {
    uint256 internal constant SIG_LEN = 7856;
    uint256 internal constant MAX_PAYEES = 20;
    uint64 internal constant MAX_DEADLINE = 7 days;
    bytes32 internal constant DOMAIN = keccak256("PQTABS_V2");

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    address internal constant PQ_ADDR = 0x1800000000000000000000000000000000000004;
    address internal constant BARKEEP_ADDR = 0xccebC58DD1F5937B36D5f9F89f0754424f4D443c;
    address internal constant TAB_IMPL = 0x89B63f2E43dea9014750925C01996D34856B01D2;

    struct TabState {
        uint256 cap;
        uint64 expiry;
        bool open;
        bool needsSweep;
    }

    /// Shared by every clone. Set once, when the implementation is constructed.
    address public immutable factory;

    bytes32 public pqVk;
    address public registrar;
    uint64 public nextNonce;
    uint256 public maxOpenExposure;
    uint256 public openExposure;
    mapping(address => TabState) public tabs;

    bool private initialized;
    uint256 private locked;

    event RootExecuted(uint64 indexed nonce, uint8 kind, bytes32 actionHash, address indexed submitter);
    event TabOpened(address indexed tab, address indexed agent, uint256 cap, uint64 expiry, uint256 openExposure);
    event TabClosed(address indexed tab, uint256 capReleased, bool swept, bool permissionless);
    event SweepRetried(address indexed tab, bool swept);
    event TreasuryTransfer(address indexed to, uint256 amount);
    event KeyRotated(bytes32 vk);
    event ExposureSet(uint256 maxOpenExposure);

    error NotInitialized();
    error AlreadyInitialized();
    error NotFactory();
    error FactoryMismatch();
    error InvalidSignature();
    error BadSignatureLength();
    error BadNonce();
    error Expired();
    error DeadlineTooFar();
    error ExposureExceeded();
    error NotExpired();
    error AlreadyClosed();
    error ZeroAddress();
    error BadPayeeCount();
    error CapZero();
    error AmountZero();
    error MaxPerCallAboveCap();
    error ExpiryNotFuture();
    error TransferFailed();
    error ApproveFailed();
    error UnexpectedTab();
    error TabNotOwned();
    error ActionUnknown();
    error SweepNotNeeded();
    error BadKey();
    error Reentered();

    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        initialized = true;
        locked = 1;
    }

    function initialize(bytes32 vk, uint256 maxExposure, address registrar_) external {
        if (initialized) revert AlreadyInitialized();
        if (msg.sender != factory) revert NotFactory();
        if (vk == bytes32(0) || registrar_ == address(0) || maxExposure == 0) revert ZeroAddress();
        if (IBarkeepFactory(BARKEEP_ADDR).IMPLEMENTATION() != TAB_IMPL) revert FactoryMismatch();
        if (IBarkeepFactory(BARKEEP_ADDR).USDC() != USDC_ADDR) revert FactoryMismatch();
        initialized = true;
        locked = 1;
        pqVk = vk;
        maxOpenExposure = maxExposure;
        registrar = registrar_;
        emit ExposureSet(maxExposure);
    }

    function digestFor(bytes calldata action, uint64 nonce, uint64 deadline) public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN, block.chainid, address(this), nonce, deadline, keccak256(action))
        );
    }

    function execute(bytes calldata action, uint64 nonce, uint64 deadline, bytes calldata sig) external nonReentrant {
        _requireLive();
        if (block.timestamp > deadline) revert Expired();
        if (deadline > block.timestamp + MAX_DEADLINE) revert DeadlineTooFar();
        if (nonce != nextNonce) revert BadNonce();
        if (sig.length != SIG_LEN) revert BadSignatureLength();
        if (action.length < 32) revert ActionUnknown();

        bytes32 digest = digestFor(action, nonce, deadline);
        if (!_verify(digest, sig)) revert InvalidSignature();

        nextNonce = nonce + 1;
        uint8 kind = uint8(uint256(bytes32(action[0:32])));
        if (kind == 1) _open(action, nonce);
        else if (kind == 2) _close(_tab(action), false);
        else if (kind == 3) _transfer(action);
        else if (kind == 4) _rotate(action);
        else if (kind == 5) _setExposure(action);
        else revert ActionUnknown();

        emit RootExecuted(nonce, kind, keccak256(action), msg.sender);
    }

    /// After expiry, anyone may send the tab's remaining USDC back to this root.
    function reclaim(address tab) external nonReentrant {
        _requireLive();
        if (block.timestamp <= tabs[tab].expiry) revert NotExpired();
        _close(tab, true);
    }

    /// Barkeep marks a tab closed even when the USDC transfer fails. Retry does not change exposure.
    function retrySweep(address tab) external nonReentrant {
        _requireLive();
        TabState storage t = tabs[tab];
        if (t.open || !t.needsSweep) revert SweepNotNeeded();
        if (ITab(tab).owner() != address(this)) revert TabNotOwned();
        if (IUSDC(USDC_ADDR).balanceOf(tab) > 0) ITab(tab).close();
        bool swept = IUSDC(USDC_ADDR).balanceOf(tab) == 0;
        if (swept) t.needsSweep = false;
        emit SweepRetried(tab, swept);
    }

    function _open(bytes calldata action, uint64 nonce) internal {
        (, address agent, address[] memory payees, uint256 maxPerCall, uint64 expiry, uint256 cap) =
            abi.decode(action, (uint8, address, address[], uint256, uint64, uint256));
        if (agent == address(0)) revert ZeroAddress();
        uint256 n = payees.length;
        if (n == 0 || n > MAX_PAYEES) revert BadPayeeCount();
        for (uint256 i = 0; i < n; ++i) {
            if (payees[i] == address(0)) revert ZeroAddress();
        }
        if (cap == 0) revert CapZero();
        if (maxPerCall == 0 || maxPerCall > cap) revert MaxPerCallAboveCap();
        if (expiry <= block.timestamp) revert ExpiryNotFuture();
        if (cap > maxOpenExposure - openExposure) revert ExposureExceeded();

        bytes32 salt = bytes32(uint256(nonce));
        address predicted =
            IBarkeepFactory(BARKEEP_ADDR).predictTab(address(this), agent, payees, maxPerCall, expiry, salt);
        if (tabs[predicted].open || tabs[predicted].cap != 0) revert UnexpectedTab();

        // Reserve the cap before the factory call. A revert rolls this back.
        // The lock below stops the factory from reentering execute, reclaim, or retrySweep.
        openExposure += cap;
        tabs[predicted] = TabState(cap, expiry, true, false);

        _approveExact(cap);
        address tab = IBarkeepFactory(BARKEEP_ADDR).openTab(agent, payees, maxPerCall, expiry, cap, salt);
        if (tab != predicted || ITab(tab).owner() != address(this) || ITab(tab).expiry() != expiry) {
            revert UnexpectedTab();
        }
        _approveExact(0);
        emit TabOpened(tab, agent, cap, expiry, openExposure);
    }

    function _close(address tab, bool permissionless) internal {
        TabState storage t = tabs[tab];
        if (!t.open) revert AlreadyClosed();
        if (ITab(tab).owner() != address(this) || ITab(tab).expiry() != t.expiry) revert TabNotOwned();
        uint256 cap = t.cap;
        t.open = false;
        openExposure -= cap;
        // Assume the sweep failed until the balance proves otherwise. USDC has no transfer fee;
        // a non-zero balance means Barkeep closed the tab without moving the funds, so retrySweep
        // must be able to call close() again. This equality is the completion check, not a price.
        t.needsSweep = true;
        ITab(tab).close();
        bool swept = IUSDC(USDC_ADDR).balanceOf(tab) == 0;
        if (swept) t.needsSweep = false;
        emit TabClosed(tab, cap, swept, permissionless);
    }

    function _transfer(bytes calldata action) internal {
        (, address to, uint256 amount) = abi.decode(action, (uint8, address, uint256));
        if (to == address(0) || to == address(this) || to == BARKEEP_ADDR || to == factory) revert ZeroAddress();
        if (amount == 0) revert AmountZero();
        if (!IUSDC(USDC_ADDR).transfer(to, amount)) revert TransferFailed();
        emit TreasuryTransfer(to, amount);
    }

    function _rotate(bytes calldata action) internal {
        (, bytes32 newVk) = abi.decode(action, (uint8, bytes32));
        if (newVk == bytes32(0) || newVk == pqVk) revert BadKey();
        pqVk = newVk;
        emit KeyRotated(newVk);
    }

    function _setExposure(bytes calldata action) internal {
        (, uint256 newMax) = abi.decode(action, (uint8, uint256));
        if (newMax == 0) revert CapZero();
        if (newMax < openExposure) revert ExposureExceeded();
        maxOpenExposure = newMax;
        emit ExposureSet(newMax);
    }

    function _approveExact(uint256 amount) internal {
        if (!IUSDC(USDC_ADDR).approve(BARKEEP_ADDR, amount)) revert ApproveFailed();
    }

    function _tab(bytes calldata action) internal pure returns (address tab) {
        (, tab) = abi.decode(action, (uint8, address));
    }

    function _verify(bytes32 digest, bytes calldata sig) internal view returns (bool) {
        (bool ok, bytes memory ret) = PQ_ADDR.staticcall(
            abi.encodeCall(IPQ.verifySlhDsaSha2128s, (abi.encodePacked(pqVk), abi.encodePacked(digest), sig))
        );
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return abi.decode(ret, (bool));
    }

    function _requireLive() internal view {
        if (!initialized || pqVk == bytes32(0)) revert NotInitialized();
    }

    /// `locked` is 0 on a fresh clone, 1 when idle, and 2 while a protected call is running.
    /// Every state-changing entry except `initialize` uses this. `initialize` can only be called
    /// by the factory, and only before `locked` becomes 1.
    modifier nonReentrant() {
        if (locked != 1) revert Reentered();
        locked = 2;
        _;
        locked = 1;
    }
}

interface IPQ {
    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata message, bytes calldata sig)
        external
        view
        returns (bool);
}

interface IUSDC {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IBarkeepFactory {
    function IMPLEMENTATION() external view returns (address);
    function USDC() external view returns (address);
    function openTab(
        address agent,
        address[] memory payees,
        uint256 maxPerCall,
        uint64 expiry,
        uint256 cap,
        bytes32 salt
    ) external returns (address tab);
    function predictTab(
        address owner,
        address agent,
        address[] memory payees,
        uint256 maxPerCall,
        uint64 expiry,
        bytes32 salt
    ) external view returns (address);
}

interface ITab {
    function owner() external view returns (address);
    function expiry() external view returns (uint64);
    function close() external;
}
