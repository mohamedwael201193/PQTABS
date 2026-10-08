# Security blast radius

| Compromise | What is proven | What is not |
|---|---|---|
| Agent key | The key signs one tab. Receipt `0x399e5e89…35ca` in block 24,623,376 has status `0x0`: registrar `0xf76e6B…71a3` called USDC and the forbidden payee did not succeed. Receipt `0x971e0398c5764601c21e4f858940d936088f3d5a3b3dcb06a6b3f230ae78ddbc` in block 24,826,606 has status `reverted`. The relayer called USDC with a 213-byte blob of `0x11`, value `10001` (one above this tab's `maxPerCall` of `10000`), and closed tab `0x5637…3837`. `isValidSignature` returned `0xffffffff`. The simulation reason was `FiatTokenV2: invalid signature`. The receipt has 0 logs. The tab's USDC balance was 0 before and after. `decideSpend` still refuses the wrong payee, an over-max amount, a short balance, a closed or expired capability, the wrong agent, and exposure above the ceiling. | The closed tab returns invalid before it checks `maxPerCall`, so this receipt does not isolate an over-limit refusal. No open tab was available for that test. |
| Relayer | `relay` simulates, then broadcasts the calldata it was given. It does not hold the PQ seed or the agent key. It can delay a signed payload. It cannot change the root action inside a valid PQ signature. | Censorship was not measured as an uptime test. |
| Backend | The process does not sign PQ. Spend now refuses on policy before send. A stolen host can still submit a payload the user already signed. | — |
| Database | Rows are derived. Portfolio reads do not overwrite chain state. `scripts/rebuild-index.mjs` deletes rows and reads Arc again. | A live test that a closed tab still shown as open in a stale row is corrected on the next reconciliation was not repeated in this audit. |
| Frontend | A payment is not marked successful before a receipt. The PQ key is not sent to the server. | A hostile page on the same origin can use the IndexedDB wrap key, because that key has no passphrase. |

Losing the PQ backup leaves that root without an authority. The contract has no operator recovery. Reclaim after expiry still does not need the root key.
