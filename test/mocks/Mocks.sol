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
    address internal constant BARKEEP = 0xccebC58DD1F5937B36D5f9F89f0754424f4D443c;
    address public immutable owner;
    address public immutable builtAgent;
    uint64 public immutable expiry;
    uint256 internal immutable builtMax;
    address[] internal builtPayees;
    MockUSDC immutable usdc;
    bool public closed;

    constructor(
        address owner_,
        address agent_,
        uint64 expiry_,
        uint256 maxPerCall_,
        address[] memory payees_,
        address usdc_
    ) {
        owner = owner_;
        builtAgent = agent_;
        expiry = expiry_;
        builtMax = maxPerCall_;
        usdc = MockUSDC(usdc_);
        for (uint256 i = 0; i < payees_.length; ++i) builtPayees.push(payees_[i]);
    }

    /// A test can make these views disagree with the arguments PQRoot passed. The live root does not read them back.
    function agent() public view returns (address) {
        address lied = MockBarkeep(BARKEEP).liedAgent();
        return lied == address(0) ? builtAgent : lied;
    }

    function maxPerCall() public view returns (uint256) {
        uint256 lied = MockBarkeep(BARKEEP).liedMaxPerCall();
        return lied == 0 ? builtMax : lied;
    }

    function payees() public view returns (address[] memory) {
        address lied = MockBarkeep(BARKEEP).liedPayee();
        if (lied == address(0)) return builtPayees;
        address[] memory one = new address[](1);
        one[0] = lied;
        return one;
    }

    function spend(address to, uint256 amount) external {
        require(msg.sender == agent(), "NotAgent");
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

contract MockVault {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    mapping(address => uint256) public sharesOf;
    uint256 public maxIn = type(uint256).max;

    function asset() external pure returns (address) {
        return USDC_ADDR;
    }

    function maxDeposit(address) external view returns (uint256) {
        return maxIn;
    }

    function setMax(uint256 next) external {
        maxIn = next;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0 || assets > maxIn) revert();
        require(MockUSDC(USDC_ADDR).transferFrom(msg.sender, address(this), assets), "pull");
        shares = assets;
        sharesOf[receiver] += shares;
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        if (assets == 0 || sharesOf[owner] < assets) revert();
        sharesOf[owner] -= assets;
        require(MockUSDC(USDC_ADDR).transfer(receiver, assets), "push");
        shares = assets;
    }
}

contract MockBarkeep {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    bytes public attackCalldata;
    bytes public attackRevert;
    address public liedAgent;
    uint256 public liedMaxPerCall;
    address public liedPayee;

    function setAttack(bytes calldata data) external {
        attackCalldata = data;
    }

    function setLie(address agent_, uint256 max_, address payee_) external {
        liedAgent = agent_;
        liedMaxPerCall = max_;
        liedPayee = payee_;
    }

    function clearLie() external {
        liedAgent = address(0);
        liedMaxPerCall = 0;
        liedPayee = address(0);
    }

    function IMPLEMENTATION() external pure returns (address) {
        return 0x89B63f2E43dea9014750925C01996D34856B01D2;
    }

    function USDC() external pure returns (address) {
        return USDC_ADDR;
    }

    function predictTab(
        address owner,
        address agent,
        address[] memory payees,
        uint256 maxPerCall,
        uint64 expiry,
        bytes32 salt
    ) external view returns (address) {
        return _addr(owner, agent, payees, maxPerCall, expiry, salt);
    }

    function openTab(address agent, address[] memory payees, uint256 maxPerCall, uint64 expiry, uint256 cap, bytes32 salt)
        external
        returns (address tab)
    {
        require(agent != address(0) && cap > 0 && maxPerCall > 0 && maxPerCall <= cap, "bad");
        require(expiry > block.timestamp, "expiry");
        if (attackCalldata.length > 0) {
            (bool ok, bytes memory ret) = msg.sender.call(attackCalldata);
            require(!ok, "reenter succeeded");
            attackRevert = ret;
        }
        tab = _addr(msg.sender, agent, payees, maxPerCall, expiry, salt);
        if (tab.code.length == 0) {
            MockTab created = new MockTab{salt: salt}(msg.sender, agent, expiry, maxPerCall, payees, USDC_ADDR);
            require(address(created) == tab, "addr");
        }
        require(MockUSDC(USDC_ADDR).transferFrom(msg.sender, tab, cap), "fund");
    }

    function _addr(
        address owner,
        address agent,
        address[] memory payees,
        uint256 maxPerCall,
        uint64 expiry,
        bytes32 salt
    ) internal view returns (address) {
        bytes32 initHash = keccak256(
            abi.encodePacked(
                type(MockTab).creationCode, abi.encode(owner, agent, expiry, maxPerCall, payees, USDC_ADDR)
            )
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash)))));
    }
}
