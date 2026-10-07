# Research ledger

Facts used by the current build. Status is VERIFIED when this environment observed it, DOCUMENTED when an official page or repository states it, and INFERRED when it follows from those without a fresh observation.

| Fact | Source | Checked | Status |
|---|---|---|---|
| Arc mainnet chain id is 5042 | https://docs.arc.io/ | 2026-10-07 | DOCUMENTED. `eth_chainId` was `0x13b2` in phase 2. |
| `eth_getLogs` rejects a range at or above 10,000 blocks with `-32012` | https://docs.arc.io/integrate/infrastructure/indexing-events | 2026-10-07 | DOCUMENTED. The indexer pages at 2,000. The legacy scanner pages at 9,999. |
| Finality is deterministic. Do not build reorg rollback. | https://docs.arc.io/arc/concepts/deterministic-finality | 2026-10-07 | DOCUMENTED. Ordering is block number plus log index. |
| SLH-DSA-SHA2-128s precompile is `0x1800000000000000000000000000000000000004` | https://docs.arc.io/arc/references/evm-differences and `circlefin/arc-node` `IPQ.sol` | 2026-10-07 | VERIFIED. Phase 2 `eth_call` accepted a 7856-byte signature and rejected a flipped byte. |
| Native USDC and the ERC-20 face are the same balance. Display divides raw by 1e6. Gas spends do not emit an ERC-20 Transfer. | Arc docs, USDC `0x3600…0000` | 2026-10-07 | DOCUMENTED. The indexer follows ERC-20 Transfer from known tabs. |
| `arc-node` README still discusses testnet while the docs say mainnet is live | https://github.com/circlefin/arc-node | 2026-10-07 | DOCUMENTED. The docs win for chain id 5042. |
| Render free web service disks are ephemeral | Render docs, service `srv-db2mqpvavr4c73elkt60` | 2026-10-07 | DOCUMENTED. The embedded database is not started on Render. |
| Production derived state is Supabase Postgres 17 through the session pooler | This environment's connection check and row copy | 2026-10-07 | VERIFIED. 2 roots, 6 capabilities, 27 activity rows, 1 cursor. The password is not in the repo. |
| A known-root portfolio read does not call Arc | `backend/src/index/portfolio.ts` on `fbbd232`, measured HTTP 200 | 2026-10-07 | VERIFIED. 0.62s and 0.96s. Not a P50. |
| Barkeep owner can drain the treasury. The agent spends only the tab. | https://github.com/barbarosalagoz/barkeep-arc `60f4b608` | 2026-10-07 | DOCUMENTED. `Tab.sol` is not vendored here. Tests use `MockBarkeep`. |
| arc-guard uses a PQ vault and a 7-day wallet exit | https://github.com/Jayanthkoppala/arc-guard | 2026-10-07 | DOCUMENTED. It is not a spending capability. |
| Pigeonhole pages logs and keeps no database | https://github.com/edycutjong/pigeonhole | 2026-10-07 | DOCUMENTED. |
| ERC-8004 `agentId` to wallet is not used | Project research in `04-CONCEPT-01.md` | 2026-10-07 | INFERRED. A registry pointer does not bound a tab. Left out of v1. |

Do not search these sources again unless a later measurement contradicts a row.
