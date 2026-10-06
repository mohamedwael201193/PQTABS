# PQTABS

Post-quantum roots for bounded USDC spending on Arc. Each user gets their own SLH-DSA root. An agent can spend only from the Barkeep tab that root opened for it.

This repository is the protocol, signer, backend, and tests. There is no frontend in this repository. The production factory on Arc mainnet is `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323`. Receipts, balances, and the two disposable staging roots are in `deployments/mainnet.json`.

## What is verified

- Arc mainnet chain id 5042.
- Precompile `0x1800000000000000000000000000000000000004` returns true for the official SLH-DSA-SHA2-128s `Hello, World!` vector and for a fresh signature from `slh-dsa` 0.2.0-rc.5 with an empty context. A flipped byte returns false.
- `pqtabs-sign digest` matches `PQRoot.digestFor` for open, close, transfer, rotate, and set-exposure.
- Local tests cover two roots, exposure accounting, replay, and a stateful invariant that open exposure equals the sum of open caps.

Forge unit tests use a mock verifier. That mock is not SLH-DSA. The cryptographic check is the mainnet `eth_call` above.

## Prerequisites

- Foundry (solc 0.8.30 via `foundry.toml`)
- Rust 1.85 or newer (`slh-dsa` 0.2.0-rc.5 declares that minimum)
- Python 3, used only by `scripts/phase2_probe.py`
- `curl` on PATH for that probe

`forge test` calls `cargo` through FFI for the digest check, so `cargo` must be on PATH.

## Tests

The full local set is `scripts/judge.ps1` or `scripts/judge.sh`. The commands are listed in `docs/TESTING.md`.

```
forge test
cd signer && cargo test
cd backend && npm ci && npm test && npm run lint
python scripts/phase2_probe.py
```

`phase2_probe.py` only performs `eth_call`. It does not broadcast. `--fresh` also signs with a disposable key under `pq-keys/`, which is gitignored.

## Layout

- `contracts/` — `PQRoot`, `RootFactory`
- `signer/` — SLH-DSA library, CLI, and `signer/wasm` browser entry points
- `backend/` — stateless reader and relayer
- `abi/` — compiler ABIs
- `test/` — unit, invariant, and test-only mocks
- `docs/ARCHITECTURE.md` — production model
- `docs/API.md` — the contract a frontend calls
- `HISTORY.md` — what was actually run
- `deployments/mainnet.json` — Arc receipts

## Secrets

Do not commit `.env`, `pq-keys/`, or signed key files. The backend, when it exists, must not hold PQ seeds or agent keys.
