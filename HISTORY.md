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
- Local Chrome, the user's own window at `http://localhost:3000`, loaded registrar A root `0x846f…65Cf` with root balance `0.139997 USDC`, open exposure `0`, exposure room `0.2 USDC`. Tab `0xE305…5109` was closed, agent `0xFd05…fAb7`, cap `0.1 USDC`. Activity linked the live relay `0x205114d2…`. Switching to registrar B showed root `0x27F4…F762`, balance `0.14 USDC`, and tab `0xD14d…184d` only. A reload then failed because two portfolio scans hit Arc `eth_getLogs` HTTP 429. The page now waits for the stored registrar before the first read, and the log walker retries a 429.
- Production URL: `https://pqtabs.vercel.app`. Project `pqtabs` on the Vercel scope `mohamedwael201193s-projects`. Public env only: `NEXT_PUBLIC_BACKEND_URL=https://pqtabs.onrender.com`, `NEXT_PUBLIC_EXPLORER_URL=https://explorer.arc.io`, `NEXT_PUBLIC_CHAIN_ID=5042`. The first production deploy used framework preset Other, and `https://pqtabs.vercel.app` returned `NOT_FOUND`. The project preset is now Next.js, SSO deployment protection is off, and the same URL returns the landing page.
- The user's Chrome, the same window that already had GitHub and ChatGPT open, loaded `https://pqtabs.vercel.app`. Launch App called the Render backend. Registrar A showed root `0x846f…65Cf`, sidebar and settled root balance `0.139997 USDC`, open exposure `0`, exposure room `0.2 USDC`. Activity linked `https://explorer.arc.io/tx/0x205114d24dcb3c894aa82a394d3709f26c07ffb3ea6dcb40a465546a091db33d`, the close `0x0ab33b8276eb51b9298117d36f7660af0138fdcd8e47e34dac6e7e10bc3922fd`, and the 0.09 USDC sweep on that same transaction. Switching to registrar B returned 200 for the roots list and for root `0x27F4…F762`, then portfolio returned 500: USDC `balanceOf` on tab `0xD14d…184d` was HTTP 429. The screen kept registrar A's numbers because a failed load left the previous snapshot in place. The hook now clears that snapshot when the registrar changes. Portfolio contract reads retry a 429 one call at a time, the same way log windows do.
- Render deploy `dep-db2pi43l550s73c3qbg0` for `c3f4d62` went live. The same Chrome tab was reloaded and Launch App opened the stored registrar. Registrar B showed root `0x27F4…F762`, root balance `0.14 USDC`, registrar `0xB96A…2f33`, close and 0.09 USDC sweep `0xb6d3e8638487dbf6d29aa88495ec07b7046f1506ad7b01a926dbb013c855befd`, agent payment `0.010000 USDC` to `0xC485…3044` at `0x6b0dfc18492f957f95a0bc411e6986ca5457848289286081131e0924f61bbdc3`, and open `0xcd11114bb3ff8e713b84c9bf5cfef288bae8dac607a3ff130616795d7a1869d0`. Switching back to registrar A replaced that with root `0x846f…65Cf` and `0.139997 USDC`. The Tabs view listed only `0xE305…5109`, agent `0xFd05…fAb7`, closed, cap `0.1 USDC`. Registrar B's tab was not on that list.
- The same Chrome window then opened a 0.01 USDC capability on registrar A. Agent `0xFd059f0a995e6852c2138215177f00858588fAb7`, payee `0xC485B657C140C9677846f3E9ca6a3158e5623044`. The page showed digest `0x107e3dfe2f8a4d551f8fa8eb0663fa29590e808097d448f98edb1e0e39be0004`, nonce 5. The rotated root key signed that digest locally. Receipt `0x7bfad1a1cdfd068a778571b84c44441cbd867356a07a3ecc54600dfaf92fa3fc` is success in block 24649836. Tab `0x6f0c2f18466900Eee65c0B6bEeA92cFbc21903fB` was open with cap and balance 10000 raw. Root USDC moved from 139997 to 129997 and `openExposure` from 0 to 10000. The page then closed that tab. Close receipt `0x3485191ffdf1704fbd2f59fcb35c54880b6d09f5bec66f677acd4acfeced4466` is success in block 24650423, and the tab returned 0.010000 USDC to the root. After that read, root USDC is 139997, `openExposure` is 0, and nonce is 7. The Tabs view shows `0x6f0c…03fB` closed and zero active capabilities. No agent spend was broadcast from this tab.
- The landing diagrams no longer print invented balances or agent addresses. The user's Chrome reload of `https://pqtabs.vercel.app` showed "EXAMPLE MODEL, NOT AN ACCOUNT", "95% protected", "WITHIN CAP", and "HELD", and did not show 100,000, $500, or Research Agent. Launch App then loaded registrar A at root `0x846f…65Cf` with sidebar balance `0.139997 USDC`, the open receipt `0x7bfad1a1…`, and the close receipt `0x3485191f…`. The exposure chart's remainder is the cash still in the root, not the 0.2 USDC exposure ceiling.
- The same Chrome window opened another 0.01 USDC capability on registrar A. Digest `0xe29003583759870cea389e63a3101b7b5a8c55705c7bc883486bfa8c92530451`, nonce 7. Receipt `0xf5a95551d6c2d0a75230d6983deeb14144cfd146e8ad7c6e7eef294cf59a30d9` is success in block 24653158. Tab `0x45c2a897f03d14051ead706870c3fba69539420a`, agent `0xFd05…fAb7`, payee `0xC485…3044`. Root USDC moved to 129997 and `openExposure` to 10000. The page then said the capability was not opened because the portfolio read returned 429 after that receipt. A successful receipt is no longer described as a failed open, and a rate-limited read is retried.
- Against that open tab, `isValidSignature` returned `0xffffffff` for payee `0x1111…1111` and for 10001 raw to the approved payee. Both `/v1/relay/spend` calls returned `simulation_failed` with no transaction hash. A 1-raw payment to `0xC485…3044` returned `0x1626ba7e` from `isValidSignature` and receipt `0xa4a3a66440a106fd67709f3dae3eab19623936e670ad67cdef4ed0b3edd57912`, success in block 24654131. Close receipt `0xf4c86075e2e0bab82f8138837769ae35a160790af054d791dd44647ae396e0ff` is success in block 24654512. Root A is back to `openExposure` 0, nonce 9, and USDC 139996 raw. The live read assertion matches that balance.

## Phase 11 — product UX

- The registrar wallet is discovery and `createRoot` only. It is not the PQ authority. `RootFactory.createRoot(vk, maxOpenExposure, userSalt)` is the real domain setup, and the connected wallet is `msg.sender`.
- Root signing uses `signer/wasm`, which calls the same `sign_digest` as the CLI. Key generation uses the same `SigningKey::new`. Backup and restore use the same `PQTABS1` Argon2id + AES-256-GCM format as `pqtabs-sign backup`. The signing key stays in browser memory after unlock. It is not sent to Render and it is not a public env var.
- The app no longer opens on registrar A. A stored address is not an account. The wallet's `eth_accounts` is. Changing accounts clears `pqtabs.root`.
- The capability dialog no longer asks for a pasted signature. Close no longer asks for one. A payment no longer asks for an agent private key. An agent created in the dialog keeps its key in the session and does not display it. A capability whose agent was not created on this device cannot be spent from here.
- The browser package is generated at `frontend/src/lib/pq` and served from `/pq/pqtabs_sign_wasm_bg.wasm`. Authorize loads it. A production page load of that signer has not been verified in Chrome.
- A wallet with no root now sees "Protect your treasury". That screen creates the security key, downloads the `PQTABS1` backup, and sends `createRoot` from the wallet. Success is the Arc receipt's `RootCreated` log, then a reload of that root. A root with zero USDC shows "Your treasury is empty" and a wallet deposit. The landing buttons say Connect wallet. This path has not been driven on mainnet.
- The user's Chrome at `http://localhost:3000` showed Connect wallet on the landing page. The already-permitted wallet `0xf76e…71a3` on chain `0x13b2` loaded root `0x846f…65Cf` with sidebar balance `0.139996 USDC`. Agents let a name be created on this device; the new row was "Research Agent" at `0x6209…5F26` with "no treasury access" and no private-key field. The capability wizard reached Authorize with a passphrase field and a backup file field, no textarea, and Authorize disabled until the backup unlocks. Close copy no longer says to paste a signature. Security no longer marks recovery as configured: the backup file is the only copy, and the technical drawer names the precompile `0x1800000000000000000000000000000000000004`.
- `keygen_json` writes `signing_key_hex` and `verifying_key_hex`. The unlock path was reading camelCase fields, so a real backup could not open. It now reads the same names the signer writes.
- The user's Chrome unlocked the existing root backup and authorized a capability without a signature field. Open receipt `0xc4a85cd1ed2bef62694ac83bf57f854a774ebe3795b619e536d8c2b982d6b363` is success in block 24661830. Tab `0x1ff5b53bd34d6d5788104af0ca322c8c87cb2536`, agent `0x6e370433eF73197523e8E5bdC99e07281b808B60`, cap 10000 raw. Root USDC moved from 139996 to 129996 and `openExposure` to 10000. A 1-raw payment to `0xC485…3044` has receipt `0x0d17b53c3d249eb680c8a868c26d5ae8fbf041b034f946ff92bfb61e8b97b3b2`, success in block 24663366. Close receipt `0x365405cfb63e70eec08cafd046d474ed901ff12d568811affd53619c7b66f746` is success in block 24663813. `cast` then read root USDC 139995, `openExposure` 0, nonce 11. The first close POST returned 500 because `registrarOf` hit an Arc 429 before broadcast; the retry was included. Those reads now retry a 429. The live assertion is 139995. Commit `780755b` is on `main`. Render started a build of that commit. Vercel production `dpl_Cv5Yyib3hbnizebr7kfmrrC9KgHY` is aliased to `https://pqtabs.vercel.app`. The user's Chrome loaded that URL and the landing button says Connect wallet. It does not say Launch App, and the page does not ask for a pasted signature or a private key. A second-wallet switch on that production deploy has not been repeated.
