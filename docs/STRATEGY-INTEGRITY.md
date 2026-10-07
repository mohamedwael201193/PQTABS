# Strategy integrity

PQTABS does not choose a market. There is no price feed, no model, and no random draw.

A spend is allowed only by `decideSpend` in `backend/src/index/decide.ts`. Changing any of these inputs can change the result: the service being available, the capability being open, the time against expiry, the signer against the tab agent, the payee against the allowlist, the amount against `maxPerCall`, and the amount against the tab balance. Opening a capability is refused by `decideOpen` when `openExposure + cap` would pass `maxOpenExposure`.

`backend/test/decide.test.ts` checks allow, over max, over balance, wrong payee, expiry, wrong agent, closed capability, unavailable service, and exposure. Those are local inputs. They are not a mainnet payment.

The relay calls `decideSpend` before `eth_sendRawTransaction`. A refusal returns `policy_refused` and does not broadcast. The signer is not recovered in that route, so `agent_matches` is not claimed there. The tab contract still checks the agent signature during simulation. On Render `dep-db3dig8473hc73bdqt50`, closed tab `0x5637…3837` with amount `1000000000` returned `capability_inactive,max_per_call,balance`. No transaction hash exists for that call.

What is not proven: a real HTTP 402, a paid resource, a decision record stored for a mainnet payment, or an agent continuing a task without a person clicking pay. Those are absent, not simulated.
