# Judge proof

PQTABS puts an SLH-DSA root in front of a Barkeep tab. The root can open, close, transfer, rotate, and set exposure. The agent can spend only what that tab still holds, only to the listed recipients, only under the per-payment limit, and only before expiry. Compromising the agent does not hand over the treasury.

## Why Arc

Arc mainnet is chain id 5042. The SLH-DSA-SHA2-128s precompile is `0x1800000000000000000000000000000000000004`. The 6-decimal USDC contract is `0x3600000000000000000000000000000000000000`. An ERC-20 transfer also emits an 18-decimal log from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`. The index counts only the 6-decimal log. Gas emits no such transfer. Finality is deterministic, so the index orders by block number and log index and does not roll back reorgs. Wallet transactions stay classical. The root authorization is the post-quantum part.

`execute` emits `RootExecuted` only after `_verify` returns true, and `_verify` staticcalls that precompile. Receipt `0xcaf1a2e3…cb3d` in block 24,623,972 succeeded and contains one `RootExecuted`: nonce 3, kind 3, submitter registrar `0xf76e6B…71a3`. The previous-key transaction `0x19338117…37ee` in block 24,623,958 reverted and contains no `RootExecuted`. Verifying key `0xdbb8245905fe933f16b4ed744b0e0c7050c616f7f2c83207aa72a7a97ed1ef50` and nonce 13 belong to the earlier root `0x846f…65Cf`. The production root `0x4450…9787` uses verifying key `0x5419dd96…bd20`. The current production page is wallet `0xBDfC…0034` with one open capability. `debug_traceTransaction` is not supported on `https://rpc.mainnet.arc.io`, so the precompile address is not visible in a trace.

## What is enforced where

| Question | Answer |
|---|---|
| Who owns the treasury? | The root. The registrar wallet can create it and cannot move its funds. |
| What can the agent spend? | The USDC inside its open tab, under `maxPerCall`, recipient, and expiry. |
| What if the agent key is stolen? | The blast radius is that tab's remaining balance and its rules. The root key is separate. |
| What if the relayer is stolen? | It pays gas. It cannot change the action the root already signed, and it cannot sign a new root action. |
| What if the database is wrong? | It is derived. A portfolio read shows stored rows and a freshness label. Reconciliation and `scripts/rebuild-index.mjs` reread Arc. The database does not rewrite the chain. |
| What if Arc returns 429? | The portfolio response stays on the last stored rows and says the read is degraded or indexing. The screen says network reads are busy. |

## What a judge can inspect

- Factory `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` on https://explorer.arc.io
- Root `0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf`
- The open, payment, and close receipts named in `docs/USER-FLOW.md`
- Local tests run on 2026-10-08: `forge test --no-match-path lib/*` passed 17 tests, including `testFuzz_exposure_never_exceeds_max` for 1024 runs and `invariant_open_exposure_equals_sum_of_open_caps` for 64 runs and 2048 calls. Those Foundry tests etch `MockPQ`. `cargo test` in `signer/` passed 8 tests, including the three pinned Arc SLH-DSA vectors in `signer/testdata/pq_test_vectors.json` (two valid, one invalid). Backend `decide`, `x402`, `usdc-event`, `spend-blob`, `index`, `validate`, `rpc-error`, and `http` passed 25 tests. `live.test.ts` was not run.

## What is not proven yet

- A portfolio P95 under 500ms. The 2026-10-08 series in `docs/PERFORMANCE.md` has portfolio P50 354ms and P95 3160ms on 11 requests. One later handler time was `app;dur=413`.
- Close and reclaim of capability `0x136F…f094`. It is still open. Expiry is unix `1791560403`. Reclaim after that time does not need the root key. Close before expiry needs the current security-key backup, and this browser has not unlocked that backup.
- A useful research answer. The one settled x402 payment is `0x699787ce…f5d6`: 12 raw USDC from `0x136F…f094` to `0x6Bf0…e9A9`, and ArcRouter returned `Tabletennis` for "Reply with one word: pong". Later research requests were signed, ArcRouter returned `invalid_exact_evm_signature`, and no second transaction was created. The exact scheme requires a 65-byte EIP-3009 signature that recovers to the payer before the facilitator simulates the transfer. This capability accepts only a 213-byte authorization, and that signature recovers to the agent.
- Same-device passphrase unlock of the real backup for wallet `0xBDfC…0034`. This browser's `pqtabs-root-backup` store is empty. A file that is not a backup, and a backup for a different SLH-DSA key, were both refused. Nothing was signed.
- A payment created only by refreshing the page. After a reload, the research agent can sign because its encrypted key is still on the device. No new USDC payment was sent by that reload.

## Later production wallet

Wallet `0xBDfC…0034` created root `0x44502F6d18DAA9620c2BB3da21b8C3C8033A9787` in `0x26c918d4…872a`, funded it in `0x6873f48d…1f92`, and opened capability `0x136F…f094` in `0x66e51bd6…e759`. The root verifying key is `0x5419dd96…bd20`. The production page shows wallet `1.258159 USDC`, root cash `0 USDC`, and agent reachable `0.009988 USDC`. Account switch from this wallet to `0xf76e…71a3` and back was shown before the later figure labels. It has not been repeated since those labels. The earlier root `0x846f…65Cf` and its `pqVk` `0xdbb8…ef50` are a different registrar. Closed tab `0x5637…3837` rejected a garbage 213-byte blob: receipt `0x971e0398…ddbc` reverted `FiatTokenV2: invalid signature`, with 0 logs, and that tab balance stayed 0.
