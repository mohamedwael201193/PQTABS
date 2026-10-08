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
- Local tests: `forge test` in the repo root, `cargo test` in `signer/`, `npm test` in `backend/`, `npm run test:agent-vault` in `frontend/`

## What is not proven yet

- Warm portfolio latency under 500ms. The two production samples were 0.62s and 0.96s. One later sample was 0.52s with `app;dur=193`. That is not a percentile.
- An agent payment after a browser refresh on the production origin.
- A new wallet creating a root, funding it, opening a capability, paying, and closing, in this audit.
- A second account inside the current Chrome wallet. The selected account `0xBDfC…0034` has no root. The page still says "Protect your treasury". The wallet could not be switched from this session.
- An x402 payment and the paid resource. The facilitator accepts a USDC EIP-3009 signature when `extra.assetTransferMethod` is `eip3009`, then returns `invalid_exact_evm_insufficient_balance` for an unfunded signer. A 213-byte blob for closed tab `0x5637…3837` is refused by the tab (`0xffffffff`) and by Arc USDC (`FiatTokenV2: invalid signature`). The same blob sent to `POST /verify` with the method field returned `invalid_exact_evm_signature` and no transaction. No funded payment was settled. No `PAYMENT-SIGNATURE` was sent. The selected wallet has no open capability.
