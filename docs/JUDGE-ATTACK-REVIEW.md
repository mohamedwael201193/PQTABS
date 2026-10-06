# Judge attack review

## Security review

The worst realistic compromise of an agent is a stolen agent key. That key signs USDC authorizations for one tab. On mainnet, agent A moved 10,000 raw units out of a 100,000 cap (`0xc0c5213e…`). The same agent, aimed at a payee that was not on the tab, produced receipt status 0 (`0x399e5e89…`). `isValidSignature` returned `0xffffffff` for that payee, for an over-max amount, and for agent B presenting a blob to tab A. The agent cannot call `execute`. The PQ key does that.

The worst realistic compromise of the operator is a stolen relayer key plus a stolen backend host. The host does not contain PQ seeds or agent keys. `backend/src/server.ts` has four write routes, and each one encodes one function. `eth_estimateGas` runs before broadcast. A valid signature the user already produced can be submitted, censored, or replayed until the nonce moves. It cannot be rewritten. Cross-root replay of a real root A payload onto root B reverted `InvalidSignature` (`0x8baa579f`) in tx `0x7cf1d0d5…`.

A stolen PQ key is the treasury for that one root. It can transfer the root balance, open tabs up to `maxOpenExposure`, and rotate itself. It cannot reach root B. Root B's registrar, exposure, and reclaim were independent in blocks 24623290 through 24623934. There is no global treasury and no factory owner. If the user also lost the backup, nobody else can rotate that key. `docs/RECOVERY.md` is the procedure. An ECDSA rescue key was rejected because it would be a second authority.

## Technical review

Barkeep already opens an immutable tab: owner, agent, payees, maxPerCall, expiry, and a USDC cap. The agent spends with ERC-1271. The factory at `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c` has no admin. PQTABS does not replace that.

PQTABS adds a per-user root whose protected actions require SLH-DSA-SHA2-128s on the Arc precompile. The root is an EIP-1167 clone from `RootFactory` `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323`. The registrar wallet is stored and is not an admin (`test_registrar_is_not_an_admin`). The root, not the wallet, is `owner` of the tab. Exposure accounting is on the root: the sum of open caps, tested by `invariant_open_exposure_equals_sum_of_open_caps`, and observed on mainnet when each open added 100,000 and each reclaim subtracted 100,000 once.

Arc is required because the verifier is the precompile at `0x1800…0004`. Foundry does not execute that precompile. The cryptographic evidence is the mainnet `execute` receipts plus `evidence/phase2.json`, not the Forge mock.

## Product review

A user who wants an agent to pay for things without handing it the whole balance gets a tab with a cap, a payee list, a per-call maximum, and an expiry. After expiry, anyone can call `reclaim` and the unspent USDC returns to that user's root. The mainnet numbers were 100,000 funded, 10,000 spent, 90,000 returned, on two roots at once.

The user signs root actions locally. The backend at `docs/API.md` reads chain state and relays a signed payload. It cannot raise the cap. Raising exposure is action kind 5, and `test_set_exposure_cannot_undercut_open_caps` shows the ceiling cannot move below open caps. The same signature path is required to raise it.

Two users do not share a key. Registrar A and registrar B are different addresses, the roots are different contracts, and a signature from A failed on B. That is the product boundary: one compromised agent, or one compromised root, stops at that user's own clone.
