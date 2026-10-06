// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {PQRoot} from "./PQRoot.sol";

/// Deploys one PQRoot clone per user security domain. No owner, no upgrade, no treasury.
contract RootFactory {
    address public immutable implementation;

    mapping(address => address[]) private _roots;
    mapping(address => address) public registrarOf;

    event RootCreated(address indexed registrar, address indexed root, bytes32 vk, uint256 maxOpenExposure);

    error Zero();
    error CreateFailed();

    constructor() {
        implementation = address(new PQRoot(address(this)));
    }

    function createRoot(bytes32 vk, uint256 maxOpenExposure, bytes32 userSalt) external returns (address root) {
        if (vk == bytes32(0) || maxOpenExposure == 0) revert Zero();
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        root = _clone(salt);
        PQRoot(root).initialize(vk, maxOpenExposure, msg.sender);
        _roots[msg.sender].push(root);
        registrarOf[root] = msg.sender;
        emit RootCreated(msg.sender, root, vk, maxOpenExposure);
    }

    function predictRoot(address registrar, bytes32 userSalt) public view returns (address) {
        return _predict(keccak256(abi.encode(registrar, userSalt)));
    }

    function rootCount(address registrar) external view returns (uint256) {
        return _roots[registrar].length;
    }

    function rootAt(address registrar, uint256 index) external view returns (address) {
        return _roots[registrar][index];
    }

    function _clone(bytes32 salt) internal returns (address instance) {
        bytes memory code = _initCode();
        assembly {
            instance := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (instance == address(0)) revert CreateFailed();
    }

    function _predict(bytes32 salt) internal view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(_initCode())))))
        );
    }

    function _initCode() internal view returns (bytes memory) {
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
    }
}
