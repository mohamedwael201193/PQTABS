# Threat model

Chain id 5042. Factory `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323`. Each row names the property, the code that enforces it, and the test or transaction that measured it.

| Id | Property | Enforcement | Evidence |
|---|---|---|---|
| I1 | Only the PQ root key performs protected actions | `PQRoot.execute` verifies before it dispatches | `test_registrar_is_not_an_admin` |
| I2 | The relayer is not an authority | `execute` ignores `msg.sender` for authorization | Backend builds only `execute`, `reclaim`, `retrySweep`, and `transferWithAuthorization` (`backend/test/validate.test.ts`) |
| I3 | Protected actions need a real SLH-DSA-SHA2-128s signature | Precompile `0x1800…0004`, empty context, 7856-byte signature | Phase 2 `evidence/phase2.json`. Mainnet opens `0x16236e86…` and `0xcd11114b…` |
| I4 | A nonce executes once | Compare-and-increment, rolled back on revert | `test_replay_wrong_nonce_tamper_and_deadline`. Old-key tx `0x19338117…` left the nonce for `0xcaf1a2e3…` |
| I5 | The digest binds domain, chain, root, nonce, deadline, and action hash | `PQRoot.digestFor` and `signer/src/digest.rs` | `test_signer_digest_matches_contract_for_every_action` |
| I6 | `openExposure` equals the sum of open caps and stays within the ceiling | Reserve before `openTab`, subtract once on close | `invariant_open_exposure_equals_sum_of_open_caps`. Mainnet open moved exposure 0 to 100,000 and reclaim moved it back to 0 |
| I7 | An agent spends only inside its tab policy | Barkeep `isValidSignature` | Non-payee receipt `0x399e5e89…` status 0. Over-max and foreign-agent calls returned `0xffffffff` |
| I8 | Expired tabs return funds only through the close path | `reclaim` requires `timestamp > expiry`, then the same close as the owner | `test_early_reclaim_and_direct_close`. Reclaims `0x0ab33b82…` and `0xb6d3e863…` |
| I9 | No ECDSA admin can change the root | No owner, no proxy. Implementation `initialize` is locked | `test_implementation_cannot_be_initialized` |
| I10 | Treasury transfer is a signed action | Kind 3 goes through `execute` | Root A transfer `0x604e24cb…` |
| I11 | User A cannot control user B | Digest includes `address(this)`. Factory salt includes `msg.sender` | `test_two_users_are_isolated`, `test_cross_root_replay_fails`, receipt `0x7cf1d0d5…` |
| I12 | Agent A cannot spend agent B's tab | Tab agent is immutable clone data | Agent B on tab A returned `0xffffffff` during staging |
| I13 | A compromised relayer cannot forge root authorization | Relayer key only signs the Ethereum transaction | `backend/src/chain.ts` `relay` sends the caller's bytes. It has no PQ signer |
| I14 | A compromised backend cannot forge root authorization | Same process boundary as I13. No PQ seed is loaded | `backend/src/server.ts` has no keygen or sign route |
| I15 | A compromised frontend cannot forge root authorization | The frontend is not in this repository. Authorization is the signature checked on chain | Same execute path as I1 |
| I16 | Tampered actions do not execute | Action hash is inside the signed digest | `test_replay_wrong_nonce_tamper_and_deadline` |
| I17 | Cross-chain replay fails | `chainid` is inside the digest | Digest test uses chain 5042. A different chain id changes the digest |
| I18 | Cross-root replay fails | Root address is inside the digest | `test_cross_root_replay_fails`, receipt `0x7cf1d0d5…` |
| I19 | Rotation invalidates old signatures | Verification uses the current `pqVk` | `test_rotation_invalidates_old_key`, txs `0x184edd6a…` and `0x19338117…` |
| I20 | A revoked or expired capability cannot keep spending | Close clears the tab. Expiry makes `isValidSignature` refuse | `test_early_reclaim_and_direct_close`. Staging reclaim zeroed both tab balances |
| I21 | One user's exposure does not change another's | Exposure is storage on that clone | Invariant keeps root B at 0 while root A moves. Mainnet roots moved independently |
| I22 | A stolen agent key is bounded by its tab | Cap, maxPerCall, payees, expiry | Tab A spent 10,000 of a 100,000 cap and could not pay a non-payee |
| I23 | No hidden global admin | `RootFactory` and `PQRoot` have no owner and no upgrade | `contracts/RootFactory.sol`, `test_implementation_cannot_be_initialized` |
| I24 | Production root actions are signed by the user, not by an operator sitting in the server | The server refuses to sign. The user signs with `pqtabs-sign` or the wasm package built from the same crate | `signer/src/pq.rs`, `signer/wasm` |

## Scenarios

Stolen agent key: the key can sign `transferWithAuthorization` for its tab until expiry, within `maxPerCall` and the payee list. It cannot rotate the PQ key, raise exposure, or reclaim another user's tab. Measured by the forbidden-payee receipt and the foreign-agent `eth_call`.

Stolen agent host: same bound as the key, if the host holds only that agent key. PQ keys are not on the agent host in this design.

Stolen user session or frontend session: a session is not an authority. Forged execute bytes fail the precompile. The backend simulates and still cannot invent a valid signature.

Compromised backend or relayer: can censor, delay, or submit a transaction the user already signed. Can spend the relayer's gas float. Cannot move a root's USDC without a valid signature. Duplicate submits die on the nonce.

Forged PQ signature, wrong chain, wrong root, modified amount, payee, cap, expiry, or tab: the digest or the Barkeep terms check fails. Local tests cover tamper, replay, and cross-root. Mainnet replay receipt status is 0.

Stale nonce, expired signature, early reclaim: `BadNonce`, `Expired`, `NotExpired`. A bad signature does not consume the nonce. Early reclaim is `test_early_reclaim_and_direct_close`.

Random tab, malicious factory, wrong implementation, wrong USDC: `initialize` checks Barkeep `IMPLEMENTATION()` and `USDC()` before a root is usable. `assertOurRoot` refuses relays for addresses this factory did not create.

Donation: extra USDC sent to a tab is spendable by that tab's agent. It does not change `openExposure`. `test_exposure_tracks_caps_not_balances`.

Failed sweep and retry: `needsSweep` stays set if `balanceOf` is not zero, and `retrySweep` does not subtract exposure again. `test_failed_sweep_does_not_double_subtract`.

Key rotation and old signatures: I19.

User A against user B, agent A against agent B: I11 and I12.

Database corruption: Postgres holds derived rows only. A wrong balance is replaced on the next reconciliation, and `scripts/rebuild-index.mjs` can delete the rows and read Arc again. The chain is not rewritten from the database.

RPC inconsistency or a dropped transaction: the backend returns the receipt it actually fetched. A transaction with `maxFeePerGas` below 20 gwei can be dropped by Arc with no receipt. The relayer uses at least 20 gwei.

Duplicate submission: in-memory cache plus the on-chain nonce. The cache resets on a cold start. The nonce does not.

Secret leakage and CI: `scripts/secret_scan.py` fails the build if a token prefix or a signing-key field is tracked. `.env` and `pq-keys/` are gitignored.

Dependency and supply chain: versions are pinned in `signer/Cargo.lock`, `backend/package-lock.json`, and `foundry.toml`. `docs/DEPENDENCIES.md` records the audit result.
