# Strategy integrity

PQTABS does not choose a market. There is no price feed, no model, and no random draw.

A spend is allowed only by `decideSpend` in `backend/src/index/decide.ts`. Changing any of these inputs can change the result: the service being available, the capability being open, the time against expiry, the signer against the tab agent, the payee against the allowlist, the amount against `maxPerCall`, and the amount against the tab balance. Opening a capability is refused by `decideOpen` when `openExposure + cap` would pass `maxOpenExposure`.

`backend/test/decide.test.ts` checks allow, over max, over balance, wrong payee, expiry, wrong agent, closed capability, unavailable service, and exposure. Those are local inputs. They are not a mainnet payment.

The relay recovers the ECDSA signer from the 213-byte blob and compares that address with the tab's agent before it reads Arc. A blob whose payee, amount, window, or nonce differs from the request returns `tampered_action` and does not call Arc. A signature that does not recover returns `invalid_signature`. `backend/test/spend-blob.test.ts` signs a throwaway key and checks both cases. That test is local. On Render `dep-db3dna6q1p3s73f4dki0` of `66b4a28`, a blob whose amount did not match the request returned `tampered_action`, and a 213-byte blob with an unrecoverable signature returned `invalid_signature`. Neither response included a chain reason, and neither broadcast a transaction. On the previous deploy, closed tab `0x5637…3837` with amount `1000000000` and no blob returned `capability_inactive,max_per_call,balance`.

What is not proven: a real HTTP 402, a paid resource, a decision record stored for a mainnet payment, or an agent continuing a task without a person clicking pay. Those are absent, not simulated.
