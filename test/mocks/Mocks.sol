// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

/// Etched over the Arc addresses inside Forge. Not deployed on mainnet.
/// The verifier accepts a test signature whose first 32 bytes are the digest
/// and whose 33rd byte is 0x01. Byte 0xFF makes it revert, so the root's
/// revert-bubbling path can be tested. This is not SLH-DSA.
contract MockPQ {
    error InvalidSignatureLength();

    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata message, bytes calldata sig)
        external
        pure
        returns (bool)
    {
        if (vk.length != 32 || message.length != 32 || sig.length != 7856) revert InvalidSignatureLength();
        if (sig[32] == 0xff) revert InvalidSignatureLength();
        if (sig[32] != 0x01) return false;
        if (keccak256(sig[:32]) != keccak256(message)) return false;
        return keccak256(sig[33:65]) == keccak256(vk);
    }
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFailTransfers(bool v) external {
        failTransfers = v;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (failTransfers) return false;
        return _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < value) return false;
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        return _move(from, to, value);
    }

    function _move(address from, address to, uint256 value) internal returns (bool) {
        if (balanceOf[from] < value) return false;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }
}

contract MockTab {
    address public immutable owner;
    address public immutable agent;
    uint64 public immutable expiry;
    MockUSDC immutable usdc;
    bool public closed;

    constructor(address owner_, address agent_, uint64 expiry_, address usdc_) {
        owner = owner_;
        agent = agent_;
        expiry = expiry_;
        usdc = MockUSDC(usdc_);
    }

    function spend(address to, uint256 amount) external {
        require(msg.sender == agent, "NotAgent");
        require(!closed, "closed");
        require(usdc.transfer(to, amount), "spend");
    }

    function close() external {
        require(msg.sender == owner, "NotOwner");
        closed = true;
        uint256 bal = usdc.balanceOf(address(this));
        if (bal > 0) {
            try usdc.transfer(owner, bal) {} catch {}
        }
    }
}

contract MockBarkeep {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    function IMPLEMENTATION() external pure returns (address) {
        return 0x89B63f2E43dea9014750925C01996D34856B01D2;
    }

    function USDC() external pure returns (address) {
        return USDC_ADDR;
    }

    function predictTab(address owner, address agent, address[] memory, uint256, uint64 expiry, bytes32 salt)
        external
        view
        returns (address)
    {
        return _addr(owner, agent, expiry, salt);
    }

    function openTab(address agent, address[] memory, uint256 maxPerCall, uint64 expiry, uint256 cap, bytes32 salt)
        external
        returns (address tab)
    {
        require(agent != address(0) && cap > 0 && maxPerCall > 0 && maxPerCall <= cap, "bad");
        require(expiry > block.timestamp, "expiry");
        tab = _addr(msg.sender, agent, expiry, salt);
        if (tab.code.length == 0) {
            MockTab created = new MockTab{salt: salt}(msg.sender, agent, expiry, USDC_ADDR);
            require(address(created) == tab, "addr");
        }
        require(MockUSDC(USDC_ADDR).transferFrom(msg.sender, tab, cap), "fund");
    }

    function _addr(address owner, address agent, uint64 expiry, bytes32 salt) internal view returns (address) {
        bytes32 initHash = keccak256(
            abi.encodePacked(type(MockTab).creationCode, abi.encode(owner, agent, expiry, USDC_ADDR))
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash)))));
    }
}
