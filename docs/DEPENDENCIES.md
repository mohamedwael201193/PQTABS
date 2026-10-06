# Dependencies

| Piece | Pin | Why |
|---|---|---|
| solc | 0.8.30 via `foundry.toml` | Matches Barkeep's compiler |
| Foundry | 1.8.5, local commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f` | `forge` and `cast` used for tests and the staging script |
| forge-std | v1.17.0 `f3dae6e6ee381f25eb6a246f7da9b85c91a68219` | Test harness only |
| `slh-dsa` | `=0.2.0-rc.5` in `signer/Cargo.toml` | Same crate revision Arc's precompile tests use. Not 0.1.0. Not `pyspx` |
| argon2 | 0.5.3 | Backup KDF. Parameters in `docs/RECOVERY.md` |
| aes-gcm | 0.10.3 | Backup encryption |
| viem | 2.38.3 | Backend chain client |
| hono | 4.10.2 | HTTP router |
| `@hono/node-server` | 1.19.5 | Node listener |
| TypeScript | 5.9.3 | Backend compiler |
| Biome | 2.2.4 | Backend lint |
| Barkeep | `barbarosalagoz/barkeep-arc` commit `60f4b608` | Not a dependency. Pinned addresses only. The contracts are not forked |
| Arc node | `circlefin/arc-node` commit `6e764023ee6515fe70573e123ed2db912a7207b4` | Source of the official vectors and `IPQ.sol` |

`npm audit` on 2026-10-06 reported four advisories: Hono JWT algorithm confusion, `@hono/node-server` static-file path bypass, and `ws` memory issues through viem. This server does not mount Hono JWT middleware or `serveStatic`. The viem client uses HTTP, not the `ws` transport. Those advisories are recorded here and are not treated as fixed. `npm audit fix --force` was not run, because it would leave the pinned versions.

The Forge mock in `test/mocks/Mocks.sol` is not a cryptographic dependency. It is compiled only into tests.
