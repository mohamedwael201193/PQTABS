// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {RootFactory} from "../contracts/RootFactory.sol";
import {PQRoot} from "../contracts/PQRoot.sol";

/// Local simulation of the factory deployment. Do not broadcast until phase 6.
contract Deploy is Script {
    function run() external returns (RootFactory factory) {
        vm.startBroadcast();
        factory = new RootFactory();
        vm.stopBroadcast();
        PQRoot impl = PQRoot(factory.implementation());
        require(impl.factory() == address(factory), "factory immutable");
        require(address(impl).code.length > 0, "implementation code");
    }
}
