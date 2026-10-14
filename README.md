# PQTABS

**Give agents a bounded spending capability on Arc. The post-quantum root authorizes that capability. It does not sign each payment.**

[![ci](https://github.com/mohamedwael201193/PQTABS/actions/workflows/ci.yml/badge.svg)](https://github.com/mohamedwael201193/PQTABS/actions/workflows/ci.yml)
[![chain](https://img.shields.io/badge/Arc%20mainnet-5042-2b2b2b)](https://docs.arc.io/arc/references/rpc-endpoints)
[![live](https://img.shields.io/badge/live-pqtabs.vercel.app-111)](https://pqtabs.vercel.app)

- **Live app:** https://pqtabs.vercel.app
- **Backend API:** https://pqtabs.onrender.com (free plan, may take a moment to wake)
- **Chain:** Arc mainnet, chain ID `5042`, USDC as the gas token
- **Judge check:** [JUDGE-QUICKSTART.md](JUDGE-QUICKSTART.md) verifies a receipt, the contracts, and a read-only MCP call. No wallet.

---

## The problem

An AI agent that pays for services needs a wallet. A wallet that holds real treasury USDC and is controlled by an agent key is one leaked key away from losing everything. PQTABS separates the two:

| Concern | How PQTABS handles it |
|---|---|
| Who can move the treasury | A **post-quantum root** signs root-level actions (open, close, transfer, rotate, set exposure). The signature is checked on chain with SLH-DSA-SHA2-128s. |
| How much an agent can spend | A **capability** (a Barkeep tab) holds a fixed USDC cap, an expiry, and a payee. A capability can spend no more than its cap. |
| What happens to a spend request | The backend checks the live balance and cap first (`decideSpend`) and refuses with a stated reason before any signing. |
| Proof that a paid service was paid | The payment is a USDC `Transfer` on Arc. The service result is returned only after that receipt matches the quote. |

## Architecture

```mermaid
flowchart LR
  subgraph Root["Treasury authority"]
    PQ["PQ root (SLH-DSA-SHA2-128s signature)"]
    RF["RootFactory"]
    PQ --> RF
  end
  subgraph Cap["Bounded capability"]
    TAB["Barkeep tab: cap, expiry, payee"]
  end
  subgraph Spend["Spend path"]
    AG["ECDSA agent key (browser)"]
    BE["Backend policy: decideSpend"]
    RL["Relayer (pays gas)"]
  end
  subgraph Arc["Arc mainnet (5042)"]
    USDC["USDC (6-dec ERC-20 interface)"]
  end
  RES["Research model (Groq)"]

  PQ -- "root-signed open / close" --> TAB
  AG -- "spend request" --> BE
  BE -- "allow or refuse" --> RL
  RL -- "broadcast" --> USDC
  USDC -- "Transfer receipt" --> BE
  BE -- "receipt matched" --> RES
  RES -- "answer" --> AG
```

## Payment sequence

The research quote's first accept is PQTABS's scheme, `pqtabs-barkeep`. The same quote also lists a matching standard x402 `exact` row for the same price and payee. The app pays the Barkeep row. A stock x402 client can pay the exact row.

```mermaid
sequenceDiagram
  autonumber
  participant U as Browser
  participant B as Backend
  participant C as Arc
  participant R as Relayer
  participant M as Research model
  U->>B: POST /v1/research/quote (task)
  B-->>U: quote (price, payee, max tokens, expiry 600 s)
  U->>B: POST /v1/x402/decide (capability, price)
  B->>C: read capability balance, cap, expiry
  B-->>U: ALLOW, or REFUSE with a reason
  U->>B: POST /v1/relay/spend (spend authorization)
  B->>R: relay the spend
  R->>C: USDC transfer to payee
  C-->>B: receipt (status, Transfer log)
  B->>M: task, only if the receipt matches
  M-->>B: answer
  B-->>U: POST /v1/research/result: complete
```

Status values returned by the result endpoint: `unpaid`, `result_pending` (receipt matched, no answer yet), and `complete`.

The answer panel keeps the model's sentences. It renders headings, lists, and tables, and turns each cited Arc fact into a link to that fact's official page. A citation the model already linked is not wrapped again. An unknown citation is shown as plain text, and its URL is not used.

## Mainnet proof

All links open the Arc explorer. The first six receipt statuses were read from `https://rpc.mainnet.arc.io` on 2026-10-12. The 2026-10-14 rows, the RootFactory deployment, the RootFactoryNext deployment, and the Arclight settlement were read again from `https://rpc.drpc.mainnet.arc.io` on 2026-10-14. Each of those nine receipts returned status success.

| Event | Transaction | Block | Status |
|---|---|---|---|
| RootFactory deployment | [`0xfade67cb…c916`](https://explorer.arc.io/tx/0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916) | 24,623,258 | success |
| RootFactoryNext deployment | [`0x68c7ce22…80f1`](https://explorer.arc.io/tx/0x68c7ce22eb265bdedbeeab2820fe4f17c6c4f8abce44aa457315a09da84080f1) | 25,790,508 | success |
| Relayed 1-raw USDC transfer | [`0x205114d2…db33d`](https://explorer.arc.io/tx/0x205114d24dcb3c894aa82a394d3709f26c07ffb3ea6dcb40a465546a091db33d) | 24,627,943 | success |
| Capability opened (root-signed) | [`0xc4a85cd1…b363`](https://explorer.arc.io/tx/0xc4a85cd1ed2bef62694ac83bf57f854a774ebe3795b619e536d8c2b982d6b363) | 24,661,830 | success |
| Payment from the capability (1 raw) | [`0x0d17b53c…b3b2`](https://explorer.arc.io/tx/0x0d17b53c3d249eb680c8a868c26d5ae8fbf041b034f946ff92bfb61e8b97b3b2) | 24,663,366 | success |
| Capability closed | [`0x365405cf…f746`](https://explorer.arc.io/tx/0x365405cfb63e70eec08cafd046d474ed901ff12d568811affd53619c7b66f746) | 24,663,813 | success |
| Research payment, answered | [`0x41496d26…76ae`](https://explorer.arc.io/tx/0x41496d2663c553f4948680b24f9de159026c2e2212514b44ffb60eda237076ae) | 25,534,892 | success |
| Capability opened, 360 raw, 24 hours (2026-10-14) | [`0xf1711679…250c`](https://explorer.arc.io/tx/0xf1711679b2256b6fe3050fc2f89b01d489f3619d096b4d943b115369f97f250c) | 25,942,787 | success |
| Research payment, 360 raw, answered (2026-10-14) | [`0x53fc6e7c…6ebc`](https://explorer.arc.io/tx/0x53fc6e7c43b71cd14f98e70f8fbd182d55b55d3bed471f56ac5d0a00a88e6ebc) | 25,942,948 | success |
| That capability closed (2026-10-14) | [`0x8b6ba50c…312c`](https://explorer.arc.io/tx/0x8b6ba50cf54bf13534c168088f1db533327c19606c8ddc86385a0cd771e5312c) | 25,943,103 | success |
| Capability opened for a new local signer (2026-10-14) | [`0x6ad0ecd5…2895`](https://explorer.arc.io/tx/0x6ad0ecd5c3f8f1f998a54a34860ff14270742242024ea2a35ce3211eb96c2895) | 25,947,259 | success |
| Local-signer research payment, 360 raw (2026-10-14) | [`0xed9892c8…e9a4`](https://explorer.arc.io/tx/0xed9892c88c9b499f0195278285c58c9bc51075435500a9c1ddc7c4851eb2e9a4) | 25,947,704 | success |
| That capability closed (2026-10-14) | [`0x00599bdd…083d`](https://explorer.arc.io/tx/0x00599bddc317eb31d60620727e8ef1b9bdbe05014d02557c56c6ff8ee207083d) | 25,947,763 | success |

Deployed contracts, read on 2026-10-13. Hashes and the compiler settings are in [CONTRACT-VERIFICATION.md](CONTRACT-VERIFICATION.md).

| Contract | Address | Source |
|---|---|---|
| RootFactory | [`0x0554…d323`](https://explorer.arc.io/address/0x05545F026b75f03aE9Cf1eA8a8373473c94ed323) | [Sourcify match](https://sourcify.dev/server/v2/contract/5042/0x05545F026b75f03aE9Cf1eA8a8373473c94ed323) |
| PQRoot implementation | [`0xb147…A894`](https://explorer.arc.io/address/0xb147Ec122E0b8F91dC4398dD0746372fdC22A894) | [Sourcify match](https://sourcify.dev/server/v2/contract/5042/0xb147Ec122E0b8F91dC4398dD0746372fdC22A894) |
| Barkeep factory | [`0xcceb…443c`](https://explorer.arc.io/address/0xccebC58DD1F5937B36D5f9F89f0754424f4D443c) | Bytecode on chain. Source not verified. |
| Barkeep tab implementation | [`0x89B6…01D2`](https://explorer.arc.io/address/0x89B63f2E43dea9014750925C01996D34856B01D2) | Bytecode on chain. Source not verified. |
| USDC ERC-20 interface | [`0x3600…0000`](https://explorer.arc.io/address/0x3600000000000000000000000000000000000000) | Arc system contract. Not a PQTABS deployment. |
| PQ precompile | [`0x1800…0004`](https://explorer.arc.io/address/0x1800000000000000000000000000000000000004) | Arc precompile. Not a Solidity contract. |

The live root `0x2d0F…6b95` is a 45-byte clone of the matched PQRoot implementation. Treasury movement inside a root (fund, open, close, reclaim) is not the same thing as a paid research answer. The research payment in the table above is 360 raw (0.00036 USDC). The staging lifecycle in `deployments/mainnet.json` moved larger but still sub-dollar amounts. Neither is a claim that a large treasury has been put under this root.

## Security model

- **Root authority.** Root actions carry a nonce and a deadline inside the signed digest (`PQRoot.digestFor`). `PQRoot.execute` checks the SLH-DSA-SHA2-128s signature on chain and is guarded by `nonReentrant`.
- **Exposure ceiling.** Each root is created with a `maxOpenExposure` ceiling (`RootFactory.createRoot`). Opening a capability cannot push open exposure above it.
- **Capability limits.** A capability holds a fixed cap, an expiry, and a payee. The backend refuses a spend when the balance is empty or the price exceeds what remains (reason `balance`) before any signing.
- **Agent key.** The agent signs spend requests with a classical ECDSA key, which is separate from the post-quantum root. The key lives in one of two places: the browser vault (AES-GCM encrypted with a non-extractable device key in IndexedDB) or the local signer on Windows (DPAPI). The backend never receives the agent or root key. The app never asks for a private key. The one signature it asks you to paste is the Developer Page pairing signature, which proves control of the address and authorizes nothing.
- **Local signer (Windows).** `pqtabs-signer` keeps an agent key encrypted with Windows DPAPI for the current user, under `%LOCALAPPDATA%\pqtabs-signer\keys`. The MCP server starts the signer as a child process and receives only the 65-byte signature for each approved authorization. On this path the MCP process never holds the raw key. DPAPI does not protect against code that already runs as the same user.
- **Relayer.** The relayer pays gas and broadcasts transactions. Root actions need the post-quantum signature, which the relayer does not hold.
- **Circle wallets.** Circle's agent wallet from the CLI is a smart contract account. Barkeep's tab accepts only an ECDSA signature from an externally owned account, so that wallet cannot be the agent. The tab requires the recovered ECDSA signer to equal `agent()`, and the on-chain check ran for EOA agents only, so this contract-wallet conclusion is inferred from that rule and was not tested live. Circle's docs list only `ARC-TESTNET` in the Wallets and CCTP tables, so the mainnet chain code `ARC` used by the adapter is unverified. A Circle developer-controlled EOA has a signer adapter (`circleDeveloperSigner` in `pqtabs-sdk`). Its digest reproduces the signer that Barkeep accepted for a mined Arc spend (an offline known vector). A live Circle signature has not been produced, so the compatibility of Circle's live signing is not proven. It needs your own Circle credentials and an approved test.
- **Replay and quotes.** A research quote binds the task, price, payee, and max tokens by hash (`researchBodyHash`) and expires after 600 seconds.
- **Failure states.** A matched receipt with a missing answer is reported as `result_pending`, not as complete. A refused spend says why. Read traffic and relay traffic use separate rate-limit buckets, and the relay bucket is limited to a fixed number of requests per minute (the suite checks the ninth request inside one minute is refused).

## What is enforced where

PQTABS enforces the post-quantum authorization, the nonce, the deadline, the exposure ceiling, and the open and close accounting. Those rules are in the Sourcify-matched `PQRoot` source.

Barkeep enforces the capability's agent, payee list, per-call maximum, expiry, and the check that a spend signature recovers to that agent. That bytecode is on mainnet and is not source-verified. The tests use a mock of it. The deployed `PQRoot` does not read `agent()`, `payees()`, or `maxPerCall()` back after opening. New roots from `RootFactoryNext` use `PQRootNext`, which does. Existing clones stay on `PQRoot`. `PQRoot` signs `PQTABS_V2`. `PQRootNext` signs `PQTABS_V3`. The page reads `factory()` and uses that domain. A signature from the other domain is rejected on chain and does not open a capability.

## If the post-quantum key is lost

The deployed root has one verifying key. `execute` accepts only a signature under that key. There is no admin, no ECDSA override, and no upgrade path on an existing clone. A lost key cannot authorize a replacement. The USDC in that root stays there.

`PQRootNext` is deployed at `0xBc597CDC7c822fC198Da14A134353ad0eCC16758` behind factory `0x909AF4dFeEcDf8B72eaf918f185Cd89d460b0E63`. Existing roots are not migrated. It uses a 7-day delayed rotation:

- The spending key can schedule a new key. If a backup PQ key was set at creation, only that backup key can cancel the schedule. Transfers and new capabilities pause while it is pending.
- The backup key can schedule a new spending key. Only the current spending key can cancel that schedule. This is the path when the spending key is lost and the backup key is not.
- After 7 days anyone can execute the pending key. Immediate rotation is removed in this version.
- A stolen spending key can still be cancelled by the backup key, and the reverse. If both keys are lost or both are stolen, this does not help. Existing roots do not gain this by a transaction. They would need a new factory and a new root. Moving funds requires the current key.

## Standard x402

The live research quote keeps `pqtabs-barkeep` as the first accept and also offers standard `exact` on `eip155:5042`. A stock x402 client can pay the exact row. The Barkeep row is unchanged.

Arclight (`https://x402.arclight.finance`) verified and settled an EIP-3009 authorization of 360 raw USDC from `0x5C7a54eEaF29310E758Fc6f010eCE827897D183e` to `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`. The Arc receipt is `0x9598e26dc991600971af4a18b05943ca72ae74752581bcb8432ef5714b2673db` (status success, block 25,793,534, one USDC transfer of 360 raw). The same payload recovered locally to the payer and was rejected by `https://facilitator.arcusnetwork.co` with `invalid_exact_evm_signature`. The server calls Arclight. Circle's facilitator lists Arc, and this deployment does not call it because `CIRCLE_API_KEY` is empty.

## Idle treasury

`PQRootNext` can deposit and withdraw idle USDC through the Galaxy USDC vault `0x8E357432CC12ff425c36432F312968aEb16112AF`. On 2026-10-13 that contract's `asset()` was Arc USDC and its name was Galaxy USDC. `maxDeposit` was 0 then, and a read on 2026-10-14 was still 0, so a deposit reverts until the vault takes more assets. The vault source is not on Sourcify. No USDC has been deposited. Existing roots cannot call these functions. Open-capability funds stay inside the capability and are not deposited.

## Circle signing

Circle's CLI agent wallet is a smart contract account. The tab requires the recovered ECDSA signer to equal `agent()`. That on-chain check was run for EOA agents. The contract-wallet case is inferred from that rule and was not tested live. A Circle developer-controlled EOA adapter reproduces the digest of a mined Arc spend offline. No live Circle signature has been produced. Barkeep compatibility with Circle is not verified.

Known limits, stated plainly:

- Arc's public RPC rate-limits reads. The backend retries rate-limited calls. A `429` from `/v1/x402/decide` is usually a read limit, not a refusal of the payment.
- Closing a capability needs the root's security-key unlock in the browser.
- `pqtabs-mcp` 0.1.2 on npm starts the local signer when `PQTABS_SIGNER_CLI` and `PQTABS_SIGNER_AGENT` are set, so the MCP process never holds the key. Its quote schema accepts only the `pqtabs-barkeep` row. Production quotes also include `exact`, so a policy check on 0.1.2 stops with a schema error and signs nothing. The SDK in this repository keeps the Arc Research price when a matching `exact` row is present, and refuses an `exact` row whose amount or payee differs. Versions 0.1.1 and earlier read `PQTABS_AGENT_PRIVATE_KEY` from their environment, which puts the key in the server process. The signer itself is Windows-only (DPAPI) and is not published to npm. Install and check it with `packages/pqtabs-signer/scripts/install-windows.ps1`. macOS and Linux fail closed: no key is stored there. The signer README lists what a store for another platform must provide. The MCP configuration points at the built CLI.
- A receipt that Arc has not returned yet is shown as pending, not failed. The frontend waits up to 90 seconds with bounded backoff on `-32014`, then tells you to check the explorer before you retry. Only a `success` or `reverted` receipt is treated as a result.
- Portfolio reads scan each root only from the last scanned block, not from the factory deploy block. A fresh read is cached for 10 seconds, and a live scan is refused with `503` while the RPC is rate-limiting.
- A capability with a zero balance still counts its cap toward open exposure until it is closed. `PQRoot` adds the cap to `openExposure` on open and subtracts it only on close. Closing needs a root-signed close, or, after the capability's expiry, anyone can call `reclaim(tab)`, which is permissionless and costs gas. On the mainnet root `0x2d0F…6b95`, `maxOpenExposure` is 10,000 raw USDC (0.01 USDC), so one 360-raw capability uses 3.6% of the ceiling until it is closed. The ceiling is a root setting and changing it needs a root action.

## Test totals

Counted on 2026-10-14 from the commands in this table. The frontend node tests, typecheck, lint ratchet, production build, and Foundry suite were run again after the deposit-refresh and next-root signature fixes. Subset rows are included in the frontend total, not added to it. The published-package smoke was not rerun on this date. GitHub Actions run [38595345174](https://github.com/mohamedwael201193/PQTABS/actions/runs/38595345174) on commit `3cc0db6` succeeded on 2026-10-14. The run for the commit that contains this table is the latest entry on the [ci workflow page](https://github.com/mohamedwael201193/PQTABS/actions/workflows/ci.yml).

| Suite | Command | Result |
|---|---|---|
| Backend unit and integration | `npm test` in `backend/` | 102 passed, 0 failed, on 2026-10-14. Includes the exact-settlement checks and the Arclight settle client. |
| Backend lint | `npx biome check src test` in `backend/` | exit 0 on 2026-10-14. 43 files. |
| SDK unit tests | `npm test` in `packages/pqtabs-sdk/` | 65 passed, 0 failed, on 2026-10-14. Includes the Circle adapter vectors, the mined-spend vectors, and the matching-exact-row quote checks. |
| MCP unit tests | `npm test` in `packages/pqtabs-mcp/` | 19 passed, 0 failed, on 2026-10-14. Includes the local signer boundary. |
| Local signer (TypeScript) | `npm test` in `packages/pqtabs-signer/` | 43 passed, 0 failed, on 2026-10-14. Includes the pairing-message vector and refusal of another agent. |
| SDK, MCP, and signer lint | `npx biome check src test` in each package | exit 0 on 2026-10-14. SDK 20 files, MCP 7 files, signer 14 files. |
| Frontend typecheck | `npx tsc --noEmit` in `frontend/` | 0 errors on 2026-10-14. |
| Frontend production build | `npx next build` in `frontend/` | compiled on 2026-10-14 and prerendered `/`, `/_not-found`, and `/developers`. |
| Frontend lint ratchet | `npm run lint:ratchet` in `frontend/` | Passed on 2026-10-14. The baseline is unchanged: 25 errors (17 `react-hooks/refs`, 8 `react-hooks/set-state-in-effect`) and 2 generated-file warnings in `frontend/lint-baseline.json`. The ratchet fails on any new or increased problem. The baseline is not a claim that these are safe. |
| Frontend node tests | `npm test` in `frontend/` (30 `src/**/*.test.ts` files) | 105 passed, 0 failed, on 2026-10-14. Includes the 9 receipt-wait tests, 3 address-field tests, 6 pairing tests, and 6 developer-session tests. |
| Signer (Rust) | `cargo test --manifest-path signer/Cargo.toml` | 8 passed (5 + 3), 0 failed, on 2026-10-14. |
| Contracts (Foundry) | `forge test` | 35 passed, 0 failed, on 2026-10-14 (`PQRoot` 17, `Recovery` 17, exposure invariant 1). |
| Pins and secrets | `python scripts/check_pins.py`, `python scripts/secret_scan.py` | pass on 2026-10-14. 390 tracked files scanned. |
| Published MCP clean-consumer smoke | `packages/scripts/clean-consumer-smoke.mjs` against npm `pqtabs-mcp` 0.1.2 | Last recorded `SMOKE_OK` on 2026-10-13. Not rerun on 2026-10-14. |
| CI | GitHub Actions `ci` | jobs: contracts, signer (Rust), backend (test and lint), sdk-and-mcp (lint, typecheck, test on Ubuntu), frontend (`tsc --noEmit`, lint ratchet, node tests on Ubuntu), pqtabs-signer (lint and test on Windows, isolated key directory), pins-and-secrets, slither. |

## Quick start

Prerequisites: Node 22, npm, and Rust with `cargo`. Foundry is optional.

```bash
git clone https://github.com/mohamedwael201193/PQTABS.git
cd PQTABS

# backend
cd backend
npm ci
npm test
npm run lint
cd ..

# frontend
cd frontend
npm ci
npx tsc --noEmit
npm run lint:ratchet   # no new lint problems beyond frontend/lint-baseline.json
npm test               # 105 node tests on 2026-10-14
npx next dev -p 3000   # http://localhost:3000
cd ..

# SDK and MCP (one npm workspace in packages/)
cd packages
npm ci
npm test --workspaces --if-present
cd ..

# local signer (Windows; see packages/pqtabs-signer/README.md for the other platforms)
powershell -ExecutionPolicy Bypass -File packages\pqtabs-signer\scripts\install-windows.ps1

# Rust signer for the browser
cargo test --manifest-path signer/Cargo.toml
```

### Environment variables

Set these in your shell or in a `.env` file that is never committed. Only the names are listed here. Values are yours to provide.

| Variable | Used by | Purpose |
|---|---|---|
| `ARC_RPC_URL` | backend | Arc RPC endpoint |
| `ARC_CHAIN_ID` | backend | `5042` on mainnet |
| `ARC_EXPLORER_URL` | backend | explorer base URL |
| `USDC_ADDRESS` | backend | USDC ERC-20 interface |
| `FACTORY_ADDRESS` | backend | RootFactory |
| `MERCHANT_PAYEE` | backend | research payee, a public USDC address |
| `RESEARCH_PRICE_RAW` | backend | research price in raw USDC |
| `AI_PRIMARY_PROVIDER` | backend | research model provider |
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | backend | research model access |
| `RELAYER_PRIVATE_KEY` | backend | relayer signing key (secret) |
| `DATABASE_URL` | backend | Postgres for the indexer |
| `NEXT_PUBLIC_BACKEND_URL` | frontend | backend base URL |
| `NEXT_PUBLIC_CHAIN_ID` | frontend | `5042` |
| `NEXT_PUBLIC_EXPLORER_URL` | frontend | explorer base URL |
| `PQTABS_SIGNER_CLI` | MCP (repository build) | path to the `pqtabs-signer` CLI. The MCP asks it for one signature per approved payment |
| `PQTABS_SIGNER_AGENT` | MCP (repository build) | public agent address. Must match the address the signer stores |
| `PQTABS_AGENT_PRIVATE_KEY` | MCP 0.1.1 and earlier (legacy) | raw agent key in the server process (secret). Prefer a local signer. In 0.1.2 it still works with a notice, and setting it together with the signer variables is refused (`invalid_config`) |

Never put private keys, API keys, or encrypted backups in a commit. The repository's secret scan runs in CI.

## Validate a mainnet receipt, read-only

This needs no wallet and spends nothing. Replace `<TX_HASH>` with a transaction hash.

```bash
curl -s https://rpc.mainnet.arc.io \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["<TX_HASH>"]}'
```

Check three things in the result:

1. `"status": "0x1"` means the transaction succeeded.
2. `"to"` is `0x3600000000000000000000000000000000000000` for a USDC transfer.
3. A log with `"address"` equal to that USDC address and `topics[0]` equal to `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` (ERC-20 `Transfer`) carries the 6-decimal amount in `data`.

Arc's native USDC also emits a `Transfer` event at `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` with 18 decimals. Only the ERC-20 log above is the payment amount.

Worked example: the research payment `0x41496d26…76ae` has one ERC-20 `Transfer` log whose `data` decodes to `360`. At 6 decimals that is `0.00036 USDC`, the research price.

## Research economics

The research tariff is **360 raw USDC (0.00036 USDC) per answer**. It is a documented demo subsidy, not a price that covers cost. It stays unchanged until a change is approved.

Measured on 2026-10-13:

- **Provider (Groq, `openai/gpt-oss-120b`, list price $0.15 and $0.60 per 1M input and output tokens).** A 13-question sample through the production `askGroq` path, with max 400 output tokens and reasoning effort low: input mean 552 tokens (max 608), output mean 86 (max 224), of which reasoning mean 26. All 13 finished with `stop`; none reached the 400-token cap. Provider cost per answer: mean 134.5 raw, p90 205, max 218. The backend now logs token counts for each answer (event `research_usage`, counts only).
- **Relayer gas per spend.** 2,112 raw (0.00211 USDC), 5.9 times the tariff. Capability open plus close: 22,460 raw (0.02246 USDC), paid by the relayer.
- **Hosting.** Render free plan, platform fee $0 (measured). Vercel plan not measured. The RPC is the public Arc endpoint, treated as zero.

Break-even price per answer, `P_min = gas + provider cost + (open + close + hosting) / uses`:

| Uses per capability | P_min (raw USDC), provider mean 134.5 | P_min with provider p90 205 |
|---|---|---|
| 1 | 24,707 (0.02471 USDC) | 24,777 (0.02478 USDC) |
| 10 | 4,493 (0.00449 USDC) | 4,563 (0.00456 USDC) |
| 100 | 2,472 (0.00247 USDC) | 2,542 (0.00254 USDC) |

At 360 raw each answer loses about 1,887 raw (0.00189 USDC) before capability overhead, mostly relayer gas. Do not claim profitability at this tariff. Not measured: Vercel hosting, and provider cost of real production tasks beyond the 13-question sample. To repeat the measurement, run `node packages/scripts/groq-usage-measure.mjs` (13 direct Groq calls, no Arc payment). Evidence: `packages/scripts/evidence/groq-usage-2026-10-13.json`.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `429` from `/v1/x402/decide` | Arc RPC read limit | Wait a few seconds and retry once |
| `eth_getLogs` error `-32012` | Block range over 10,000 | Page in ranges of 9,999 blocks or fewer |
| `eth_getLogs` error `-32014` | Load-balanced RPC node near the head | The backend retries with backoff, then returns `503 rpc_unavailable`. Nothing is decided from that read |
| Receipt shows as pending after a payment | Arc has not returned the receipt yet | This is not a failure. Check the transaction in the explorer with the hash shown before you retry |
| `signer_unavailable` or `signer_mismatch` | Local signer missing, locked, or holding a different agent | Run `pqtabs-signer status --agent <address>`. Nothing is broadcast when signing is refused |
| Refused with reason `balance` | Capability balance is zero or below the price | Check the capability's remaining balance; a capability with a zero balance still counts its cap toward exposure until it is closed |
| `503` `merchant_unconfigured` on quote | `MERCHANT_PAYEE` is not set | Set the variable on the backend |
| Answer says the sources do not cover a question | Model answer had no cited Arc fact | Ask a question covered by the cited facts. The payment is still a real receipt. |
| Local test fails on `dist/` files | Build step skipped | Run `npm test` from `backend/`, which compiles first |

## Developers

The Developer Page (`/developers` in the app) covers install, MCP setup, tools, and onboarding. The onboarding steps take a public agent address only and refuse anything that looks like a private key. They show an MCP configuration with no key.

The onboarding flow is:

1. Optional: connect a Circle developer-controlled EOA. The primary path does not need Circle credentials.
2. Install the local signer on Windows with `packages/pqtabs-signer/scripts/install-windows.ps1`, then create its key with `pqtabs-signer create` (or import a backup). Only the public address is shown in the browser.
3. Pair the signer with the app. The app asks for a signature over a fixed pairing message that carries the origin, a nonce, and an expiry. The signature authorizes nothing. The app checks it against the agent address, and each request confirms once (a second check of the same request is refused).
4. Authorize a capability through the root flow in the app. A session never stands in for this step.
5. Connect `pqtabs-mcp` 0.1.2 with `PQTABS_SIGNER_CLI` and `PQTABS_SIGNER_AGENT`.
6. Optional: start a read-only API session. The session can read root portfolios (`read:roots`) only. It cannot sign, open a capability, or spend, and you can revoke it from the page.

An encrypted backup import is for recovery and migration only. No private key, backup passphrase, or root secret goes through the browser, the backend, an AI chat, or an ordinary API response.

## Official Arc documentation

- [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints)
- [Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)
- [Consensus layer](https://docs.arc.io/arc/concepts/consensus-layer)
- [Stablecoin-native model (USDC gas)](https://docs.arc.io/arc/concepts/stablecoin-native-model)
- [Gas and fees](https://docs.arc.io/arc/references/gas-and-fees)
- [Contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Post-quantum security](https://docs.arc.io/arc/concepts/post-quantum-security)
- [Opt-in privacy](https://docs.arc.io/arc/concepts/opt-in-privacy)

## Roadmap

Only items marked **Live** run in production today.

| Item | Status | Basis |
|---|---|---|
| Bounded capabilities with a root-signed lifecycle | Live | mainnet receipts above |
| Post-quantum root verification (SLH-DSA-SHA2-128s) | Live | Arc docs: live on mainnet through the PQ verification precompile |
| Paid research answers with receipt matching | Live | mainnet receipts above |
| Native post-quantum wallet signing | Planned by Arc, not yet available | Arc docs: a future milestone |
| Arc Privacy Sector | Not yet available | Arc docs |
| Proof-of-stake validator set | Potential future transition, not live | Arc docs: consensus layer |
| Gas paid in other stablecoins | Not supported at launch | Arc docs: stablecoin-native model |
| Services beyond Arc research | Not built | This repository has one paid service |
| Delayed PQ recovery (`PQRootNext`) | Live for new roots | Factory `0x909AF4dFeEcDf8B72eaf918f185Cd89d460b0E63`. Existing roots stay on the original factory |
| Standard x402 `exact` settlement | Live on the research quote | Arclight settlement `0x9598e26d…73db` for 360 raw USDC |
| Idle-treasury yield | Wired on `PQRootNext` only | Galaxy vault `maxDeposit` was 0 on 2026-10-14. No deposit has been sent |

## Repository layout

| Path | Contents |
|---|---|
| `contracts/` | `PQRoot`, `RootFactory`, and the Foundry tests |
| `signer/` | Rust SLH-DSA signer used by the browser |
| `backend/` | Hono API, indexer, policy checks, relayer, research pipeline |
| `frontend/` | Next.js app and landing page |
| `deployments/mainnet.json` | deployed addresses and transaction hashes |
| `packages/` | `pqtabs-sdk` (TypeScript client), `pqtabs-mcp` (stdio MCP server), `pqtabs-signer` (Windows local signer CLI) |
| `scripts/` | pins check and secret scan |

## License and contact

See the repository for license terms. Issues and questions are welcome on [GitHub](https://github.com/mohamedwael201193/PQTABS/issues).
