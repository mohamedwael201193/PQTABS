# HISTORY

Forensic timeline for the production PQTABS build. Times are UTC.

## Phase 0 — architecture audit

- Start: 2026-10-06T20:28:00Z
- End: 2026-10-06T20:40:00Z
- Objective: replace the single-operator, one-agent plan before writing production behavior.
- Files read: `IMPLEMENTATION-PLAN.md`, `docs/ARCHITECTURE.md`, `docs/PHASES.md`, `contracts/PQRoot.sol`, `contracts/RootFactory.sol`, Barkeep `Tab.sol` / `TabFactory.sol` from the pinned checkout, Arc `IPQ.sol`.
- Decision: one `PQRoot` clone per registrar wallet, one ECDSA agent key per tab, backend never custodies keys, no database, no frontend. `IMPLEMENTATION-PLAN.md` stays as the chain-fact appendix and is marked superseded for product scope. Demo-agent language in that file is not an instruction.
- Exit gate: passed. `docs/ARCHITECTURE.md` is the product architecture.

## Phase 1 — toolchain

- Foundry 1.8.5 (`forge`, `cast`), commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`, installed at `%USERPROFILE%\.foundry\bin`.
- rustc/cargo 1.93.0. Node is present and unused in this phase.
- `git init -b main` inside `PQTABS/` because `forge install` requires a repository. Parent `d:\route\arc` is not the git root.
- forge-std v1.17.0 `f3dae6e6ee381f25eb6a246f7da9b85c91a68219`.
- solc 0.8.30, optimizer 200, via IR, `bytecode_hash = none`, EVM `prague`.
- Exit gate: passed. `forge` and `cargo` both run.

## Phase 2 — live Arc SLH-DSA precompile

- Start: 2026-10-06T20:45:00Z
- End: 2026-10-06T20:53:12Z
- Objective: prove the pinned `slh-dsa` 0.2.0-rc.5 empty-context encoding against the Arc mainnet precompile. No contract broadcast.
- Official source: `circlefin/arc-node` commit `6e764023ee6515fe70573e123ed2db912a7207b4`, files `tests/helpers/pq_test_vectors.json` and `contracts/src/pq/IPQ.sol`. Copies live in `signer/testdata/`.
- Chain: `eth_chainId` = `0x13b2` = 5042. Precompile `0x1800000000000000000000000000000000000004`. Selector `verifySlhDsaSha2128s(bytes,bytes,bytes)` = `0xbf4db8ba` (`cast sig`).
- Tool: `scripts/phase2_probe.py`. Python `urllib` received HTTP 403 from the RPC. The same request through `curl.exe` with user-agent `cast/1.8.5` succeeded. The script uses curl and does not print key material.
- Results, all VERIFIED, recorded in `evidence/phase2.json`:
  - Vector 0 message `Hello, World!`, signature length 7856, `eth_call` valid `true`.
  - Same signature with the last byte flipped: valid `false`.
  - Same signature truncated by one byte: revert `execution reverted: Invalid signature length`.
  - Vector 2 (`is_valid: false`): valid `false`.
  - Fresh `SigningKey::<Sha2_128s>` from this crate, empty context, message 32 zero bytes, signature length 7856: valid `true`. First byte flipped: valid `false`. Public verifying key and signature sha256 are in the evidence file. The signing key file is under `pq-keys/`, which is gitignored.
- Local crate check: `official_arc_vectors_match_pinned_slh_dsa` verifies all three official vectors with empty context. It passed.
- Signer compile failures before that, and the fixes:
  - `signature` 2.2.0 does not match the crate's `signature` 3.0.0-rc.10. Removed the direct dependency and call `try_sign_with_context(msg, &[], None)`.
  - `rand` 0.8 `OsRng` does not implement `rand_core` 0.10 `CryptoRng`. Switched to `rand` 0.10 and `rand::rng()`.
  - `verifying_key()` is `AsRef`, not a method on the key without the signature crate's trait.
- Exit gate: passed. A valid rc.5 signature returns true on mainnet. Stop condition was not hit.

## Phase 3 — digest compatibility

- Objective: the Rust ABI digest equals `PQRoot.digestFor` for every action kind.
- Failure: the first unit test read bytes 64..80 of the open encoding and expected offset 192. Those bytes are the high half of the offset word, so the value was 0. The offset lives in the low 16 bytes of that word (bytes 80..96). The encoder was already correct.
- Golden vector from `cast abi-encode` / `cast keccak`, hardcoded in `signer/src/digest.rs`:
  - domain `keccak256("PQTABS_V2")` = `0xa679b30f73c42f98a44c9a4b0ef7d9ae94fc893727137427cd38def237e83dba`
  - open-action digest for chain 5042, root `0x3333…3333`, nonce 7, deadline 1893456000 = `0xb89923a0c10a21a5d6fc2de3558799654b0de9621028cdbf4c05bca63ca251bf`
- Contract cross-check: `test_signer_digest_matches_contract_for_every_action` runs `pqtabs-sign digest` through `vm.ffiString` for OPEN, CLOSE, TRANSFER, ROTATE, and SET_EXPOSURE. Passed in 4.86s. `ffi = true` was added to `foundry.toml` for this test.
- Exit gate: passed.

## Phase 4 and 5 — contracts and local tests

- `PQRoot` and `RootFactory` compile with solc 0.8.30. Runtime size of `PQRoot` is 7,250 bytes. `RootFactory` runtime is 1,384 bytes. Init code of the factory is 8,953 bytes because it deploys the implementation.
- First `forge test` did not compile: Barkeep factory literal needed checksum `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c`. The address value is unchanged.
- Seven tests then failed with `next call did not revert as expected`. Root cause: `vm.expectRevert` watches the next external call, and Solidity evaluates `pqVk()` / `digestFor()` / `nextNonce()` while building arguments, so the cheatcode was consumed by a successful view. Signatures and nonces are now computed into locals before `expectRevert`. After that, 14 unit tests passed, including 1,024 fuzz runs of the exposure bound.
- `test/invariant/Exposure.t.sol`: 64 runs, 2,048 calls, 0 handler reverts. `openExposure` stayed equal to the sum of caps of currently open tabs. Donations, spends, closes, reclaims, warps, and retry sweeps did not break it. A second root created in `setUp` stayed at exposure 0 and nonce 0.
- `initialize` now emits `ExposureSet`. Foundry's `missing-events-arithmetic` warning was the reason. Reentrancy warnings from `forge build --sizes` remain; `nonReentrant` sets `locked = 2` before the external calls. They are not treated as a passed security review.
- Unit tests use `MockPQ`. That mock is not SLH-DSA. Cryptographic truth is phase 2, not the mock.
- Exit gate for local accounting: passed. Mainnet deployment has not started. Phase 5.5 (Slither and the rest of the surface review) is not finished, so phase 6 is blocked.

## Repository

- Commit `9d345eb` records the contracts, signer, tests, and phase-2 evidence.
- The GitHub repository already had `827b0dd` (`README.md` only). Those histories were merged. The README conflict was resolved by keeping the protocol README.
- Pushed tip `3f26948` to `https://github.com/mohamedwael201193/PQTABS` `main`. `.env` and `pq-keys/` were not in the commit. `git check-ignore` covers both.

## Phase 5.5 — pre-mainnet security gate

- Slither 0.11.6 on the production contracts: 4 results. `balanceOf(tab) == 0` is the sweep-completion check. The remaining reentrancy notes are the `needsSweep` clear after `tab.close()`. Exposure is reserved before `openTab`. `test_factory_callback_cannot_execute_a_second_action` shows a callback `execute` reverts with `Reentered` and does not move funds.
- `forge test --fuzz-runs 4096`: 17 passed. The exposure fuzz ran 4,096 times. Invariant stayed at 64 runs and 2,048 calls.
- `forge snapshot` wrote `.gas-snapshot`. `PQRoot` runtime size is 7,321 bytes. `RootFactory` runtime size is 1,384 bytes.
- `forge script scripts/Deploy.s.sol` simulated a deployment and used 2,082,284 gas. It was not broadcast. The address it printed is local.
- Storage layout, selectors, metadata, and the accepted findings are in `docs/PHASE-5.5.md`.
- Exit gate: passed for local review. Phase 6 is allowed to use disposable keys and a tiny USDC amount. It has not started.

## Phase 6 — Arc mainnet staging

- Start: 2026-10-06T21:25:56Z
- End: 2026-10-06T21:32:13Z
- Objective: deploy `RootFactory` on Arc mainnet with disposable SLH-DSA keys, two registrars, two agents, tiny USDC caps, and the live Barkeep factory. Stop if any expected success reverts or any expected rejection succeeds.
- Script: `scripts/stage_mainnet.py`. It reads the deployer key from `.env` and does not print it. New keys were written under `pq-keys/staging/`, which is gitignored. `maxFeePerGas` was 30 gwei and `maxPriorityFeePerGas` was 2 gwei.
- Preflight: chain id 5042, Barkeep `IMPLEMENTATION()` and `USDC()` matched the constants in `PQRoot`, deployer ERC-20 balance 10.782756 USDC.
- Factory: `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` in tx `0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916`, block 24623258, status 1, gas 2,016,614. `implementation()` reads `0xb147Ec122E0b8F91dC4398dD0746372fdC22A894`.
- Two registrars. Registrar B `0xB96Aa3d062eF493FC6E9bFcFe181b4bac7e72f33` was a fresh key funded with 0.3 USDC so it could pay gas. Root A `0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf`. Root B `0x27F441D82d6b364E06eb906889BE8Fc02Df8F762`. Their `registrar()` values differ.
- Each root received 150,000 raw USDC (0.15). Each opened one tab with cap 100,000, maxPerCall 40,000, expiry `1791322070`. Tab A `0xE3051e8173fDBEC33B826352CB177a306B9d5109` is owned by root A. Tab B `0xD14d151eD5Eb7dE58A3893c7C69e374E37d1184d` is owned by root B. `openExposure` on each root became 100,000.
- Agent spends used USDC `transferWithAuthorization`. `isValidSignature` returned `0x1626ba7e` before each broadcast. Each tab moved from 100,000 to 90,000. The payee ended at 20,000. A non-payee call returned `0xffffffff` and the broadcast receipt status was 0. An over-max call and an agent-B-on-tab-A call also returned `0xffffffff`.
- Root A then transferred 1 raw unit under its PQ key. That exact payload replayed on root B reverted. The eth_call data was `InvalidSignature` (`0x8baa579f`). Receipt status 0. Root B's later reclaim still succeeded, so the rejected replay did not consume B's accounting.
- After the chain timestamp passed the tab expiry, `reclaim` returned 90,000 to each root and set `openExposure` to 0. Tab balances read 0 afterward.
- Root A rotated its verifying key. A transfer signed by the old key reverted `0x8baa579f` and did not consume the nonce. The new key then transferred 1 raw unit. Final balances: root A 139,998, root B 140,000, both tabs 0, payee 20,000. That matches cap minus spend, plus the two 1-unit root transfers on A only.
- Evidence: `deployments/mainnet.json` and `deployments/staging.json`. The raw cross-root signature was removed from the JSON and replaced with sha256 `295887443aa91f3e0cfc138d909d42e55c0ecfb2fb71140e597a5e57fe937cab`. The signature is already in the broadcast transaction.
- Exit gate: passed. Phase 7 does not deploy a second factory. This factory is the production factory because it has no admin and a second factory would split users. The staging roots stay disposable.

## Phase 8 — backend, wasm signer, and judge documents

- Start: 2026-10-06T21:36:06Z
- End: 2026-10-06T21:47:00Z
- The backend is a Hono process. It reads Arc and relays only `execute`, `reclaim`, `retrySweep`, and USDC `transferWithAuthorization`. `npm test` passed 6 tests, including a live read that chain id is 5042, the factory has bytecode, and root A `openExposure` is 0.
- `npm audit` reported four advisories in Hono JWT middleware, `@hono/node-server` static files, and viem's `ws` dependency. This server uses none of those paths. `docs/DEPENDENCIES.md` records that. `npm audit fix --force` was not run.
- `signer/src/pq.rs` is the shared SLH-DSA path. `signer/wasm` calls it. `browser_digest_matches_the_golden_vector` passed. `cargo build --target wasm32-unknown-unknown --release` for that package finished at 2026-10-06T21:47:00Z. The first wasm build failed because `getrandom` 0.4 rejects `wasm32-unknown-unknown` unless `wasm_js` is enabled, and `getrandom` 0.2 needs its `js` feature. Both features are enabled on the wasm package. The release rebuild then succeeded.
- Signer tests after the shared path: 4 library tests and 3 binary tests, all passed.
- Threat model, judge review, recovery, API, and testing documents were written against the mainnet receipts.
- Exit gate for the local backend and signer: passed. Render was not deployed in this phase.
- Git commit `53fe159` contains this phase. Its subject line is the previous gate sentence, because the new message file was not written before `git commit -F` ran. The files in that commit are the staging receipts, the backend, the wasm signer, CI, and these documents.

## Phase 9 — Render

- The free-plan service `pqtabs` (`srv-db2mqpvavr4c73elkt60`) is `https://pqtabs.onrender.com`. Deploy `dep-db2mr5q6f5ic73d58gag` reached `live`.
- `GET /ready` returned chain id 5042, factory `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323`, and `relayer: true`.
- `GET /v1/roots/0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf` returned the rotated verifying key, `openExposure` 0, and 139,998 raw USDC.
- `GET /v1/tx/0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916` returned status success, block 24623258, gas 2,016,614.
- Relayer `0x5C7a54eEaF29310E758Fc6f010eCE827897D183e` was funded with 300,000 raw USDC in `0xccd44474a6f6cfe7d2132b86d1156b65972afeb929242b242e0a5b89acada240`. The key is only in `.env` and on Render.
- A restart API call returned 200. `/ready` answered again with the same chain id and factory.
- The free plan sleeps when idle. That limit is written in `docs/DEPLOYMENT.md`.
- No frontend directory. `pq-keys/` remains gitignored.
- `POST /v1/relay/execute` on the live service submitted a 1-unit root A transfer. Receipt `0x205114d24dcb3c894aa82a394d3709f26c07ffb3ea6dcb40a465546a091db33d` is status success, block 24627943. Balance 139,998 to 139,997. Nonce 4 to 5.
- GitHub Actions run 37537713043 passed: contracts, signer, backend, pins and secret scan, and the filtered Slither job. Two earlier runs failed because Slither was counting forge-std. That scope is fixed in `fa611c9`.

## Phase 10 — frontend integration

- Start: 2026-10-07T00:05:00Z
- The designed Next.js app was reading a local dataset (`frontend/src/data/seed/account.ts`, treasury 24820.47). That file is deleted. The dashboard now loads `GET /v1/config`, the registrar's roots, and `GET /v1/roots/:address/portfolio`.
- Arc `eth_getLogs` from factory block 24623258 to latest returns `-32012 requested range too large`. A 10,000-block span fails. A 5,000-block span succeeds. The portfolio reader walks 4,000-block windows, one event stream at a time, after a parallel scan hit HTTP 429. `node --test dist/test/live.test.js` then passed: chain 5042, factory bytecode, root A `openExposure` 0, USDC balance 139997, tab `0xE3051e8173fDBEC33B826352CB177a306B9d5109` closed and owned by root A, and a spend event.
- Open and close build the same ABI action and `PQTABS_V2` digest as `signer/src/digest.rs`. A Node check of the golden vector matched action bytes and digest `0xb89923a0c10a21a5d6fc2de3558799654b0de9621028cdbf4c05bca63ca251bf`. The browser does not hold the PQ seed. It shows the digest and relays a 7856-byte signature. Success is a receipt plus the tab appearing, or disappearing, in the next portfolio read.
- Reclaim is the permissionless relay. The screen reloads the portfolio and reports success only if that tab is closed.
- Agent payments pack the 213-byte Barkeep blob and post `/v1/relay/spend`. A failed simulation stays an error. The agent key is not written to disk by the page.
- The hosted Render process does not have `/v1/roots/:address/portfolio` until this commit is deployed. Chrome and Vercel are not done in this entry.
- Local Chrome, the user's own window at `http://localhost:3000`, loaded registrar A root `0x846f…65Cf` with root balance `0.139997 USDC`, open exposure `0`, exposure room `0.2 USDC`. Tab `0xE305…5109` was closed, agent `0xFd05…fAb7`, cap `0.1 USDC`. Activity linked the live relay `0x205114d2…`. Switching to registrar B showed root `0x27F4…F762`, balance `0.14 USDC`, and tab `0xD14d…184d` only. A reload then failed because two portfolio scans hit Arc `eth_getLogs` HTTP 429. The page now waits for the stored registrar before the first read, and the log walker retries a 429. Vercel is not deployed.
