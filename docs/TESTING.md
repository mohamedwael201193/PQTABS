# Testing

Prerequisites: Foundry 1.8.5, Rust 1.85 or newer, Node 22 or newer, Python 3, curl, and `cargo` on `PATH`. From a fresh clone:

```bash
git submodule update --init --recursive
forge test
forge test --fuzz-runs 256 --match-contract ExposureInvariantTest
cd signer && cargo test
cd ../backend && npm ci && npm test && npm run lint
python ../scripts/check_pins.py
python ../scripts/secret_scan.py
```

On Windows the same commands work in PowerShell. `scripts/judge.ps1` runs this set from the repository root.

## What each command proves

`forge test` runs the unit tests in `test/PQRoot.t.sol`, including the two-user isolation test, and the invariant in `test/invariant/Exposure.t.sol`. The default fuzz profile is 1,024 runs. The invariant profile is 64 runs and depth 32. The digest test shells out to `cargo`, so a missing `cargo` fails that test rather than skipping it.

`cargo test` in `signer/` checks the golden digest, empty-context sign and verify, mutation, and the official Arc vectors in `signer/testdata/pq_test_vectors.json`.

The browser entry points are `signer/wasm`. This checks that those entry points produce the same golden digest, then compiles them for the browser:

```bash
cargo test --manifest-path signer/wasm/Cargo.toml --lib browser_digest
cargo build --manifest-path signer/wasm/Cargo.toml --target wasm32-unknown-unknown --release
```

`npm test` compiles the backend and runs the allowlist, rate-limit, HTTP rejection, and a live read of chain 5042. The live read expects factory bytecode and root A `openExposure == 0`.

## Live probes

These talk to Arc mainnet. They do not deploy.

```bash
python scripts/phase2_probe.py
```

`--fresh` also signs with a disposable key under `pq-keys/` and checks that signature on the precompile. The key file is gitignored.

## Static analysis

```bash
slither . --foundry-compile-all --exclude incorrect-equality,reentrancy-no-eth --fail-high
forge build --sizes
forge inspect PQRoot storageLayout
```

The excluded detectors are the four accepted findings in `docs/PHASE-5.5.md`. A new high finding fails the command.

## CI

`.github/workflows/ci.yml` runs the Forge suite, the signer tests, the backend tests, the pin check, and the secret scan. Slither runs as its own job using the same exclude list.
