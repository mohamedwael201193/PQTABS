# x402

Checked 2026-10-08 from https://docs.x402.org/core-concepts/client-server and https://x402.org/x402-batch-settlement/.

A real single payment is:

1. Request the resource with no payment.
2. Receive HTTP 402 and `PAYMENT-REQUIRED`.
3. Evaluate that price, asset, network, and payee with `decideSpend`.
4. Retry with `PAYMENT-SIGNATURE`.
5. Settle on Arc.
6. Return the resource only with `PAYMENT-RESPONSE` after the receipt.

`exact` settles one payment. Batch settlement is a different scheme and is not required here.

PQTABS does not perform those steps. There is no facilitator client, no 402 parser, and no stored payment-required document. A button that pays a tab is not an x402 request. Nothing in this repo returns a fake 402.
