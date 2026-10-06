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

## Not done

- No factory broadcast. No USDC movement. No Render service. No CI workflow. No frontend directory.
- `pq-keys/phase2-disposable.json` is a local disposable signing key with no on-chain balance. It must not be committed.
