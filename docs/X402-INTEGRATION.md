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
- payee `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9`
- resource `https://arcrouter.co/v1/chat/completions`

The same document also offers Base (`eip155:8453`) for the same amount. `arcQuote` ignores that entry.

An earlier request that did not carry a parsed chat body also returned HTTP 402, with Arc amount `4`. The quoted ceiling changed with the request. That earlier amount is not the price of the `max_tokens` 16 request.

A Python client then received HTTP 403 from Cloudflare, error 1010, with no `PAYMENT-REQUIRED` header. That is not a price.

## What the code does

`decideHttpPayment` in `backend/src/index/x402.ts` returns `NO_PAYMENT` / `service_unavailable` for any status other than 402. On a 402 it keeps only the Arc exact USDC requirement and passes that amount and payee to `decideSpend`. `backend/test/x402.test.ts` uses the captured amount-12 document. With `maxPerCall` 10 the decision is `REFUSE` / `max_per_call`. The same capability allows amount 4. A payee of `0xC485…3044` is `wrong_payee`. A Base-only document is `no_arc_exact`.

No signature was sent to ArcRouter. A throwaway EIP-3009 signature was sent only to `POST /v1/relay/spend`. Amount `4` against the quote of `12` returned `quote_mismatch` and no chain reason. Amount `12`, signed by a key that is not the tab's agent, returned `capability_inactive,wrong_agent,wrong_payee,balance`. Neither response contained a transaction hash.

ArcRouter's own description says the resource is returned only after a retry that carries `PAYMENT-SIGNATURE`, and that its facilitator broadcasts the transfer. PQTABS does not send that header. A chain receipt, if one existed, would still not be the model output.

The live descriptor at `https://arcrouter.co/.well-known/x402` names the Arc facilitator `https://facilitator.arcusnetwork.co`. `GET /supported` lists `exact` on `eip155:5042`. `POST /verify` does not include a transaction hash. Two verifies were sent and `/settle` was not called.

`eth_call` of USDC `name()` returned `USDC` and `version()` returned `2`. A verify whose `extra.name` was `USD Coin` returned `invalid_exact_evm_token_name_mismatch`. A verify signed over the domain name `USDC`, version `2`, chain id 5042, and the USDC contract, with `from` equal to the signer, returned `isValid: false` and `invalid_exact_evm_signature`. A 213-byte blob whose `from` was closed tab `0x5637…3837` returned the same signature reason. Neither response contained a transaction. Whether that facilitator accepts an ERC-1271 blob from an open tab is still unknown, because no open tab signed these calls.

`POST /v1/x402/decide` reads the tab from Arc and runs that same decision. It does not relay. `POST /v1/relay/spend` refuses with `quote_mismatch` unless the signed amount and recipient are the Arc requirement in `paymentRequired`. The capability screen asks the service for a price and signs only when the decision is `ALLOW`.
