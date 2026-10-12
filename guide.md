# Arc mainnet guide for the next agent

This file is the record of what broke while building PQTABS on Arc mainnet, and the fix that was proven on chain. Use it before writing a paid agent, a root, or a USDC indexer. Do not treat `workshop.md` as an API spec. That file is an interview. The chain facts below were read from Arc, from the contracts, and from the receipts named here.

The product shape that must stay intact: a human wallet opens a post-quantum root, the root opens a bounded capability, an ECDSA agent spends only inside that capability, and a relayer broadcasts. A wallet signature must not move root funds. The backend must not store the post-quantum private key.

## Chain

- Arc mainnet chain id is `5042` (`0x13b2`). RPC: `https://rpc.mainnet.arc.io`. A second RPC that answered the same reads: `https://arc.drpc.org`. Explorer: `https://explorer.arc.io`.
- Gas is native USDC at 18 decimals. There is a `maxFeePerGas` floor of 20 gwei. A transaction with a lower fee is rejected before it is broadcast.
- ERC-20 USDC is 6 decimals at `0x3600000000000000000000000000000000000000`. One economic transfer emits two logs: an 18-decimal `Transfer` from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`, and a 6-decimal `Transfer` from USDC. Count one of them. This project counts the 6-decimal log. Use the log `from`, not `tx.from`. A native value transfer (empty calldata, `tx.value`) emits only the 18-decimal system log.
- Order activity by `blockNumber` then `logIndex`. Finality is inclusion.
- `eth_getLogs` over more than a few thousand blocks returns `-32012`. Page the range.
- The public RPC returns HTTP 403 to some Python clients. The same body with user-agent `cast/1.8.5` succeeded. The RPC also returns HTTP 429. A 429 is not a signature failure. Say that Arc is busy, and do not claim a signature was rejected.
- The USDC proxy bytecode does not contain the function selectors. EIP-1967 implementation slot was empty. `implementation()` selector `0x5c60da1b` returned `0xc6ad664ac6679f4ce74e10e91449c93ec1ae3ca6`. That code contains both `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)` (`0xcf092995`) and the `v,r,s` overload (`0xe3ee160e`). Do not treat proxy storage slot 0 as the implementation.

## Post-quantum root

- Root authority is SLH-DSA, verified by the Arc precompile `0x1800000000000000000000000000000000000004`, selector `verifySlhDsaSha2128s(bytes,bytes,bytes)` = `0xbf4db8ba`. Empty context. Official vectors live in `circlefin/arc-node`.
- A valid signature is 7856 bytes. One flipped byte returns false. One truncated byte reverts `Invalid signature length`.
- The relayer cannot create a root. An agent key cannot raise its cap, add a recipient, or extend expiry.
- Do not rotate a root because a backup file failed to open. Do not brute-force a backup. A chat passphrase is compromised the moment it is typed in chat. Never write a passphrase, a signing key, or a relayer key into history, git, logs, or prompts.
- RootFactory `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` and the PQRoot implementation are a Sourcify `match`, not `exact_match`, because the deployed bytecode omitted the metadata hash. Do not redeploy the factory to chase an exact match.

## MetaMask warning

MetaMask showed a high-risk dialog on root creation `0xb63ea901e91e4673a840fe0c03862f47c1995d0fd1f788bfcfcf42f06f9a526e`. That transaction has value 0, targets the factory, and emits `ExposureSet` and `RootCreated`. It transfers no USDC.

What was tried: `POST https://report.blockaid.io/api/submitDappForm` returned HTTP 200 `OK` and no reference id. `https://report.blockaid.io/mistake` requires an email, so it was not filed. The Arc explorer lists the factory `is_scam` false and reputation `ok`.

What not to do: do not change wallet code to hide the dialog. Arc is not in MetaMask's list of networks for security alerts (`https://support.metamask.io/configure/wallet/security-alerts/`), so the label is best-effort. A later deposit of USDC showed a normal Sent USDC confirmation. The warning was later reported gone. The Blockaid POST is not proof that Blockaid cleared it.

A different failure: wallet `0x18398aA1dFdA63F30529c46E90ac41c1E75F7Ecf` is stolen. Its code is an EIP-7702 delegation. A 0.05 USDC transfer to it was forwarded in the same transaction to `0x38ec1030098bb0f51488064ec2d408502ea47f2b`. Do not send anything there. An unfunded `createRoot` fails with `insufficient funds for gas * price + value` and produces no transaction hash.

## The paid task

The capability signs a 213-byte authorization. Bytes `[0:65]` are the agent ECDSA signature. The rest is the recipient, value, validity window, and nonce. `authorization.from` is the capability contract, not the agent. USDC calls the capability's ERC-1271 `isValidSignature`. The magic value is `0x1626ba7e`.

ArcRouter (`https://arcrouter.co/v1/chat/completions`) is a useful quote. An unpaid POST with `max_tokens` returns HTTP 402, x402 version 2, scheme `exact`, network `eip155:5042`, asset USDC, payee `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9`. Ignore the Base accept on `eip155:8453`. ArcRouter binds settlement to `https://facilitator.arcusnetwork.co` (`https://arcrouter.co/.well-known/x402`).

That facilitator rejects the genuine 213-byte authorization with `invalid_exact_evm_signature`. Its verify page recovers a signature to `authorization.from`. The 65-byte prefix recovers to the agent, and `from` is the capability, so ecrecover fails. `GET /supported` lists `exact` and `batch-settlement` on `eip155:5042` and does not mention ERC-1271. The batch authorizer had no code. Do not send the same signature to Arcus again.

Reference x402 code can route a non-65-byte signature to ERC-1271. Arcus was not running that verifier. Circle's facilitator accepts a deployed ERC-1271 account and names Arc, but a Circle settle binds `payTo` to the seller's Circle account, so it cannot pay ArcRouter. An empty Circle API key cannot call it.

The Arc Research quote is now `POST /v1/research/quote` on the PQTABS backend. The scheme is `pqtabs-barkeep`, `standardExact` is false, and the price is the configured tariff. It is not an ArcRouter 402 and not an `exact` EIP-3009 quote. `MERCHANT_PAYEE` is `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`. Do not use the relayer, the registrar, or the root as that address. Capability `0x586E42Da69529A4665D4644e6FDe5fdAa4aeA321` was closed in `0x95b41eb8129d75b7d0092e0f54916622514f8b6a4ecc130eb29cb8068e4b80fa`, status success, block `25521489`. That receipt returned `9968` raw USDC from the capability to the root. The capability is closed, `needsSweep` is false, and its balance is `0`. After that close, root cash was `9968` and open exposure was `0`. `maxOpenExposure` stayed `10000`. Capability `0x7D627201477f192DBB3dC5E7e993aeF6701F302d` then opened in `0x2c44da611a7ea7ebd2e4dffbf6cf0a13c8ddffd482048132da078b459d4ea216`, status success, block `25523259`. One 6-decimal USDC log moved `360` raw units from the root to that capability. The agent is `0x2c0e47e0950e7fE6C62D5F4E70d8C0b51d8B4865`. The cap and per-payment maximum are `360`. The only payee is the merchant. Root cash is now `9608`. Open exposure is `360`. The ceiling is still `10000`.

The path that settled the receipt below posted the 213-byte blob to `POST /v1/relay/spend`. The relayer calls USDC `transferWithAuthorization` with the `bytes` signature. USDC calls the capability. Call a model only after the receipt has exactly one 6-decimal USDC log from the capability to the quoted payee for that amount.

Proven settlement: `0x1352cc1963ee0e62c0c04ff634412c4257327755a9d5cf58eefe113d14b2e4a5`, status success, block `25501796`. It moved 32 raw USDC (`0.000032`) from capability `0x586E42Da69529A4665D4644e6FDe5fdAa4aeA321` to ArcRouter. The capability balance became `9968`. The answer came from Pollinations model `gpt-oss-20b` at `https://text.pollinations.ai/openai`. The charged amount is the quoted ceiling. No unused-ceiling refund was observed, so do not claim one. Current Pollinations generation docs require `Authorization: Bearer` on `https://gen.pollinations.ai`. No key is configured. An empty or unauthorized model response stays `result_pending`.

That receipt paid ArcRouter because the open capability allowlists only ArcRouter. The current Arc Research quote names `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`, tariff `360` raw USDC, Groq model `openai/gpt-oss-120b`, and `max_tokens` `400`. Groq's published price is `$0.15` per 1M input tokens and `$0.60` per 1M output tokens. `360` raw USDC is the ceiling for 800 input tokens and 400 output tokens. It is not a measured Groq invoice. The old `32` raw tariff does not cover that ceiling. The exposure ceiling was not raised. The create form now accepts a cap of `0.00036` USDC, which is `360` raw units. The earlier minimum of `0.01` USDC was larger than the `9968` raw units in root cash, and a two-decimal slider rounded `0.000360` away. That capability is open. One Arc Research task settled on it. Quote `275399b2-48eb-4a3e-bfc1-b54535961856` is scheme `pqtabs-barkeep`, `standardExact` false, amount `360`, asset USDC, network `eip155:5042`, payee the merchant, provider Groq, model `openai/gpt-oss-120b`. The spend was `POST /v1/relay/spend` and `replayed` was false. Receipt `0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15` is success in block `25523733`. The relayer called USDC. The 6-decimal log moves `360` raw units from `0x7D627201477f192DBB3dC5E7e993aeF6701F302d` to `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`. The 18-decimal twin is `360000000000000` and is the same transfer. The capability balance is now `0`. Root cash stayed `9608`. Open exposure stayed `360` because the cap is still open. The result route returned status `complete` for that hash, model `openai/gpt-oss-120b`, and a non-empty answer that stops at the 400-token cap. Chrome shows that answer, the receipt, and remaining `0 USDC`. This is not an ArcRouter `PAYMENT-RESPONSE` and not standard `exact`. Asking again would be a new charge, and this capability has no balance left.

The first click of that attempt returned `rate_limited` and broadcast nothing. The capability balance stayed `10000`. A second click with a new authorization settled once. A retry of identical calldata is idempotent on one backend instance. A new click is a new nonce and a new charge.

`backend` `npm test` used to include `live.test.ts`. That test called `readPortfolio`, which walks every log window from factory block `24623258` to head, and the Node test runner's default timeout is infinite. The process stayed in that RPC loop after the last unit suite. The live command is now `npm run test:live`. It reads the chain id, the factory implementation, and this one receipt. It does not scan history. Pass `AbortSignal` from the test into `loadClients` so the deadline closes the HTTP calls.

## What not to do

- Do not set `authorization.from` to the agent EOA. That spends as a wallet and leaves the capability.
- Do not label the 213-byte flow as standard `exact` EIP-3009. The exact scheme's first check is a 65-byte recovery to `from`.
- Do not mark a task paid without a receipt and a real model answer. Do not invent the answer.
- Do not pay a recipient the capability did not allow. Do not bypass the cap, the per-payment limit, or the expiry.
- Do not add the 18-decimal log to the 6-decimal log.
- Do not open another capability while open exposure already equals the ceiling and root cash is 0. Closing a capability before expiry needs the post-quantum signature. Permissionless reclaim is only after expiry. After the close above, a `360` raw capability fits under the `10000` ceiling. Do not open a `0.01` USDC capability against the remaining `9968` raw units.
- Do not store the post-quantum key in the browser backup store, in `localStorage`, or on the server.

## Resources

- Arc precompile and vectors: `https://github.com/circlefin/arc-node`
- Barkeep payment layout, pin `60f4b6082ec6bf88d2283201ea1e9e5f0f760901`: `https://github.com/barbarosalagoz/barkeep-arc/blob/60f4b6082ec6bf88d2283201ea1e9e5f0f760901/docs/HOW_IT_WORKS.md`
- x402 exact EVM scheme: `https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md`
- x402 v2 payment flow: `https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md`
- Circle facilitator and ERC-1271: `https://developers.circle.com/facilitator-service/how-it-works`
- ArcRouter discovery: `https://arcrouter.co/.well-known/x402`
- Arcus supported kinds: `https://facilitator.arcusnetwork.co/supported`
- MetaMask security-alert networks: `https://support.metamask.io/configure/wallet/security-alerts/`
- ERC-1271 and EIP-3009 are the standard names for `isValidSignature` and `transferWithAuthorization`.
## Balance, spent, and answer rules (2026-10-12)

- One source for capability money. The backend reads each unswept capability's USDC balance from Arc, and the frontend displays `balanceUsd`, `balanceKnown`, `spentUsd`, and `spentKnown` from `/v1/roots/:address/portfolio`. Card, drawer, closed list, and receipt must read those fields. Do not derive spent from a stored balance, a receipt, or a cap minus a stored value.
- Spent while open is cap minus the live balance. Spent once closed is the sum of verified `spend` payments whose payee is not the root. A failed or rate-limited read is unknown. Show "Spent not confirmed" or "-" and do not show zero. Never fall back to the stored `usdc_balance` for a capability.
- Available means the live capability balance. Agent reachable is the sum of available balances on open capabilities. Root cash is the root's own USDC and is not reachable by an agent.
- A closed capability shows its verified spent amount `of` the cap. The cap alone is not a balance.
- Answers render as GitHub-flavoured Markdown. The page needs `remark-gfm`, or pipe tables print as text. Keep the `pqtabs-barkeep` scheme name and `standardExact: false`. Do not call the payment standard x402 `exact`, and do not claim an ArcRouter `PAYMENT-RESPONSE`.
- An answer that stops mid-sentence is labelled incomplete. A factual correction of the model text carries a source link. Do not replace a model claim with a generalization that has no source.
- Changing `max_tokens` changes the quote body hash, so it changes every quote. Change it only with a new quote flow and a test.

## Payment economics (measured, not yet approved for change)

- Gas comes from chain receipts: fee in raw 6-decimal units is gasUsed x effectiveGasPrice / 1e12. Measured on 2026-10-12: spend about 2,112 raw, open about 12,738 raw, close about 9,724 raw. The relayer pays this gas, so it is a demo subsidy and not a price.
- The research tariff is 360 raw. Net per task before overhead is negative at that price (about -1,786 to -2,112 raw). Break-even before overhead is about 2,146 to 2,472 raw.
- Per-capability overhead is about 22,462 raw, divided across the payments in that capability. A one-payment capability cannot be sustainable at this price.
- A price or cap change is a product decision. Do not apply it, and do not claim profitability, without an explicit user approval and fresh receipts. The HISTORY entry for 2026-10-12 has the working figures.
