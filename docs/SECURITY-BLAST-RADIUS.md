# Security blast radius

| Compromise | What is proven | What is not |
|---|---|---|
| Agent key | The key signs one tab. A re-read of `0x399e5e89c8d6be28efc394a37a074884768e0a8e63a533b53c6eae1904ee35ca` on 2026-10-08 returned receipt status `0x0` in block 24,623,376, from registrar `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` to USDC. That broadcast did not succeed. `decideSpend` refuses the wrong payee, an over-max amount, a short balance, a closed or expired capability, the wrong agent, and a root whose open exposure is already above its ceiling. | A new over-limit transaction was not sent in this audit. |
| Relayer | `relay` simulates, then broadcasts the calldata it was given. It does not hold the PQ seed or the agent key. It can delay a signed payload. It cannot change the root action inside a valid PQ signature. | Censorship was not measured as an uptime test. |
| Backend | The process does not sign PQ. Spend now refuses on policy before send. A stolen host can still submit a payload the user already signed. | — |
| Database | Rows are derived. Portfolio reads do not overwrite chain state. `scripts/rebuild-index.mjs` deletes rows and reads Arc again. | A live test that a closed tab still shown as open in a stale row is corrected on the next reconciliation was not repeated in this audit. |
| Frontend | A payment is not marked successful before a receipt. The PQ key is not sent to the server. | A hostile page on the same origin can use the IndexedDB wrap key, because that key has no passphrase. |

Losing the PQ backup leaves that root without an authority. The contract has no operator recovery. Reclaim after expiry still does not need the root key.
