# Indexer truth matrix

Status as of 2026-10-08. A row is VERIFIED only when this repo's code or a test shows it. Official Arc emitter and decimal facts are still UNKNOWN here until the current indexing page is applied. This file does not claim that native and ERC-20 representations have been proven distinct on mainnet.

The indexer stores raw log `value`. It does not divide by 1e6 or 1e18.

| Movement | Emitter the indexer reads | Event | Sender used | Decimals | Double-count risk | Status |
|---|---|---|---|---|---|---|
| ERC-20 USDC transfer out of a known tab | `0x3600000000000000000000000000000000000000` | `Transfer` | log `from` (the tab), not `tx.from` | raw log value, not rescaled | A replay of the same `tx_hash` + `log_index` inserts once. A second log index is a second movement. | VERIFIED in `backend/src/index/ingest.ts` and `backend/test/index.test.ts` |
| Spend whose tab was never opened | same filter, then dropped | `Transfer` | log `from` | raw | Not stored, so it cannot inflate a root | VERIFIED |
| Spend attributed to the wrong root | tab lookup | `Transfer` | log `from` | raw | The capability row's root wins over the event's root field | VERIFIED |
| Native USDC transfer, including gas | not queried | UNKNOWN | UNKNOWN | UNKNOWN | If Arc also emits an ERC-20 `Transfer` on `0x3600…0000` for the same economic move, this indexer would store that ERC-20 log only. If the native event is a different log on the same contract, it would be stored as a second spend. | UNKNOWN |
| EIP-3009 payment | ERC-20 `Transfer` if the token emits one | `Transfer` | log `from` | raw | `tx.from` is not used as the payer | VERIFIED for the field choice. Whether the token emits one log or two is UNKNOWN |
| Root funding | not indexed as a spend unless the log `from` is a known tab | — | — | — | A transfer into the root from outside a tab is not an agent spend | VERIFIED as a filter, not as a funding ledger |
| Tab funding, close, reclaim | PQTABS events `TabOpened`, `TabClosed` | those events | contract event args | cap amounts are raw | Close is activity kind `closed`, not added into the spend sum by the new test | VERIFIED for event apply. Economic equality with USDC balance is not proven |
| Direct transfer and gas deduction | not separately classified | — | — | — | UNKNOWN until the official native-transfer rule is applied | UNKNOWN |

The test `counts a replayed spend once and keeps a second log as a separate movement` checks the ledger sum. It does not fetch Arc, and it does not prove that one economic payment produces only one log.
