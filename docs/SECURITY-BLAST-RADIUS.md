# Security blast radius

| Compromise | What is proven | What is not |
|---|---|---|
| Agent key | The key signs one tab. HISTORY records a mainnet payment that reverted for a payee that was not on the tab, and `isValidSignature` `0xffffffff` for the wrong payee, an over-max amount, and the wrong agent. `decideSpend` refuses those cases before broadcast when the facts are supplied. | A new over-limit transaction was not sent in this audit. |
| Relayer | `relay` simulates, then broadcasts the calldata it was given. It does not hold the PQ seed or the agent key. It can delay a signed payload. It cannot change the root action inside a valid PQ signature. | Censorship was not measured as an uptime test. |
| Backend | The process does not sign PQ. Spend now refuses on policy before send. A stolen host can still submit a payload the user already signed. | — |
| Database | Rows are derived. Portfolio reads do not overwrite chain state. `scripts/rebuild-index.mjs` deletes rows and reads Arc again. | A live test that a closed tab still shown as open in a stale row is corrected on the next reconciliation was not repeated in this audit. |
| Frontend | A payment is not marked successful before a receipt. The PQ key is not sent to the server. | A hostile page on the same origin can use the IndexedDB wrap key, because that key has no passphrase. |

Losing the PQ backup leaves that root without an authority. The contract has no operator recovery. Reclaim after expiry still does not need the root key.
