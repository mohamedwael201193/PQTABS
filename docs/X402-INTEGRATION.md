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

No signature was created. No facilitator was called. No Arc transaction was broadcast. A 402 is not a receipt.
