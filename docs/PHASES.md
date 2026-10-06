# Execution phases

The demo phases in `IMPLEMENTATION-PLAN.md` are not the sequence. This is.

| Phase | Gate |
|---|---|
| 0 | Architecture in `docs/ARCHITECTURE.md`. Single demo agent removed from the product scope. |
| 1 | Toolchain recorded in `TOOLCHAIN.md`. |
| 2 | Official SLH-DSA vector returns true on Arc mainnet from this machine. |
| 3 | Rust digest equals Solidity `digestFor` for every action kind. |
| 4 | `PQRoot` + `RootFactory` implemented. |
| 5 | Unit, fuzz, invariant, and two-user tests pass. |
| 5.5 | Slither, sizes, surface review. No mainnet broadcast before this. |
| 6 | Staging on Arc mainnet: factory, two disposable roots, real tabs, real USDC, real precompile. |
| 7 | Same factory becomes the production address only if phase 6 passed. Evidence written. |
| 8 | Backend relay and reads. No key custody. |
| 9 | CI, docs, secret scan, push, Render. |

Stop on a failed gate. Do not weaken an assertion to continue.
