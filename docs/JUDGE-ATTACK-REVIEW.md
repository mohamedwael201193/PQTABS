# Judge attack review

## Security review

The worst realistic compromise of an agent is a stolen agent key. That key signs USDC authorizations for one tab. Receipt `0xc0c5213e…fd08` moved 10,000 raw units. Receipt `0xa4a3a66440a106fd67709f3dae3eab19623936e670ad67cdef4ed0b3edd57912` in block 24,654,131 succeeded: `tx.from` is the relayer, the ERC-20 log moves 1 raw unit from tab `0x45C2…420a` to `0xC485…3044`, and the native twin is the 18-decimal value of that same 1. The portfolio stores one `spend` of amount `1` for that hash. Receipt `0x399e5e89…35ca` is status 0 for a payee that was not on the tab. While an earlier tab was open, `isValidSignature` returned `0xffffffff` for payee `0x1111…1111` and for 10,001 raw to an approved payee, and those relay calls returned `simulation_failed` with no transaction. That older open-tab `eth_call` was not repeated. Capability `0x136F…f094` is open now, and its live refusals are in the current-limits section. Receipt `0x971e0398…ddbc` is a mined revert of a garbage blob on a closed tab; its reason is `FiatTokenV2: invalid signature`, not an isolated over-limit check. The agent cannot call `execute`. The PQ key does that.

The worst realistic compromise of the operator is a stolen relayer key plus a stolen backend host. The host does not contain PQ seeds or agent keys. `backend/src/server.ts` has four write routes, and each one encodes one function. `eth_estimateGas` runs before broadcast. A valid signature the user already produced can be submitted, censored, or replayed until the nonce moves. It cannot be rewritten. Cross-root replay of a real root A payload onto root B reverted `InvalidSignature` (`0x8baa579f`) in tx `0x7cf1d0d5…`.

A stolen PQ key is the treasury for that one root. It can transfer the root balance, open tabs up to `maxOpenExposure`, and rotate itself. It cannot reach root B. Root B's registrar, exposure, and reclaim were independent in blocks 24623290 through 24623934. There is no global treasury and no factory owner. If the user also lost the backup, nobody else can rotate that key. `docs/RECOVERY.md` is the procedure. An ECDSA rescue key was rejected because it would be a second authority.

## Technical review

Barkeep already opens an immutable tab: owner, agent, payees, maxPerCall, expiry, and a USDC cap. The agent spends with ERC-1271. The factory at `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c` has no admin. PQTABS does not replace that.

PQTABS adds a per-user root whose protected actions require SLH-DSA-SHA2-128s on the Arc precompile. The root is an EIP-1167 clone from `RootFactory` `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323`. The registrar wallet is stored and is not an admin (`test_registrar_is_not_an_admin`). The root, not the wallet, is `owner` of the tab. Exposure accounting is on the root: the sum of open caps, tested by `invariant_open_exposure_equals_sum_of_open_caps`, and observed on mainnet when each open added 100,000 and each reclaim subtracted 100,000 once.

Arc is required because the verifier is the precompile at `0x1800…0004`. Foundry does not execute that precompile. The cryptographic evidence is the mainnet `execute` receipts plus `evidence/phase2.json`, not the Forge mock.

## Product review

A user who wants an agent to pay for things without handing it the whole balance gets a tab with a cap, a payee list, a per-call maximum, and an expiry. After expiry, anyone can call `reclaim` and the unspent USDC returns to that user's root. The mainnet numbers were 100,000 funded, 10,000 spent, 90,000 returned, on two roots at once. The cap is what the root pulls in at open. Barkeep `Tab.sol` at `60f4b608` then treats the tab's USDC balance as the spending limit, so a later transfer into an open tab can be spent by that agent, still only to an allowlisted payee and still at most `maxPerCall` per authorization. That does not move the root. No such transfer was sent.

The user signs root actions locally. The backend at `docs/API.md` reads chain state and relays a signed payload. It cannot raise the cap. Raising exposure is action kind 5, and `test_set_exposure_cannot_undercut_open_caps` shows the ceiling cannot move below open caps. The same signature path is required to raise it.

Two users do not share a key. Registrar A and registrar B are different addresses, the roots are different contracts, and a signature from A failed on B. That is the product boundary: one compromised agent, or one compromised root, stops at that user's own clone.

## Current limits

The database is derived. A row that says a capability is open does not authorize a spend. `decideSpend` reads the tab, the root, the USDC balance, and the latest block before `POST /v1/relay/spend` broadcasts, and only after the 213-byte blob matches the request and its ECDSA signer recovers. A mismatched blob returns `tampered_action`. An unrecoverable signature returns `invalid_signature`. Both of those happened on Render `dep-db3dna6q1p3s73f4dki0` and neither included a chain reason or a transaction hash. If Arc rate-limits the later reads, the response is a retry and no transaction is sent.

The new wallet `0xBDfC…0034` has an open capability. Root `0x44502F6d18DAA9620c2BB3da21b8C3C8033A9787` was created in `0x26c918d4…872a`. The 0.01 USDC deposit is `0x6873f48d…1f92`. Capability `0x136F6F23946eF71a63913c9EA59701A2c3C9f094` opened in `0x66e51bd6…e759`. The live service payment is `0x699787ce…f5d6`: `transferWithAuthorization`, 12 raw USDC from that capability to `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9`, and the service returned `Tabletennis`. A later `POST /v1/x402/decide` refused a wrong payee, an amount above the cap, and an amount above the remaining balance. The capability balance stayed 9988. Switching the wallet to `0xf76e…71a3` showed treasury `0x846f…65Cf` at 0.139994 USDC and hid the new root. Switching back showed wallet 1.258159 USDC, root `0x4450…9787`, and the same 0.009988 USDC capability. Expiry and reclaim for that capability have not been run.
