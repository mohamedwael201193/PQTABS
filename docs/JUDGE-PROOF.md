# Judge proof

PQTABS puts an SLH-DSA root in front of a Barkeep tab. The root can open, close, transfer, rotate, and set exposure. The agent can spend only what that tab still holds, only to the listed recipients, only under the per-payment limit, and only before expiry. Compromising the agent does not hand over the treasury.

## Why Arc

Arc mainnet is chain id 5042. The SLH-DSA-SHA2-128s precompile is `0x1800000000000000000000000000000000000004`. Native USDC is `0x3600000000000000000000000000000000000000`. Gas is that same USDC. Finality is deterministic, so the index orders by block number and log index and does not roll back reorgs. Wallet transactions stay classical. The root authorization is the post-quantum part.

`execute` emits `RootExecuted` only after `_verify` returns true, and `_verify` staticcalls that precompile. Receipt `0xcaf1a2e3…cb3d` in block 24,623,972 succeeded and contains one `RootExecuted`: nonce 3, kind 3, submitter registrar `0xf76e6B…71a3`. The previous-key transaction `0x19338117…37ee` in block 24,623,958 reverted and contains no `RootExecuted`. The root's current `pqVk` is `0xdbb8245905fe933f16b4ed744b0e0c7050c616f7f2c83207aa72a7a97ed1ef50`. `debug_traceTransaction` is not supported on `https://rpc.mainnet.arc.io`, so the precompile address is not visible in a trace.

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
- An agent payment after a browser refresh on the production origin. After a reload, agent `0x074D…096B` signed the message `pqtabs-reload-check`. That was not a USDC authorization and no transaction was sent.
- A new wallet creating a root, funding it, opening a capability, paying, and closing, in this audit.
- A second account inside one Chrome session. Account `0xBDfC…0034` earlier had no root. The production page now shows registrar `0xf76e…71a3` and root `0x846f…65Cf`. Those two views were not switched inside one session.
- An x402 payment and the paid resource. The facilitator accepts a USDC EIP-3009 signature when `extra.assetTransferMethod` is `eip3009`, then returns `invalid_exact_evm_insufficient_balance` for an unfunded signer. Closed tab `0x5637…3837` still returns `0xffffffff`. Receipt `0x971e0398…ddbc` in block 24,826,606 reverted with 0 logs; the call used a garbage 213-byte blob and value `10001`, and the tab balance stayed 0. The revert reason was `FiatTokenV2: invalid signature`, which is the closed-tab check, not an isolated over-limit check. No funded payment was settled. No `PAYMENT-SIGNATURE` was sent. Root `0x846f…65Cf` has no open capability. Authorize for agent `0x074D…096B` stayed disabled because the security-key backup was not chosen.
