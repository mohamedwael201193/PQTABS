# Phase 5.5 — pre-mainnet security gate

Run on 2026-10-06 after the exposure accounting change. No mainnet broadcast is part of this phase. The local deployment simulation address is not a deployed contract.

## Commands

| Command | Result |
|---|---|
| `forge test --fuzz-runs 4096` | 17 tests passed. Fuzz test ran 4,096 times. Invariant: 64 runs, 2,048 calls, 0 handler reverts. |
| `forge snapshot --fuzz-runs 1024` | Wrote `.gas-snapshot`. 17 tests passed. |
| `forge build --sizes` | `PQRoot` runtime 7,321 bytes. `RootFactory` runtime 1,384 bytes. Factory init code 9,024 bytes. |
| `forge script scripts/Deploy.s.sol` | Simulated only. Gas 2,082,284. No `--broadcast`. |
| Slither 0.11.6 | 59 detectors, 6 contracts, 4 results. See below. |

Compiler metadata from `forge inspect PQRoot metadata`: solc `0.8.30+commit.73712a01`, optimizer on, 200 runs, `viaIR`, `bytecodeHash: none`, EVM `prague`.

## Accepted Slither results

`incorrect-equality` on `balanceOf(tab) == 0` in `_close` and `retrySweep`. This is the sweep-completion check. Arc USDC does not take a transfer fee. A non-zero balance leaves `needsSweep` set, so a failed sweep cannot be reported as finished. `test_failed_sweep_does_not_double_subtract` covers that path.

`reentrancy-no-eth` on clearing `needsSweep` after `tab.close()`. Exposure is reduced and the tab is marked closed before `close()`. The flag starts as true and becomes false only when the balance is zero. `execute`, `reclaim`, and `retrySweep` all use the `locked` guard. `test_factory_callback_cannot_execute_a_second_action` makes the mock factory call `execute` during `openTab` with a valid signature for the next nonce. The call reverts with `Reentered`. The open still completes once, the nonce advances once, and the payee receives nothing.

Foundry's linter repeats the same reentrancy shape because it treats the lock reset at the end of the modifier as the write it cares about. The modifier sets `locked = 2` before the body. Timestamp comparisons are the deadline and expiry rules, not a price oracle.

## Surface

`PQRoot` external functions: `initialize`, `digestFor`, `execute`, `reclaim`, `retrySweep`, and the view getters `factory`, `pqVk`, `registrar`, `nextNonce`, `maxOpenExposure`, `openExposure`, `tabs`.

`RootFactory` external functions: `createRoot`, `predictRoot`, `implementation`, `registrarOf`, `rootAt`, `rootCount`.

There is no `owner`, proxy, upgrade, `delegatecall`, arbitrary `to`/`data` call, `selfdestruct`, or `receive`. The only assembly block copies a revert from the precompile. `initialize` is callable only by the factory address stored in the implementation. The implementation constructor sets `initialized` and cannot be initialized again.

## Storage

| Slot | Variable |
|---|---|
| 0 | `pqVk` |
| 1 | `registrar` (20 bytes) and `nextNonce` (8 bytes) |
| 2 | `maxOpenExposure` |
| 3 | `openExposure` |
| 4 | `tabs` |
| 5 | `initialized` |
| 6 | `locked` |

`factory` is an immutable in the implementation bytecode, shared by every clone.

## Other reviews

- External calls are USDC (`approve`, `transfer`, `balanceOf`), the pinned Barkeep factory (`IMPLEMENTATION`, `USDC`, `predictTab`, `openTab`), the tab returned by that factory (`owner`, `expiry`, `close`), and a `staticcall` to the PQ precompile.
- Allowance is set to the exact cap and then to zero. A revert rolls both back.
- Solidity 0.8.30 checks overflow. The exposure subtraction is guarded by `cap > maxOpenExposure - openExposure`.
- Nonce is equality-checked, incremented, and rolled back if the action reverts. A bad signature reverts before the increment. The same successful nonce cannot be reused.
- The digest binds `PQTABS_V2`, chain id, the root address, nonce, deadline, and the action hash. The FFI test checks all five action kinds.
- A registrar cannot move funds. A signature for root A fails on root B.
- Payee lists are capped at 20. The signature length is fixed at 7,856 bytes. The deadline window is at most 7 days.
- Barkeep and the tab implementation appear as `PUSH20` in the runtime bytecode. The USDC and precompile addresses are sparse and are materialized with shifts; the Forge tests etch those exact addresses, and the phase 2 `eth_call` used the precompile address directly.

CI later ran Slither on the whole Foundry tree, including forge-std, and `--fail-high` exited 255 because high findings in that tree were counted. The command is now `slither . --filter-paths "lib/|test/|scripts/" --exclude incorrect-equality,reentrancy-no-eth --fail-high`. On the production contracts that leaves `reentrancy-benign` and `reentrancy-events` on `createRoot`: `initialize` is called on the clone this factory just deployed, and the registry write happens after. That clone's code is `PQRoot`, which does not call back into the factory. Timestamp, assembly, cyclomatic complexity, the precompile `staticcall`, and the Barkeep getter names are informational. A local run of the filtered command exited 0.

## Exit gate

Passed for a local pre-mainnet review. Phase 6 may deploy a new factory with disposable keys and a tiny USDC amount. This document is not a third-party audit, and it is not a mainnet deployment record.
