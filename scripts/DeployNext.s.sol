// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {RootFactoryNext} from "../contracts/RootFactoryNext.sol";
import {PQRootNext} from "../contracts/PQRootNext.sol";

/// Broadcasts the next factory. Existing roots stay on RootFactory.
contract DeployNext is Script {
    address internal constant VAULT = 0x8E357432CC12ff425c36432F312968aEb16112AF;

    function run() external returns (RootFactoryNext factory) {
        vm.startBroadcast();
        factory = new RootFactoryNext(VAULT);
        vm.stopBroadcast();
        PQRootNext impl = PQRootNext(factory.implementation());
        require(impl.factory() == address(factory), "factory immutable");
        require(impl.vault() == VAULT, "vault immutable");
        require(address(impl).code.length > 0, "implementation code");
    }
}
