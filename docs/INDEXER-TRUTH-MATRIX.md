# Indexer truth matrix

Checked 2026-10-08 against https://docs.arc.io/arc/references/usdc-system-events and https://docs.arc.io/integrate/infrastructure/indexing-events. Those pages were fetched. The indexer behavior is the code in this repo.

Arc says one ERC-20 `transfer()` emits two logs:

- ERC-20 `Transfer` from `0x3600000000000000000000000000000000000000`, 6 decimals
- native EIP-7708 `Transfer` from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`, 18 decimals

A plain native send emits only the system log. Gas emits no `Transfer`. For EIP-3009, the payer is the log `from`, not `tx.from`. The same balance is shared. Display of a 6-decimal raw amount divides by 1e6. A native 18-decimal amount is not added to that figure.

| Movement | Emitter | Event | Sender | Decimals stored | What this indexer does | Status |
|---|---|---|---|---|---|---|
| ERC-20 spend from a known tab | `0x3600…0000` | `Transfer` | log `from` | 6-decimal raw | Queried and stored | VERIFIED in code |
| Native twin of that same transfer | `0xffff…fffe` | `Transfer` | log `from` | 18-decimal raw | Rejected by `erc20SpendRaw` | VERIFIED by `backend/test/usdc-event.test.ts` |
| Native-only send | `0xffff…fffe` | `Transfer` | log `from` | 18 | Not stored. A native send that never touches the ERC-20 interface is absent from activity | DOCUMENTED limitation |
| Gas | none | none | receipt `gasUsed * effectiveGasPrice` | 18 on the receipt | Not indexed. Balance drift from gas is a reconciliation concern, not a second spend row | DOCUMENTED |
| EIP-3009 payment | ERC-20 contract if it emits `Transfer` | `Transfer` | log `from`, not `tx.from` | 6-decimal raw | Same filter as an ERC-20 spend | DOCUMENTED for sender semantics. One live payment receipt is in HISTORY. This test does not re-fetch that receipt |
| Root funding from outside a tab | either emitter | `Transfer` | log `from` is not a known tab | — | Not stored as an agent spend | VERIFIED as a query filter (`from` must be a known tab) |
| Open, close, reclaim | the root contract | `TabOpened`, `TabClosed` | event args | cap raw | Stored as capability activity, not added to the spend sum | VERIFIED |
| Replay of one log | the stored log | — | — | — | One row per `tx_hash` + `log_index`. A second log index is a second movement | VERIFIED |

`erc20SpendRaw` returns the 6-decimal raw value for the ERC-20 emitter and null for the native emitter. The unit test applies both representations of a 7-raw movement and keeps only `"7"`.
