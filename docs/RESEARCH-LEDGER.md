# Research ledger

Facts used by the current build. Status is VERIFIED when this environment observed it, DOCUMENTED when an official page or repository states it, and INFERRED when it follows from those without a fresh observation.

| Fact | Source | Checked | Status |
|---|---|---|---|
| Arc mainnet chain id is 5042 | https://docs.arc.io/ | 2026-10-07 | DOCUMENTED. `eth_chainId` was `0x13b2` in phase 2. |
| `eth_getLogs` rejects a range at or above 10,000 blocks with `-32012` | https://docs.arc.io/integrate/infrastructure/indexing-events | 2026-10-07 | DOCUMENTED. The indexer pages at 2,000. The legacy scanner pages at 9,999. |
| Finality is deterministic. Do not build reorg rollback. | https://docs.arc.io/arc/concepts/deterministic-finality | 2026-10-07 | DOCUMENTED. Ordering is block number plus log index. |
| SLH-DSA-SHA2-128s precompile is `0x1800000000000000000000000000000000000004` | https://docs.arc.io/arc/references/evm-differences and `circlefin/arc-node` `IPQ.sol` | 2026-10-07 | VERIFIED. Phase 2 `eth_call` accepted a 7856-byte signature and rejected a flipped byte. |
| Native USDC and the ERC-20 face are the same balance. Display divides raw by 1e6. Gas spends do not emit an ERC-20 Transfer. | Arc docs, USDC `0x3600…0000` | 2026-10-07 | DOCUMENTED. The indexer follows ERC-20 Transfer from known tabs. |
| One ERC-20 transfer emits two logs. Count only `0x3600…0000` at 6 decimals. Ignore `0xffff…fffe` at 18 decimals. Gas emits no Transfer. EIP-3009 payer is the log `from`. | https://docs.arc.io/arc/references/usdc-system-events and https://docs.arc.io/integrate/infrastructure/indexing-events | 2026-10-08 | DOCUMENTED. `erc20SpendRaw` drops the native emitter. |
| `arc-node` README still discusses testnet while the docs say mainnet is live | https://github.com/circlefin/arc-node | 2026-10-07 | DOCUMENTED. The docs win for chain id 5042. |
| Render free web service disks are ephemeral | Render docs, service `srv-db2mqpvavr4c73elkt60` | 2026-10-07 | DOCUMENTED. The embedded database is not started on Render. |
| Production derived state is Supabase Postgres 17 through the session pooler | This environment's connection check and row copy | 2026-10-07 | VERIFIED. 2 roots, 6 capabilities, 27 activity rows, 1 cursor. The password is not in the repo. |
| A known-root portfolio read does not call Arc | `backend/src/index/portfolio.ts` on `fbbd232`, measured HTTP 200 | 2026-10-07 | VERIFIED. 0.62s and 0.96s. Not a P50. |
| Arc mainnet accepts `eth_subscribe("newHeads")` on `wss://rpc.mainnet.arc.io` | One subscription from this environment | 2026-10-07 | VERIFIED. The acknowledgement returned a subscription id, then a head arrived with `number` and `timestamp`. |
| Barkeep owner can drain the treasury. The agent spends only the tab. | https://github.com/barbarosalagoz/barkeep-arc `60f4b608` | 2026-10-07 | DOCUMENTED. `Tab.sol` is not vendored here. Tests use `MockBarkeep`. |
| arc-guard uses a PQ vault and a 7-day wallet exit | https://github.com/Jayanthkoppala/arc-guard | 2026-10-07 | DOCUMENTED. It is not a spending capability. |
| Pigeonhole pages logs and keeps no database | https://github.com/edycutjong/pigeonhole | 2026-10-07 | DOCUMENTED. |
| ERC-8004 `agentId` to wallet is not used | https://docs.arc.io/arc/references/contract-addresses and `eth_getCode` on 2026-10-08 | 2026-10-08 | DOCUMENTED addresses, VERIFIED 130 bytes of code at each. A registry pointer does not bound a tab. Left out of v1. See `docs/ERC8004-INTEGRATION.md`. |
| `POST https://arcrouter.co/v1/chat/completions` for `llama-3.3-70b-instruct` with `max_tokens` 16 returns HTTP 402, Arc exact USDC amount `12`, payee `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9` | The response body and the `PAYMENT-REQUIRED` header, which matched | 2026-10-08 | VERIFIED. No `PAYMENT-SIGNATURE` was sent. A Base accept in the same body is ignored. An earlier 402 quoted amount `4`. A Python user-agent received Cloudflare 403 and no price. |
| ArcRouter's Arc facilitator is `https://facilitator.arcusnetwork.co` and it lists `exact` on `eip155:5042` | `https://arcrouter.co/.well-known/x402` and `GET /supported` | 2026-10-08 | VERIFIED. `POST /verify` returned `isValid: false` for a USDC domain signature and for a 213-byte blob. `extra.name` of `USD Coin` returned `invalid_exact_evm_token_name_mismatch`. USDC `name()` is `USDC` and `version()` is `2`. `/settle` was not called. No transaction was returned. |
| Arc USDC accepts an unfunded EIP-3009 signature. The ArcRouter facilitator does not. | `eth_call` `transferWithAuthorization` on `https://rpc.mainnet.arc.io`, and `POST https://facilitator.arcusnetwork.co/verify` | 2026-10-08 | VERIFIED. The token reverted with `ERC20: transfer amount exceeds balance`. `DOMAIN_SEPARATOR()` is `0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84`. Verify of that domain returned `invalid_exact_evm_signature`. A `USD Coin` signature with `extra.name` `USDC` returned the same reason. `/settle` was not called. |

Do not search these sources again unless a later measurement contradicts a row.
