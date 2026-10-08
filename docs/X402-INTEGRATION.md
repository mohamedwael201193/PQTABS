# x402

Checked 2026-10-08.

The v2 HTTP transport uses status 402 and a base64 `PAYMENT-REQUIRED` header. One payment uses scheme `exact`. Batch settlement is a different scheme and is not used here. Sources: https://docs.x402.org/core-concepts/client-server and https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md.

## What was requested

`POST https://arcrouter.co/v1/chat/completions` with `llama-3.3-70b-instruct`, one short user message, and `max_tokens` 16. No `PAYMENT-SIGNATURE` header was sent.

## What came back

HTTP 402. The `PAYMENT-REQUIRED` header decoded to the same JSON as the body.

Arc requirement, scheme `exact`:

- network `eip155:5042`
- asset `0x3600000000000000000000000000000000000000`
- amount `12` raw USDC
- payee `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9`. The new-capability screen reads this from a live HTTP 402 and adds it only when that response names an Arc recipient. It does not sign.
- resource `https://arcrouter.co/v1/chat/completions`

The same document also offers Base (`eip155:8453`) for the same amount. `arcQuote` ignores that entry.

An earlier request that did not carry a parsed chat body also returned HTTP 402, with Arc amount `4`. The quoted ceiling changed with the request. That earlier amount is not the price of the `max_tokens` 16 request.

A Python client then received HTTP 403 from Cloudflare, error 1010, with no `PAYMENT-REQUIRED` header. That is not a price.

## What the code does

A payment signature uses Arc's clock from `GET /v1/time`. The laptop clock is not the deadline. If that clock cannot be read, nothing is signed.

`decideHttpPayment` in `backend/src/index/x402.ts` returns `NO_PAYMENT` / `service_unavailable` for any status other than 402. On a 402 it keeps only the Arc exact USDC requirement and passes that amount and payee to `decideSpend`. `backend/test/x402.test.ts` uses the captured amount-12 document. With `maxPerCall` 10 the decision is `REFUSE` / `max_per_call`. The same capability allows amount 4. A payee of `0xC485…3044` is `wrong_payee`. A Base-only document is `no_arc_exact`.

No signature was sent to ArcRouter. A throwaway EIP-3009 signature was sent only to `POST /v1/relay/spend`. Amount `4` against the quote of `12` returned `quote_mismatch` and no chain reason. Amount `12`, signed by a key that is not the tab's agent, returned `capability_inactive,wrong_agent,wrong_payee,balance`. Neither response contained a transaction hash.

ArcRouter's own description says the resource is returned only after a retry that carries `PAYMENT-SIGNATURE`, and that its facilitator broadcasts the transfer. PQTABS does not send that header. A chain receipt, if one existed, would still not be the model output.

The live descriptor at `https://arcrouter.co/.well-known/x402` names the Arc facilitator `https://facilitator.arcusnetwork.co`. `GET /supported` lists `exact` on `eip155:5042`. `POST /verify` does not include a transaction hash. Two verifies were sent and `/settle` was not called.

`eth_call` of USDC `name()` returned `USDC` and `version()` returned `2`. A verify whose `extra.name` was `USD Coin` returned `invalid_exact_evm_token_name_mismatch`. A verify signed over the domain name `USDC`, version `2`, chain id 5042, and the USDC contract, with `from` equal to the signer, returned `isValid: false` and `invalid_exact_evm_signature`. A 213-byte blob whose `from` was closed tab `0x5637…3837` returned the same signature reason. Neither response contained a transaction. `readVerify` treats both of those live bodies as `NO_PAYMENT`. `isValid: true` is also `NO_PAYMENT`, because verify does not broadcast. `readSettlement` accepts a facilitator body only when `success` is true and `transaction` is a 32-byte hash. That hash was not returned by these calls.

`coinbase/x402` main is commit `dd927a26cfefc98c24b3ec38b3a8f204dad0c60d`, dated 2026-04-21. `ExactEvmScheme.verify` uses EIP-3009 unless the payload is Permit2. `verifyEIP3009` treats a signature longer than 65 bytes as a contract signature. If typed-data verification fails and the payer has bytecode, that length is not itself `invalid_signature`. The next step simulates `transferWithAuthorization` with the full signature bytes. When that simulation fails and the payer balance is below the amount, the diagnosis returns insufficient balance. The live verify of the 213-byte garbage blob used a tab whose balance was 0 and returned `invalid_exact_evm_signature`. That response does not follow this diagnosis. The running facilitator is not shown to be this commit. No further verify was sent. The client still adds `assetTransferMethod: eip3009` because the live verifier required that field for a 65-byte signature. This published router does not read that field.

The current Coinbase exact verifier hashes `TransferWithAuthorization` over name, version, chain id, and the token address, with the amount fields as base-10 strings and the nonce as 32 bytes. That is the encoding the refused EOA verify already sent. A local recovery of that same typed data matches the signer. `DOMAIN_SEPARATOR()` on Arc USDC equals that domain: `0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84`. `eip712Domain()` reverts.

An `eth_call` of both `transferWithAuthorization` overloads on `https://rpc.mainnet.arc.io`, using a throwaway unfunded signer and that same domain, reverted with `ERC20: transfer amount exceeds balance`. The token checked the signature before the balance. One later `POST /verify` of a new signature in that same encoding still returned `isValid: false`, `invalid_exact_evm_signature`, and no transaction. The current TypeScript verifier returns that reason when the typed-data hash throws or `eth_getCode` throws, and it does so before the balance simulation. An unfunded signature that reached simulation would be `invalid_exact_evm_insufficient_balance`. The live response was not that reason. `/settle` was not called.

A signature over domain name `USD Coin`, with `extra.name` set to `USDC`, also returned `invalid_exact_evm_signature` and no transaction. The facilitator does not accept that signature in place of the token domain.

The same USDC signature, with `extra.assetTransferMethod` set to `eip3009`, returned `invalid_exact_evm_insufficient_balance` and no transaction. The signature check passed. The unfunded account failed the balance check. `readVerify` treats that body as `NO_PAYMENT`. `arcPaymentAccept` adds the method field to the Arc accept from the captured 402. `/settle` was not called.

The signature's `validBefore` is the service timeout, and it is never later than the capability expiry. The official exact client uses `now + maxTimeoutSeconds`. The captured ArcRouter requirement sets that timeout to 60 seconds. A facilitator verify of an unfunded signature with `validBefore` seven days ahead returned HTTP 500 `unexpected_verify_error` and no transaction. A signature window of about one minute, with the same method field, had previously reached `invalid_exact_evm_insufficient_balance`. `/settle` was not called.

The capability screen retries the priced request with a `PAYMENT-SIGNATURE` header. That header uses the Arc accept, adds `assetTransferMethod: eip3009`, and carries the 213-byte tab blob. Barkeep's `isValidSignature` requires those 213 bytes. This client does not also call the spend relay. A response that is not HTTP 200, or a payment response without a 32-byte transaction hash, is not recorded as paid. After that hash, the client waits for the Arc receipt and records the payment only when the receipt succeeded and one 6-decimal USDC `Transfer` log matches the tab, the payee, and the amount. The native 18-decimal twin does not count. A receipt without an assistant reply is not treated as a completed task, and no further payment is sent. No open capability was available, so this retry was not sent. A fresh `POST` to that chat URL on 2026-10-08 again returned HTTP 402, amount `12`, timeout 60, payee `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9`, with no `assetTransferMethod`. `POST /v1/x402/decide` for the closed tab returned `REFUSE` and no transaction.

Closed tab `0x56377522376b5273a97313992c7970B106cB3837` has bytecode and a USDC balance of 0. Its `isValidSignature` for a 213-byte blob returned `0xffffffff`. An `eth_call` of USDC `transferWithAuthorization` with `from` set to that tab and the same blob reverted `FiatTokenV2: invalid signature`. Receipt `0x971e0398c5764601c21e4f858940d936088f3d5a3b3dcb06a6b3f230ae78ddbc` is that call broadcast: status `reverted`, block 24,826,606, from the relayer to USDC, value `10001`, gas used 57,470, 0 logs, and the tab balance still 0. The closed check fired before `maxPerCall`. The earlier unfunded EOA call of that function reverted `ERC20: transfer amount exceeds balance`, which is the result after the token accepts a signature. `POST /verify` of this blob, with `from` set to the tab and `extra.assetTransferMethod` set to `eip3009`, returned `invalid_exact_evm_signature` and no transaction. That response does not show whether the facilitator called the tab. `/settle` was not called, and no `PAYMENT-SIGNATURE` was sent to ArcRouter.

`POST /v1/x402/decide` reads the tab from Arc and runs that same decision. It does not relay. `POST /v1/relay/spend` refuses with `quote_mismatch` unless the signed amount and recipient are the Arc requirement in `paymentRequired`. The capability screen asks the service for a price and signs only when the decision is `ALLOW`.
