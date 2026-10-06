# PQTABS — IMPLEMENTATION PLAN

> **SUPERSEDED FOR PRODUCT SCOPE (2026-10-06).** The single-operator "demo agent" and "one PQ seed for the deployment" model in this file is not the production system. Execution follows `docs/ARCHITECTURE.md` and `docs/PHASES.md`. Chain facts, precompile encoding, Barkeep addresses, and the digest rules below stay in force unless those docs record a correction. Do not implement a global demo agent.

Date: 2026-10-06. This plan is the execution contract. Research files are evidence. Where they disagree with a source quoted here, this plan wins until a later phase records a new measurement.

No application code is included. No frontend is included. The next engineer executes one phase at a time and stops at a failed exit gate.

# EXECUTIVE SUMMARY

PQTABS is a security boundary for USDC that an agent is allowed to spend.

An SLH-DSA key signs rarely. It is the only authority that can open a tab, close a tab early, send treasury USDC, or rotate itself. Arc mainnet verifies that signature inside the transaction, at precompile `0x1800000000000000000000000000000000000004`. The signer stays on the operator's machine. The relayer, the backend, and the future browser never see the seed.

Each open creates a [Barkeep](https://github.com/barbarosalagoz/barkeep-arc) tab **owned by the root contract**, funded with exactly the cap. The agent holds a normal ECDSA key and spends through USDC `transferWithAuthorization`, which asks the tab (ERC-1271) whether the spend is inside the cap, the payee list, and the expiry. A stolen agent key cannot reach the treasury. A stolen relayer key cannot sign a root action.

This is not a trading system and not an AI system. Invalid signature, stale nonce, expired deadline, or over-policy input refuses. Valid and inside policy executes.

**Why this is stronger than Barkeep alone.** Barkeep already bounds the agent. The tab owner is still a normal key that holds the treasury and calls `openTab`. That owner key is the one that leaks. PQTABS replaces it with a contract that has no owner key. The property that changes: after deployment, no ECDSA key can move the treasury or raise exposure.

**Schedule.** About 6 to 9 working days for one engineer who already has the facts in this file. Phase 2 is a hard stop. The old "a few days" estimate is not a commitment. Toolchains were not installed on the planning machine (`forge`, `cast`, `cargo`, and `rustc` were absent from `PATH`; Python and Node were present).

# CURRENT VERIFIED STATE

Labels: **VERIFIED** = fetched or executed this session. **DOCUMENTED** = official doc or README. **INFERRED** = follows from those. **UNKNOWN** = not yet measured. **CORRECTION** = a previous research claim that must not be implemented as written.

## Chain

| Fact | Value | Label |
|---|---|---|
| Chain id | 5042 (`eth_chainId` = `0x13b2`) | VERIFIED |
| RPC | `https://rpc.mainnet.arc.io` | VERIFIED |
| Explorer | `https://explorer.arc.io` | DOCUMENTED |
| Finality | A transaction included in a committed block is final. No reorg. | DOCUMENTED, [deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality) |
| Min fee | Base fee floor 20 gwei. `maxFeePerGas` below 20 gwei is dropped with **no receipt**. | DOCUMENTED, [EVM differences](https://docs.arc.io/arc/references/evm-differences) |
| Decimals trap | Native balance is 18-decimal USDC. `balanceOf` is 6-decimal USDC. Same funds. | DOCUMENTED |

## USDC

| Fact | Value | Label |
|---|---|---|
| Address | `0x3600000000000000000000000000000000000000` | VERIFIED |
| `name()` | `USDC` | VERIFIED |
| `version()` | `2` | VERIFIED |
| `decimals()` | 6 | VERIFIED |
| Settlement selector | `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)` = `0xcf092995` | VERIFIED |

Contracts account in raw 6-decimal units. `1 USDC = 1_000_000`. Gas is paid from the relayer's native balance. The contract never prices gas.

## PQ precompile

Source: [circlefin/arc-node](https://github.com/circlefin/arc-node) commit `6e764023ee6515fe70573e123ed2db912a7207b4`. Interface `contracts/src/pq/IPQ.sol`. Handler `crates/pq-precompile/src/lib.rs`.

| Fact | Value | Label |
|---|---|---|
| Address | `0x1800000000000000000000000000000000000004` | VERIFIED |
| Signature | `verifySlhDsaSha2128s(bytes,bytes,bytes) returns (bool)` | VERIFIED |
| Selector | `0xbf4db8ba` | VERIFIED |
| Scheme | SLH-DSA-SHA2-128s only. Not SHAKE. Not 128f. | VERIFIED |
| Public key | 32 raw bytes (`pk_seed \|\| pk_root`). Not SPKI, not DER. | VERIFIED |
| Signature | 7856 raw bytes. Not DER. | VERIFIED |
| Message | The raw bytes you signed. The crate hashes them (FIPS 205 `H_msg`) with an **empty** context. The precompile does not keccak the message first. | VERIFIED |
| Bad signature | Returns `false`. Does not revert. | VERIFIED |
| Wrong vk or sig length | Reverts with `Error(string)`. | VERIFIED |
| Gas inside the precompile | `230_000 + 6 * ceil(messageLength / 32)`. Calldata gas is extra. | VERIFIED |
| Official vectors | `tests/helpers/pq_test_vectors.json`. Vector 0 message is the ASCII `Hello, World!`. Shared vk `0x03030303030303030303030303030303d627c8bad26269965d3ad40ca4457a26`. | VERIFIED |

**CORRECTION.** Older notes said "~380K gas" as if it were the precompile price. That number is not the source formula. Phase 2 records `eth_estimateGas` for a real call. Do not hardcode 380000.

**CORRECTION.** `04-CONCEPT-01.md` says the signed message "is `keccak(chainid ‖ root ‖ nonce ‖ actionHash)`". The precompile will verify whatever bytes the signer passed to `sign`. The contract must pass those same bytes. The canonical choice, specified below, is: keccak a typed digest, then sign that 32-byte digest. Informal concatenation is not the encoding.

## Signer crate

| Fact | Value | Label |
|---|---|---|
| Crate | `slh-dsa`, pin **`=0.2.0-rc.5`** | VERIFIED (the node is built on this version) |
| License | Apache-2.0 OR MIT | VERIFIED |
| Types | `SigningKey<Sha2_128s>`, `VerifyingKey<Sha2_128s>` | VERIFIED |
| Call | `sign(msg)` / `try_sign`, empty context | VERIFIED |
| Stable 0.1.0 | Exists. Do not use it for production signatures. Byte-level match is UNKNOWN. | VERIFIED / UNKNOWN |
| `pyspx` | Do not use. | VERIFIED earlier; still in force |

`sign_with_context` with a non-empty context will not verify through this precompile.

## Barkeep, composed with, not forked

Repo [barbarosalagoz/barkeep-arc](https://github.com/barbarosalagoz/barkeep-arc) commit `60f4b6082ec6bf88d2283201ea1e9e5f0f760901`. Apache-2.0. Solidity `0.8.30`. OpenZeppelin `5.7.0` (their dependency, not ours).

| Fact | Value | Label |
|---|---|---|
| Factory | `0xccebc58dd1f5937b36d5f9f89f0754424f4d443c` | VERIFIED (`eth_getCode` 2355 bytes; matches their deployment record) |
| Implementation | `0x89B63f2E43dea9014750925C01996D34856B01D2` | VERIFIED (`IMPLEMENTATION()` on the factory) |
| Factory `USDC()` | the USDC address above | VERIFIED |
| Owner of a tab | `msg.sender` of `openTab` | VERIFIED in `TabFactory.sol` |
| `close()` | Only that owner. Sets `closed`. Tries `USDC.transfer` to the owner. A failed transfer still leaves the tab closed. `close()` may be called again to retry the sweep. | VERIFIED |
| Expiry | Enforced only inside `isValidSignature`. There is no auto-close. | VERIFIED |
| Payees | 1 to 20, no zero address | VERIFIED |
| Funding | `transferFrom(msg.sender, tab, cap)` for exactly `cap` | VERIFIED |
| Agent signature blob | 213 bytes: 65-byte ECDSA, then `to` (20), `value` (32), `validAfter` (32), `validBefore` (32), `nonce` (32) | VERIFIED |
| EIP-712 domain | name `USDC`, version `2`, chain 5042, verifying contract = USDC | VERIFIED |
| Extra USDC sent to a tab | The agent can spend it too | DOCUMENTED in their README |
| Admin on the factory | None | VERIFIED |

**CORRECTION.** `01-COMPETITOR-WAR-ROOM-VFINAL.md` truncated the factory as `0xccebc5…443c`. Use the full address only.

**CORRECTION.** Permissionless reclaim is not a Barkeep feature. The tab will not let a stranger call `close()`. PQRoot, as owner, exposes `reclaim(tab)` which checks expiry and then calls `close()`.

## x402

| Fact | Value | Label |
|---|---|---|
| Facilitator | `POST https://api.circle.com/v1/facilitator/x402/settle` | DOCUMENTED, [Circle facilitator](https://developers.circle.com/facilitator-service/how-it-works) |
| Arc network id | `eip155:5042` | DOCUMENTED |
| Contract wallets | Works when the payer is already deployed and implements ERC-1271. ERC-6492 is not supported. | DOCUMENTED |
| Keyless trial | `Facilitator-Seller-Proof` header, then `403 registration_required` after the allowance | DOCUMENTED |
| Live settlement shape | Facilitator calls `transferWithAuthorization` (`0xcf092995`) on USDC. One observed Barkeep settlement: tx `0x2b26d71fda48dcd2eed10b26040858735de4a8a145d64185f44a5e9bf344ba26` | VERIFIED |

The required payment proof is our own submission of `transferWithAuthorization`. The facilitator is optional. If the trial returns 403, Phase 10 stops and the project is still completable.

## Deployer wallet (public facts only)

| Fact | Value | Label |
|---|---|---|
| Address | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` | VERIFIED (key in `.env` derives this address) |
| ERC-20 balance | 10.782756 USDC | VERIFIED this session |
| Nonce | 0 | VERIFIED |

The private key is only in `PQTABS/.env`. It is the deployer and nothing else.

## Hackathon gate

Submission needs a public repo, a live mainnet URL, and a contract address or tx hash. Deadline 14 Oct 2026 23:59 ET. Video is not required. Judging is Arc relevance, technical credibility, what was built, and whether it is worth taking further. Source: [hackathon page](https://dorahacks.io/hackathon/arc-microgrants/detail), confirmed in the prior session and not re-fetched today.

## Old claim ledger

| Old claim | Current state | Action |
|---|---|---|
| Build Haven (`04-FINAL-CONCEPT.md`, `05-BUILD-HANDOFF.md`) | arc-guard already occupies the PQ vault. Product is PQTABS v2. | REMOVE for this build |
| PQ tabs folded into Haven (`03-IDEA-KILL-CHAMBER.md`) | Reversed by `03-IDEA-KILL-CHAMBER-VFINAL.md` | REMOVE |
| Precompile gas ~380K flat | `230_000 + 6 per message word`, plus calldata | CORRECT |
| Signed message is an informal concatenation | 32-byte ABI digest, specified below | CORRECT |
| `pyspx` or `slh-dsa` 0.1.0 is fine | Pin `slh-dsa =0.2.0-rc.5` | CORRECT |
| Factory address truncated | Full address verified on chain | CORRECT |
| Upstream Anvil proves Arc precompiles | It does not. Proof is `eth_call` / tx against `rpc.mainnet.arc.io`. | CORRECT |
| Recovery key and ERC-8004 payees are in v1 | Not in this build. They add a second authority and a mutable wallet. | REMOVE from v1 |
| Generic gas sponsorship (Sponsor) | Killed. Unrelated to this contract. | REMOVE |

## Research version map

`04-CONCEPT-01(2).md` is missing. `IMPLEMENTATION-PLAN.md` did not exist before this file.

| File | Generation | Relevance to this build |
|---|---|---|
| `04-CONCEPT-01.md` | Current product spec | High. Mechanism source. Encoding in it is corrected above. |
| `00-MASTER-STATE-VFINAL.md` | Current | High. Protocol facts. Superseded where this plan says CORRECTION. |
| `01-COMPETITOR-WAR-ROOM-VFINAL.md` | Current | High for Barkeep's gap. Factory address was truncated. |
| `03-IDEA-KILL-CHAMBER-VFINAL.md` | Current | High. Says why v1 (PQ signature on every spend) was rejected. |
| `02-WINNER-JUDGE-PRIVACY-VFINAL.md` | Current | Medium. Forge-later is the right threat word. |
| `05-BUILD-HANDOFF.md`, `04-FINAL-CONCEPT.md`, `04-CONCEPT-01-HAVEN.md` | Obsolete Haven build | Do not implement. |
| `03-IDEA-KILL-CHAMBER.md`, `01-COMPETITOR-WAR-ROOM.md` | Previous round | Historical. They still center Haven. |
| `05-CONCEPT-02.md` through `08-CONCEPT-05.md` and the QUORUM / TOLLGATE / SPONSOR / RESERVE files | Other products | None. |
| `archack.md` | Field census | Low. |
| `workshop.md` | Circle transcript | Low. "PQ beta soon" refers to wallets, not this precompile. |
| `01-FORENSICS.md`, `02-WINNERS-COMPETITORS.md`, `03-IDEA-KILLING.md` | Earlier forensics | Low. |

# ARCHITECTURE

```
operator machine                         Arc mainnet
-----------------                        -----------
pq-keys/root.json  --sign-->  signed-action.json
                                    |
                                    v
                              relayer EOA  --->  PQRoot.execute
                                                      |
                                                      | staticcall
                                                      v
                                                 PQ precompile
                                                      |
                              on OPEN_TAB: approve + TabFactory.openTab
                                                      |
                                                      v
                                                 Tab (owner = PQRoot,
                                                      agent = ECDSA address,
                                                      balance = cap)

agent ECDSA key -- EIP-3009 --> USDC.transferWithAuthorization
                                      |
                                      | isValidSignature
                                      v
                                    Tab
```

Four authorities, never merged:

| Authority | Key | Where it lives | What it can do |
|---|---|---|---|
| Deployer | ECDSA, the `.env` deployer | Operator machine only | Deploy PQRoot. Send USDC to it. Nothing after that. |
| Relayer | ECDSA, generated in Phase 1 | Operator machine and Render | Submit `execute`, `reclaim`, and `retrySweep`. Pay gas. |
| Agent | ECDSA, generated in Phase 1 | Operator machine only | Sign spends for one tab, inside policy. |
| PQ root | SLH-DSA-SHA2-128s | `pq-keys/` on the operator machine | Open, close, transfer, rotate. |

There is no database. Balances, caps, nonce, verifying key, expiry, and tab registry are contract state. The backend may remember a tx hash long enough to report it; that memory is not authority.

There is no proxy and no owner. Rotating the PQ key is a signed action, not an upgrade. Raising `maxOpenExposure` means deploying a new root. That is deliberate.

## Root actions

One action encoding. One digest. One signature format.

```solidity
// action is exactly one of:
// 1: abi.encode(uint8(1), address agent, address[] payees, uint256 maxPerCall, uint64 expiry, uint256 cap)
// 2: abi.encode(uint8(2), address tab)
// 3: abi.encode(uint8(3), address to, uint256 amount)
// 4: abi.encode(uint8(4), bytes32 newVk)

bytes32 constant DOMAIN = keccak256("PQTABS_V1");

function digestFor(bytes calldata action, uint64 nonce, uint64 deadline)
    public view returns (bytes32)
{
    return keccak256(abi.encode(
        DOMAIN,
        block.chainid,
        address(this),
        nonce,
        deadline,
        keccak256(action)
    ));
}
```

The signer signs the **32 raw bytes** of that digest. `execute` rebuilds the digest and passes `abi.encodePacked(digest)` as the precompile message. A signature over the preimage, over a hex string, or over `abi.encode(digest)` is a different message and must fail.

`salt` for CREATE2 is `bytes32(uint256(nonce))`. It is not a free parameter. Same terms and same nonce cannot open two tabs, and the operator does not have a second salt to get wrong.

`deadline` is unix seconds, `block.timestamp < deadline <= block.timestamp + 7 days`.

### Nonce

`uint64 public nextNonce`, starting at 0.

`execute` requires `nonce == nextNonce`, checks the deadline, checks the signature, then increments `nextNonce`, then performs the action. If the action reverts, the increment reverts with it. A dropped transaction does not increment it, so the same signed file can be resubmitted until the deadline. After the deadline the operator signs a new action with the **same** nonce. Two signatures for one nonce cannot both land. The CLI refuses to write a second pending file for the current nonce.

Out-of-order nonces are rejected. Root actions are rare; the stuck-nonce failure mode of a bitmap is worse than waiting for one deadline. This is the proof against replay and against races:

- Replay after success: `nonce != nextNonce`.
- Two relayers, one payload: one receipt status 1, the other reverts on `BadNonce`. State changes once.
- Edited amount, payee, cap, tab, or key: new `actionHash`, new digest, precompile returns false.
- Same bytes on another chain or another PQRoot: `chainid` and `address(this)` are inside the digest.
- Dropped transaction: no receipt, nonce unchanged, resubmit.
- Abandoned signature: wait for `deadline`, sign a replacement at the same nonce.

### Exposure

`openExposure` sums **caps**, not balances.

- `OPEN_TAB` reverts unless `openExposure + cap <= maxOpenExposure`. Then it adds `cap`.
- `CLOSE_TAB` and `reclaim` subtract that same stored cap, including when the agent has already spent part of it.
- A direct donation to a tab does not change `openExposure`. It also is not root money. The agent can spend it. That is Barkeep's behavior. The root never sends USDC to a tab except through `openTab`'s exact `cap`.
- `TRANSFER` moves root USDC and does not change exposure. It cannot reach USDC that already sits in a tab.

So: root loss from a compromised agent equals the caps of tabs still open, and only if those tabs were funded by the root.

## Contract

One contract, `PQRoot.sol`. No second contract unless Phase 6 proves the factory cannot be called as specified.

Pinned constants:

- USDC `0x3600000000000000000000000000000000000000`
- PQ `0x1800000000000000000000000000000000000004`
- Factory `0xccebc58dd1f5937b36d5f9f89f0754424f4d443c`
- Tab implementation `0x89B63f2E43dea9014750925C01996D34856B01D2`

Constructor `(bytes32 vk, uint256 maxOpenExposure)`:

- `vk != 0`, `maxOpenExposure != 0`
- `factory.IMPLEMENTATION() == TAB_IMPLEMENTATION`
- `factory.USDC() == USDC`
- store `pqVk` and `maxOpenExposure`
- deployer is not stored

`execute(bytes action, uint64 nonce, uint64 deadline, bytes sig)`:

1. Deadline window and nonce.
2. `sig.length == 7856`, else `BadSignatureLength`.
3. Build digest. `staticcall` the precompile with `(abi.encodePacked(pqVk), abi.encodePacked(digest), sig)`.
4. A revert from the precompile propagates. `false` becomes `InvalidSignature`.
5. Increment nonce.
6. Decode the leading `uint8` and dispatch.

`OPEN_TAB` checks: agent and payees non-zero, payee count in 1..20, `cap > 0`, `maxPerCall > 0`, `maxPerCall <= cap`, `expiry > block.timestamp`, exposure bound. Then `approve(factory, cap)`, `openTab(...)`, require the returned address equals `predictTab` with owner = this contract, require `tab.owner() == address(this)`, record the cap and expiry, emit.

`CLOSE_TAB` and `reclaim` share an internal `_close`. `CLOSE_TAB` is the signed path and works before expiry. `reclaim(address tab)` has no signature and requires `block.timestamp > storedExpiry`. Both require the registry row, `tab.owner() == address(this)`, and `tab.expiry() == storedExpiry`. Then `tab.close()`, subtract the cap, emit. If USDC stays in the tab, the row is marked `needsSweep`.

`retrySweep(address tab)` has no signature. It requires `needsSweep` and calls `tab.close()` again. It does not change exposure a second time.

`TRANSFER` requires `to` is not zero, not this contract, and not the factory; `amount > 0`; `amount <= USDC.balanceOf(this)`. Then `transfer`.

`ROTATE_KEY` requires `newVk != 0` and `newVk != pqVk`, then stores it.

No other function moves USDC. No `receive` is required for ERC-20 funding. Do not add a withdrawal helper "for emergencies."

Suggested custom errors: `InvalidSignature`, `BadSignatureLength`, `BadNonce`, `Expired`, `DeadlineTooFar`, `ExposureExceeded`, `UnknownTab`, `NotExpired`, `AlreadyClosed`, `ZeroAddress`, `BadPayeeCount`, `CapZero`, `MaxPerCallAboveCap`, `ExpiryNotFuture`, `TransferFailed`, `ApproveFailed`, `UnexpectedTab`, `TabNotOwned`, `ActionUnknown`, `SweepNotNeeded`, `FactoryMismatch`.

Events: `RootExecuted(uint64 nonce, uint8 kind, bytes32 actionHash, address submitter)`, `TabOpened(address indexed tab, address indexed agent, uint256 cap, uint64 expiry, uint256 openExposure)`, `TabClosed(address indexed tab, uint256 capReleased, bool swept, bool permissionless)`, `SweepRetried(address indexed tab, bool swept)`, `TreasuryTransfer(address indexed to, uint256 amount)`, `KeyRotated(bytes32 vk)`.

Reads the frontend will use: `pqVk`, `nextNonce`, `maxOpenExposure`, `openExposure`, `digestFor`, `tabs(address) -> (cap, expiry, open, needsSweep)`, plus Barkeep `terms()`, `closed()`, `balance()`, and USDC `balanceOf`.

## Signer

Local CLI `pqtabs-sign`. Inputs are the action fields, the nonce, and the deadline. It reads `pq-keys/root.json`. It computes `digestFor` with the same ABI rules as Solidity (a test vector must match `cast` byte for byte). It writes `signed-actions/<nonce>.json` containing the action fields, the action bytes, the digest, the deadline, and the signature. It prints the decoded fields and waits for a confirmation flag before writing. It does not broadcast.

`pq-keys/` and `signed-actions/` are gitignored.

## Agent

Local CLI or script `pqtabs-spend`. It signs the EIP-712 transfer with the demo agent key and packs the 213-byte blob. A local sender submits `transferWithAuthorization`. Render never receives this key.

The demo payee is the deployer address, which is on the allowlist. A second call uses a payee that is not on the list and must revert. An over-`maxPerCall` call must revert.

## Backend

A small stateless HTTP service.

- `GET /health` — process is up.
- `GET /ready` — `eth_chainId == 5042` and the factory still has code.
- `GET /root` — vk, nonce, exposure, cap, root USDC balance (from `balanceOf`, divided by 1e6 only for display).
- `GET /tabs/:address` — registry row plus Barkeep terms, closed, balance.
- `GET /tx/:hash` — receipt status and a state read. `submitted` is not success.
- `POST /relay` — body is a signed-action file. Simulate `execute`. Broadcast only if the simulation succeeds. Return the hash, then the receipt.

The relay calls only `PQRoot.execute`, `PQRoot.reclaim`, and `PQRoot.retrySweep`. It has no arbitrary `to` / `data` field. It sets `maxFeePerGas` to at least the current `eth_gasPrice` and at least 20 gwei.

Render's only secret is `RELAYER_PRIVATE_KEY`. Compromising Render lets someone censor or resubmit already-signed actions and spend the relayer's gas float. It does not create a signature.

## Transaction states that exist on Arc

`SIGNED` → `SUBMITTED` → `FINAL_SUCCESS` or `FINAL_REVERT`. `DROPPED` means no receipt and `eth_getTransactionByHash` is null after 60 seconds. Do not model extra confirmations. A success receipt is final, and it is accepted only after the expected state read matches.

# TRUST MODEL

| Party | Trusted for | Not trusted for |
|---|---|---|
| Arc validators and the PQ precompile | Verifying SLH-DSA correctly and finalizing the block | — |
| SLH-DSA-SHA2-128s | Unforgeability | A lost seed (funds stick; there is no recovery key) |
| GitHub source of Barkeep at the pinned commit | Matching the bytecode we call | Future commits. The on-chain factory is pinned. |
| USDC contract | Moving balances as specified, including the blocklist | — |
| Operator | Protecting the PQ seed and reviewing CLI output before signing | — |
| Relayer and backend | Availability | Authorization |
| Agent host | Availability of spends | Anything outside the tab |
| Future website | Display | Signing root actions |

# THREAT MODEL

| Attack | Condition | Outcome | Enforced by | Test |
|---|---|---|---|---|
| Stolen agent key | Attacker has the ECDSA seed | Can pay allowlisted payees up to `maxPerCall` until the balance or the expiry. Cannot open tabs, cannot touch root USDC, cannot close into a chosen address. | Tab `isValidSignature` + root has no agent path | Publish the demo agent key, try to drain the root |
| Stolen agent server | Same as stolen key, if the key is on that server | Same bound | Same | Demo key is not on Render |
| Stolen relayer | Attacker has the relayer key | Can submit txs and spend the gas float. Cannot forge `sig`. | Precompile | Send `execute` with a random 7856-byte sig |
| Forged PQ signature | No seed | `false` → `InvalidSignature` | Precompile | Flip one signature byte |
| Replay | Same signed file twice | Second call hits `BadNonce` | `nextNonce` | Double submit |
| Wrong chain or wrong root | Same signature elsewhere | Digest differs | `chainid`, `address(this)` | Unit vector; do not deploy a second chain |
| Edited recipient, amount, cap, payee | Payload changed after signing | Digest differs | Digest over `keccak256(action)` | Mutate one field |
| Expired signature | `timestamp > deadline` | `Expired` | `execute` | Deadline in the past |
| Stale nonce | Gap, or a replacement after a drop | Only `nonce == nextNonce` runs | Nonce check | Submit nonce+1 first |
| Expired tab spend | Agent signs after expiry | USDC call reverts; tab returns `0xffffffff` | Barkeep | Spend after expiry |
| Reclaim before expiry | Stranger calls `reclaim` | `NotExpired` | PQRoot | Call early |
| Stranger calls `tab.close()` | Not the owner | `NotOwner` | Barkeep | Direct call |
| Malicious factory | Constructor pointed at another factory | Deploy reverts unless `IMPLEMENTATION()` and `USDC()` match the pins | Constructor | Fork test with a fake factory |
| Malicious tab address in `CLOSE_TAB` | Address we did not open | `UnknownTab` | Registry | Close a random address |
| Donation to the tab | Anyone transfers USDC to the tab | Agent can spend the donation. Root exposure counter does not move. Root's own loss stays the cap. | Documented Barkeep behavior. Root never transfers extra. | Send 1 raw unit to the tab and spend it; record it as expected |
| Donation to the root | Anyone transfers USDC to PQRoot | Sits there until a signed `TRANSFER` | No unsigned withdraw | Transfer in, try unsigned transfer out |
| PQ seed loss | No backup | Treasury is stuck. Accepted in v1. | No recovery function | None (do not "test" by deleting the only copy before the demo) |
| Mis-set cap | `maxPerCall > cap` or cap 0 | Factory and PQRoot revert | Both | Fuzz |
| 6 vs 18 decimals | Display uses native balance / 1e6 | Shows a huge number. Accounting in the contract stays in `balanceOf` units. | Backend formatter test | 1_000_000 raw → `1.000000` |
| Compromised frontend | Serves a fake balance or a different action than the operator signed | Cannot produce a valid PQ signature. CLI prints the real fields before signing. | Signer confirmation | Review the CLI output |
| Compromised backend | Holds the relayer key | As stolen relayer | Allowlist of three calls | Code review of the relay route |
| Nonce race | Two signed files, one nonce | One lands | Nonce | Two payloads |
| Blocklisted payee | USDC rejects the transfer | Spend reverts; tab stays open | USDC | Only if a known blocklisted address is available; otherwise document |
| Direct `approve` left behind | `openTab` pulls `cap` | Allowance returns to its previous value (0) | Exact approve | Read allowance after open |

# CONTRACTS

## PQRoot

| | |
|---|---|
| Purpose | PQ authority over a USDC treasury and over Barkeep tabs it owns. |
| State | `pqVk`, `nextNonce`, `maxOpenExposure` (immutable), `openExposure`, tab rows. |
| Authority | SLH-DSA for `execute`. Anyone for `reclaim` after expiry and for `retrySweep`. |
| Invariants | I1–I10 below. |
| Dependencies | Pinned USDC, precompile, factory. |
| Failure modes | Precompile revert on malformed input; `false` on a bad signature; Barkeep revert on bad tab terms; USDC revert on pause or blocklist. |

No other contract. Interfaces for the factory, the tab, USDC, and the precompile live in the same file or next to it. They are not deployed.

# SIGNER

Rust binary. Crate pin `slh-dsa = "=0.2.0-rc.5"`. Key file holds `sk_seed`, `sk_prf`, `pk_seed` (16 bytes each) or the crate's raw signing-key bytes, plus the 32-byte verifying key. Mode `0600` on the file. Generation uses the OS RNG via `SigningKey::<Sha2_128s>::new`. Signing uses `sign` on the 32 digest bytes. The CLI subcommands are `keygen`, `sign`, and `verify-local`. `verify-local` calls the precompile with `eth_call` so the operator sees the chain agree before broadcasting.

ABI encoding of the digest is done by a tiny Solidity library function and reproduced in Rust. Phase 3 is the byte-equality gate. Do not shell out to a remote RPC to learn what to sign.

# BACKEND

TypeScript on Node. Package manager pin recorded in Phase 11 (`package-lock.json`, no floating ranges on `viem` or the server library). The service is a relay and a reader. It is not an indexer with its own truth. Tab lists for the future UI come from `TabOpened` logs via `eth_getLogs` on each request, or from a short in-memory cache marked as a cache.

Logging fields: time, route, tx hash, nonce, action kind, error code, latency. Never log environment variables, the relayer key, the agent key, or the PQ seed. The PQ seed is not on this host.

Stable error codes: `BAD_PAYLOAD`, `SIMULATION_FAILED`, `REVERTED`, `DROPPED`, `CHAIN_MISMATCH`, `NOT_READY`, `RATE_LIMITED`.

# AGENT

Demo only. One key. One allowlisted payee (the deployer). Cap and `maxPerCall` set small (`cap = 1_000_000`, `maxPerCall = 200_000` is a reasonable demo; the signed action is what counts). The key may be shown at the end of the demo because the tab is the entire blast radius. Do not show it while a large cap is still open. Never show the deployer key, the relayer key, or the PQ seed.

# INFRASTRUCTURE

| Piece | Choice | Why |
|---|---|---|
| Chain | Arc mainnet 5042 | The precompile and the Barkeep factory are there. Testnet is not a substitute. |
| Backend host | Render web service | Operator asked for Render. |
| Frontend host | Vercel, later, by another agent | Not this plan's build. |
| Database | None | Nothing authoritative lives off chain. |
| PQ signer | Operator machine | Render must not have the seed. |
| Source remote | `https://github.com/mohamedwael201193/PQTABS` | Empty aside from a README today. Do not push secrets. Do not push until asked. |

# ENVIRONMENT

See the master list at the end. `.env` is gitignored and already holds the deployer and the hosting tokens. Relayer, agent, and PQ root address are blank on purpose. Do not copy the deployer key into the other key fields.

# SECURITY INVARIANTS

| Id | Statement | How it is enforced |
|---|---|---|
| I1 | The PQ verifying key is the only authority for open, early close, treasury transfer, and rotation. | Those paths are inside `execute`, after a `true` precompile result. |
| I2 | The relayer is only `msg.sender`. | `execute` does not branch on `msg.sender`. |
| I3 | A root action requires a valid SLH-DSA-SHA2-128s signature over the digest. | Precompile call. `false` and malformed input both refuse. |
| I4 | A nonce executes at most once. | Compare-and-increment, reverted if the action reverts. |
| I5 | The digest binds domain, chain, this contract, nonce, deadline, and the action bytes. | `digestFor`. |
| I6 | `openExposure <= maxOpenExposure` after every successful call. | Checked before add; subtracted by the same stored cap on close. |
| I7 | An agent key spends only that tab's USDC, to allowlisted payees, up to `maxPerCall`, before expiry, while the tab is open. Donations to the tab are included in the tab balance. | Barkeep `isValidSignature`. |
| I8 | After expiry, anyone can make PQRoot call `tab.close()`, and the USDC returns to PQRoot (or stays for `retrySweep` if the transfer failed). | `reclaim`. |
| I9 | No ECDSA admin, no proxy, no unsigned withdraw. | Constructor stores no owner. Function list is closed. |
| I10 | Every refusal is a named revert or a Barkeep `0xffffffff` that makes USDC revert. | Custom errors. Tests assert the error, not a string substring, except for precompile length reverts which are the precompile's own `Error(string)`. |

# TEST MATRIX

Forge tests that replace the precompile are **simulation**. They may check nonce and exposure. They are not PQ evidence. Name the harness `PQRootHarness` and keep it out of the deploy script. The deploy script asserts the bytecode contains the precompile address.

## PQ (real chain, Phase 2 and Phase 12)

| Case | Expected |
|---|---|
| Official vector 0, message `Hello, World!` | `true` |
| Vector 2, hello signature over goodbye | `false` |
| New key, sign 32-byte digest | `true` |
| One flipped signature byte | `false` |
| Truncated signature, empty signature, 32-byte vk with a flipped byte, vk length 31 | precompile revert |
| Digest signed, then one field of the action changed | `false` on the rebuilt digest |
| Same signature submitted to a second PQRoot | `InvalidSignature` |
| Non-empty SLH context | `false` (do not ship this path; one negative test in Rust) |

## Root (harness plus one mainnet path)

`OPEN_TAB`, `CLOSE_TAB`, `TRANSFER`, `ROTATE_KEY` happy paths. Duplicate nonce. Signature for nonce+1 submitted first. Expired deadline. Deadline too far. Exposure overflow. Unknown tab. Close of a tab we do not own. Replay after success. Mutated cap. Failing `openTab` (bad payee) leaves nonce and allowance unchanged. Rotate, then an old signature fails.

## Barkeep (mainnet, small amounts)

Factory `IMPLEMENTATION()` and `USDC()` match. `openTab` from PQRoot: `owner() == PQRoot`. Allowed payee pays. Other payee reverts. Over `maxPerCall` reverts. Spend of `cap + 1` reverts. After expiry, spend reverts and `reclaim` returns the remainder. `reclaim` before expiry reverts. Second `close` from a stranger reverts. Partial spend then close returns the remainder. Donation of 1 raw unit is spendable (expected, documented). Allowance of the factory is 0 after open.

## USDC

`balanceOf` raw `1000000` displays as `1.000000`. `eth_getBalance` / 1e12 equals that raw balance, within the same account. `approve` + `transferFrom` of an exact cap. Insufficient balance reverts. No test may pass a number through both `1e6` and `1e18` in the contract.

## Security properties (must be demonstrated on mainnet)

Compromised-agent attempt does not decrease PQRoot's USDC except by the open cap. Relayer key with a random signature does not move USDC. Forged signature reverts. Replayed action reverts. Modified action reverts. Deadline in the past reverts.

# PHASE 0 — Research already done

## REQUIRED RESOURCES

### Files to read
`PQTABS/IMPLEMENTATION-PLAN.md`, `04-CONCEPT-01.md`, `00-MASTER-STATE-VFINAL.md`, `01-COMPETITOR-WAR-ROOM-VFINAL.md`, `03-IDEA-KILL-CHAMBER-VFINAL.md`

### Official docs
https://docs.arc.io/arc/concepts/execution-layer
https://docs.arc.io/arc/references/evm-differences
https://docs.arc.io/arc/concepts/deterministic-finality
https://docs.arc.io/arc/concepts/post-quantum-security

### GitHub repositories
https://github.com/circlefin/arc-node
https://github.com/barbarosalagoz/barkeep-arc
https://github.com/RustCrypto/signatures

### MCP/tools
None required to re-read this plan. A later phase uses the shell against `https://rpc.mainnet.arc.io`.

### Skills
None of the installed skills apply. Do not load a frontend, video, or design skill for these phases.

### Browser/Chrome
Not required for Phase 0.

### External dependencies
None installed in this phase.

### Inputs
This plan and the research files above.

### Outputs
A decision to proceed to Phase 1, or a written STOP if the operator rejects the corrected digest.

## VALIDATION BEFORE START
Confirm `04-CONCEPT-01(2).md` is still absent. Confirm no `src/` contracts exist yet.

## EXECUTION
Read this plan's Current Verified State. Do not reopen Haven. Do not start a frontend. Do not generate a PQ key into `.env`.

## TESTS
None. This phase is a read.

## EXIT GATE
The operator can state I1–I10 and the digest rule without looking at an older file.

## FAILURE / STOP CONDITIONS
A newer Barkeep deployment has replaced the factory, or Arc has removed the precompile. Either fact sends the work back to Phase 2 before any contract is written.

## EVIDENCE LABELS
VERIFIED and CORRECTION items above. UNKNOWN carried forward: measured gas of our own `execute`, Rust compiler version, whether the Circle keyless trial still accepts a new seller.

# PHASE 1 — Toolchain

## REQUIRED RESOURCES

### Files to read
This plan, sections Environment and Signer. `PQTABS/.gitignore`.

### Official docs
https://book.getfoundry.sh/introduction/installation
https://www.rust-lang.org/tools/install

### GitHub repositories
https://github.com/foundry-rs/foundry/releases/tag/v1.8.5

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
Only if an installer page blocks the shell.

### External dependencies
Foundry upstream (compile and `cast`). Rustup. Node 22 or newer, exact version recorded. Do not install `pyspx`.

### Inputs
Network access. No secrets printed.

### Outputs
`forge --version`, `cast --version`, `rustc -V`, `node -v` written into `PQTABS/TOOLCHAIN.md` (three lines, versions only). A Foundry project skeleton with **no** PQRoot logic yet: `foundry.toml` (`solc = "0.8.30"`, `evm_version = "prague"`, optimizer 200, `bytecode_hash = "none"`).

## VALIDATION BEFORE START
`git status` does not list `.env`. If a git repo is created, `.gitignore` must already be in place.

## EXECUTION
Install Foundry. The book does not pin a version; `v1.8.5` was the latest stable release on 2026-10-05. Record whatever `foundryup` actually installed. If it is not 1.8.5, record the difference and continue only if `solc 0.8.30` is available.

Install Rust. The `slh-dsa` 0.2.0-rc.5 MSRV is UNKNOWN until `cargo add` resolves. Record `rustc -V`.

`forge init` the skeleton. Commit nothing unless the operator asks.

Generate the relayer key and the agent key **locally** into `.env` using `cast wallet new`. Fund neither yet. Do not copy the deployer key. Leave `PQROOT_ADDRESS` empty.

## TESTS
`cast chain-id --rpc-url $ARC_RPC_URL` prints `5042`. `cast call` of USDC `decimals()` returns 6.

## EXIT GATE
Toolchain file written. `.env` still gitignored. Relayer address ≠ deployer address ≠ agent address.

## FAILURE / STOP CONDITIONS
`cast` cannot reach the RPC. Stop. Do not code around it with a fake chain id.

## EVIDENCE LABELS
Chain id re-checked: VERIFIED at execution time. Tool versions: recorded, previously UNKNOWN.

# PHASE 2 — Precompile compatibility

## REQUIRED RESOURCES

### Files to read
`contracts/src/pq/IPQ.sol` and `crates/pq-precompile/src/lib.rs` in arc-node. `tests/helpers/pq_test_vectors.json`.

### Official docs
https://docs.arc.io/arc/concepts/post-quantum-security

### GitHub repositories
https://github.com/circlefin/arc-node

### MCP/tools
Shell and `cast`. Not a browser.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
`slh-dsa = "=0.2.0-rc.5"`. A one-file Rust bin is enough. This is a probe, not the product CLI yet.

### Inputs
RPC. The official test vector file.

### Outputs
`probes/phase2.md` with the four `eth_call` results and one `eth_estimateGas` number. No private key in that file. The new probe key stays in `pq-keys/phase2.json`, gitignored, and is **not** the production root key.

## VALIDATION BEFORE START
Selector in the probe calldata starts with `bf4db8ba`. Vk length 32. Signature length 7856.

## EXECUTION
1. `eth_call` official vector 0. Expect `true`.
2. `eth_call` vector 2. Expect `false`.
3. Generate a fresh `Sha2_128s` key. Sign the 32 zero bytes with empty context. `eth_call`. Expect `true`.
4. Flip one signature byte. Expect `false`.
5. Drop the last byte. Expect a revert, not `false`.
6. Record `eth_estimateGas` for call 3. That number replaces every earlier gas estimate.

Do not point `forge test --fork-url` at this precompile and treat a pass as evidence. Upstream revm does not implement it.

## TESTS
The six calls are the tests.

## EXIT GATE
Steps 1–5 match the expected booleans and the revert. The production crate is rc.5, proven by the Cargo.lock line.

## FAILURE / STOP CONDITIONS
A valid rc.5 signature returns `false`. Stop the project. Do not "fix" it by hashing the message first, and do not switch to `pyspx`. Write the raw request and response into `probes/phase2.md` and hand it back.

A revert on the valid vector means the ABI encoding of the three `bytes` is wrong. Fix the encoding and rerun. Do not change the contract design until this passes.

## EVIDENCE LABELS
Results of this phase become VERIFIED for our toolchain. Until then the source-code facts are VERIFIED and our own call is not yet repeated.

# PHASE 3 — Digest and signer vectors

## REQUIRED RESOURCES

### Files to read
This plan's digest section. Phase 2 output.

### Official docs
https://docs.rs/slh-dsa/0.2.0-rc.5/slh_dsa/

### GitHub repositories
https://github.com/RustCrypto/signatures
https://github.com/foundry-rs/foundry

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
`slh-dsa = "=0.2.0-rc.5"`. One keccak implementation (Alloy's `keccak256` or an equivalent pinned crate; record the exact version in Cargo.lock). Foundry `cast abi-encode` as the independent encoder.

### Inputs
Phase 2 gate passed.

### Outputs
Rust crate `signer/` with `keygen`, `sign`, `verify-local`. Golden file `signer/testdata/digest-v1.json`: action bytes, digest, signature, vk. `cast` reproduces the digest.

## VALIDATION BEFORE START
The golden action is a fixed `OPEN_TAB`: one payee, small integers, nonce 0, deadline `1893456000`. Same inputs every run.

## EXECUTION
Implement `digestFor` in a Solidity test helper and in Rust. Hash the action with keccak, then ABI-encode `(bytes32,uint256,address,uint64,uint64,bytes32)` the way `abi.encode` does (each value padded to 32 bytes). Compare hex. Sign the 32-byte digest. `verify-local` uses `eth_call` and must be `true`. Change the cap by 1 in the action bytes, rebuild the digest, and the old signature must be `false`.

Repeat for action kinds 2, 3, and 4 with one golden row each.

## TESTS
`cargo test` and a forge test that loads the golden JSON and checks `digestFor`. The forge test does not need the precompile. The `eth_call` does.

## EXIT GATE
Four golden digests match between Rust and Solidity. One live `eth_call` is `true`. One mutated action is `false`.

## FAILURE / STOP CONDITIONS
Any digest mismatch. Stop. Do not broadcast a signature until the bytes match. A mismatch means the two encoders are not the same function.

## EVIDENCE LABELS
Digest equality: VERIFIED only after this phase. Design: specified here.

# PHASE 4 — PQRoot

## REQUIRED RESOURCES

### Files to read
This plan's Contract section. `TabFactory.sol` and `Tab.sol` from the Barkeep repo (interfaces only).

### Official docs
https://book.getfoundry.sh/

### GitHub repositories
https://github.com/barbarosalagoz/barkeep-arc

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
Forge, solc 0.8.30. No OpenZeppelin. No upgrade plugin.

### Inputs
Phase 3 golden digest.

### Outputs
`src/PQRoot.sol` and interfaces. Deploy script that reads `DEPLOYER_PRIVATE_KEY` from the environment and refuses to run if `PQ_SIGNER_KEY_PATH` is unset or if the relayer address equals the deployer.

## VALIDATION BEFORE START
`grep` the contract for `selfdestruct`, `delegatecall`, `owner`, and `upgrade`. None should exist. The precompile address appears as a constant.

## EXECUTION
Write the contract as specified. Wire `digestFor` to the Phase 3 helper so the golden test calls the production function. Use custom errors. Approve the exact cap inside `OPEN_TAB`, never `type(uint256).max`.

## TESTS
Harness tests for nonce, deadline, exposure math, and decode errors. Label the directory `test/harness`. They are not PQ evidence.

## EXIT GATE
`forge test` passes on the harness. `forge build --sizes` shows PQRoot under the 24KB limit with room to spare. Deploy script dry-run (`forge script` without broadcast) compiles.

## FAILURE / STOP CONDITIONS
A desire to add a proxy, an owner, or a second contract. Stop and re-read I9. Size over 24KB is a stop; delete features rather than splitting authority.

## EVIDENCE LABELS
Harness: simulation. Bytecode size: measured in this phase.

# PHASE 5 — Invariants

## REQUIRED RESOURCES

### Files to read
Invariant table. Threat table.

### Official docs
https://book.getfoundry.sh/forge/invariant-testing

### GitHub repositories
None new.

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
Forge fuzz. No extra library.

### Inputs
Phase 4 contract.

### Outputs
`test/invariants/Exposure.t.sol` and `Nonce.t.sol` using the harness.

## VALIDATION BEFORE START
Harness cannot be selected by the deploy script. Assert that in the script with a comment and a path check.

## EXECUTION
Fuzz random sequences of open and close. `openExposure` never exceeds the max and never underflows. Failed opens do not change it. Nonce increases by exactly 1 on success and by 0 on `InvalidSignature`, `BadNonce`, and `Expired`. Replay of a consumed nonce reverts.

## TESTS
`forge test --fuzz-runs 1000`.

## EXIT GATE
Those properties hold for the run. Record the seed Forge prints.

## FAILURE / STOP CONDITIONS
Any invariant failure. Fix the contract before Phase 6. Do not weaken the assertion.

## EVIDENCE LABELS
Fuzz: simulation, reproducible from the seed.

# PHASE 6 — Factory integration

## REQUIRED RESOURCES

### Files to read
Barkeep `TabFactory.sol`, `Tab.sol`, `deployments/arc-mainnet.json`.

### Official docs
https://explorer.arc.io

### GitHub repositories
https://github.com/barbarosalagoz/barkeep-arc

### MCP/tools
Shell, `cast`.

### Skills
None.

### Browser/Chrome
Explorer only if `cast` output is unclear.

### External dependencies
The live factory. No fork of Barkeep.

### Inputs
Phases 4 and 5 passed. Deployer holds USDC.

## VALIDATION BEFORE START
On chain, today: `IMPLEMENTATION()` is `0x89B63f2E43dea9014750925C01996D34856B01D2` and `USDC()` is the pinned USDC. Re-check with `cast` before deploying. A mismatch is a STOP.

## EXECUTION
Deploy PQRoot to mainnet with `maxOpenExposure = 3_000_000` (3 USDC) and the production verifying key from `pq-keys/root.json` (generate it now with `keygen`, separate from the Phase 2 probe key). Record deploy tx, address, and block in `deployments/mainnet.json`. This file holds addresses and hashes only.

Send 2 USDC of the deployer's balance to PQRoot via ERC-20 `transfer`. Leave the rest.

Build a signed `OPEN_TAB`: agent = demo agent address, payees = `[deployer]`, `maxPerCall = 200_000`, expiry = now + 1 day, `cap = 1_000_000`. Relay it from the **relayer** key, funded first with 1 USDC for gas from the deployer.

Read `owner()`, `agent()`, `balance()`, `openExposure`.

## TESTS
The reads above. Allowance of the factory from PQRoot is 0. `openExposure == 1_000_000`. Root balance decreased by the cap. Tab balance equals the cap.

## EXIT GATE
All of those reads match. Explorer links saved.

## FAILURE / STOP CONDITIONS
`owner()` is the deployer or the relayer instead of PQRoot. Stop. Do not patch Barkeep. The factory's `msg.sender` rule was the whole integration. If it fails, the factory we called is not the factory we read.

`openTab` reverts on payee count or expiry. Fix the payload, do not raise limits in a private fork.

## EVIDENCE LABELS
Addresses and reads: VERIFIED once this phase is done.

# PHASE 7 — Tab lifecycle

## REQUIRED RESOURCES

### Files to read
Barkeep `close` and `isValidSignature`. This plan's reclaim rules.

### Official docs
https://docs.arc.io/arc/references/evm-differences

### GitHub repositories
https://github.com/barbarosalagoz/barkeep-arc

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
Explorer for the receipts.

### External dependencies
None new.

### Inputs
Phase 6 tab.

### Outputs
A second tab with expiry about three minutes ahead, used for reclaim. Transactions listed in `deployments/mainnet.json`.

## VALIDATION BEFORE START
Phase 6 tab is still open and the PQ seed still matches `pqVk()`.

## EXECUTION
On the short-lived tab: try `reclaim` before expiry and expect `NotExpired`. Wait. Call `reclaim` from the relayer. Expect the remainder back on PQRoot and `openExposure` reduced by that cap.

On the Phase 6 tab: do not close it yet. Phase 9 spends from it.

Call `tab.close()` directly from the deployer. Expect revert.

## TESTS
Receipt status and the state reads. A reverted reclaim is still a useful receipt; record it as `FINAL_REVERT` with the error.

## EXIT GATE
Early reclaim reverted. Late reclaim returned funds. Direct `close` reverted.

## FAILURE / STOP CONDITIONS
`reclaim` succeeds before expiry, or funds return to the relayer. Stop. That is a broken I8 or I9.

## EVIDENCE LABELS
Mainnet receipts: VERIFIED after execution.

# PHASE 8 — Treasury funding

## REQUIRED RESOURCES

### Files to read
USDC section of this plan.

### Official docs
https://docs.arc.io/arc/references/evm-differences

### GitHub repositories
None.

### MCP/tools
`cast`.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
USDC.

### Inputs
PQRoot address.

### Outputs
A note in `deployments/mainnet.json` of the funding tx from Phase 6, plus a 1 raw-unit transfer that must **not** be spendable by the agent (it sits on the root).

## VALIDATION BEFORE START
Display code, if any exists yet, uses `balanceOf`. If it does not exist yet, the check is a `cast call` only.

## EXECUTION
Confirm `balanceOf(PQRoot) * 1e12 == eth_getBalance(PQRoot)` (integer equality). Fund only with ERC-20 `transfer`. Attempt an unsigned transfer out; there is no function for it.

## TESTS
The equality. The failed unsigned exit (no such function).

## EXIT GATE
Equality holds. Root balance is whatever Phase 6 left plus the 1 raw unit.

## FAILURE / STOP CONDITIONS
The two balances disagree. Stop and re-read the decimals section before any UI work. Do not "fix" it by dividing the native balance by 1e6.

## EVIDENCE LABELS
Equality: measured in this phase.

# PHASE 9 — Agent spend

## REQUIRED RESOURCES

### Files to read
Barkeep `Tab.sol` signature layout (213 bytes) and `_transferDigest`.

### Official docs
https://eips.ethereum.org/EIPS/eip-3009
https://eips.ethereum.org/EIPS/eip-712

### GitHub repositories
https://github.com/barbarosalagoz/barkeep-arc

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
USDC on Arc. The agent's local key.

### Inputs
Phase 6 tab, still open.

### Outputs
Three txs: allowed spend, non-payee revert, over-max revert.

## VALIDATION BEFORE START
`validBefore <= expiry` and `validBefore > now`. `value <= maxPerCall`. `from` is the tab, not the agent and not the root.

## EXECUTION
Pack the 213-byte blob. Submit `transferWithAuthorization` from the relayer (gas) with the agent signature inside the blob. Pay the deployer 100000 raw units (0.1 USDC). Then submit a payee that is the relayer address. Then submit `maxPerCall + 1`.

Confirm Barkeep returns the magic `0x1626ba7e` on a simulated valid call and `0xffffffff` on the two refusals, by `eth_call` to `isValidSignature` before the failing broadcasts if you want a clean log. The broadcast reverts are the evidence.

## TESTS
Tab balance decreased by exactly 100000 on the success. Root balance did not decrease. The two refusals have receipt status 0. Agent still cannot call `execute`.

## EXIT GATE
Those four statements are true and written down with hashes.

## FAILURE / STOP CONDITIONS
The valid spend reverts. Most likely causes: domain version not `2`, blob not 213 bytes, `validBefore > expiry`, or `from` not the tab. Fix the payload. Do not add a PQ signature to the spend. That is the v1 design this plan rejected.

The invalid spend succeeds. Stop. I7 is false.

## EVIDENCE LABELS
Payment txs: VERIFIED after this phase.

# PHASE 10 — x402, optional

## REQUIRED RESOURCES

### Files to read
Barkeep `docs/HOW_IT_WORKS.md` and `docs/MAINNET.md`.

### Official docs
https://developers.circle.com/facilitator-service/how-it-works
https://developers.circle.com/openapi/facilitator-service.yaml

### GitHub repositories
https://github.com/barbarosalagoz/barkeep-arc

### MCP/tools
Shell. Browser only if the docs page and the OpenAPI disagree.

### Skills
None.

### Browser/Chrome
Circle docs if the YAML is not enough.

### External dependencies
`POST https://api.circle.com/v1/facilitator/x402/settle` with `Facilitator-Seller-Proof` for the keyless trial. Arc network `eip155:5042`.

### Inputs
A fresh tiny tab, or leftover room under `maxPerCall` on the Phase 6 tab.

### Outputs
Either a facilitator settlement tx hash, or a written `403` with the statement that Phase 9 is the payment proof.

## VALIDATION BEFORE START
Phase 9 passed. The payer address is the deployed tab.

## EXECUTION
Follow Circle's current seller request shape from the OpenAPI file you fetch that day. Do not invent a second payment protocol. One paid HTTP resource is enough if the trial works: the client pays by presenting the 3009 payload, and the seller POSTs it to Circle.

## TESTS
The settlement tx calls USDC `0xcf092995` and the tab balance drops. If Circle returns `registration_required`, record the body and stop this phase.

## EXIT GATE
A real facilitator tx, or a documented 403. Either one exits.

## FAILURE / STOP CONDITIONS
Do not block Phases 11–15 on this phase. Do not claim x402 in the demo script unless the facilitator tx exists.

## EVIDENCE LABELS
Trial availability: UNKNOWN until this call.

# PHASE 11 — Backend

## REQUIRED RESOURCES

### Files to read
Backend section of this plan.

### Official docs
https://docs.arc.io/arc/references/evm-differences
https://viem.sh (pin the version you install; do not trust a remembered API)

### GitHub repositories
None required. viem is the client. If a relay example is copied, record its URL and license in `backend/ATTRIBUTION.md`.

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
None.

### External dependencies
Node, viem, one HTTP library. Exact versions in `package-lock.json` with no carets on those two. TypeScript.

### Inputs
Deployed PQRoot. Relayer key. No PQ seed. No agent key. No deployer key.

### Outputs
`backend/` service implementing the routes in the Backend section.

## VALIDATION BEFORE START
`git grep` the backend for `PQ_SIGNER`, `DEPLOYER_PRIVATE`, and `AGENT_PRIVATE`. No matches.

## EXECUTION
Implement the routes. Simulate before broadcast. Fee rule: `maxFeePerGas = max(eth_gasPrice, 20 gwei)`. Map reverts to `REVERTED` with the custom error name when the ABI decodes it. Rate-limit `/relay`. CORS: no browser origin until the frontend exists; the CLI can call the API.

## TESTS
Start the server against mainnet reads. `GET /ready` is 200. `GET /root` matches `cast`. `POST /relay` with a mutated signature returns `SIMULATION_FAILED` and does not create a transaction (check the relayer nonce before and after). `POST /relay` with a genuine signed `TRANSFER` of 1 raw unit to the deployer succeeds and the receipt is `FINAL_SUCCESS`.

## EXIT GATE
Those three results. Relayer nonce is unchanged after the bad payload.

## FAILURE / STOP CONDITIONS
Any route that accepts a raw destination and calldata. Delete it.

## EVIDENCE LABELS
API behavior: VERIFIED after the tests. viem version: recorded here, previously UNKNOWN.

# PHASE 12 — Mainnet end-to-end

## REQUIRED RESOURCES

### Files to read
Demo requirements in this plan. `deployments/mainnet.json`.

### Official docs
https://explorer.arc.io

### GitHub repositories
The project repo, still without a push unless the operator asks.

### MCP/tools
Shell. Explorer in the browser to confirm the public page matches the receipt.

### Skills
None.

### Browser/Chrome
Explorer pages for each hash.

### External dependencies
All of the above, already deployed.

### Inputs
Phases 6, 7, 9, and 11 passed.

### Outputs
`deployments/EVIDENCE.md`: for each tx, hash, block, from, to, receipt status, state before, state after, and one sentence of what it proves. Source-verify PQRoot on the explorer if the explorer supports it. If it does not, record the exact `forge verify-contract` error and publish the source in the repo instead. Do not claim "verified" without the explorer badge or an equivalent public build.

## VALIDATION BEFORE START
Evidence file contains no `.env` values and no seeds.

## EXECUTION
One sitting, in order: show root balance, open a 0.5 USDC tab with a PQ signature through `/relay`, show `owner == PQRoot`, agent pays 0.05 USDC, over-cap reverts, tampered root signature reverts, short tab expires, stranger's relayer account calls `reclaim`, funds return.

## TESTS
Each row in `EVIDENCE.md` has a receipt and a state read.

## EXIT GATE
All nine demo steps have hashes. I1–I10 each point at one hash.

## FAILURE / STOP CONDITIONS
Any step "succeeds" in the UI or the API without receipt status 1 and a matching state read. That step is not done.

## EVIDENCE LABELS
This file is the VERIFIED set for the submission.

# PHASE 13 — Adversarial pass

## REQUIRED RESOURCES

### Files to read
Threat model table.

### Official docs
https://docs.arc.io/arc/references/evm-differences

### GitHub repositories
https://github.com/barbarosalagoz/barkeep-arc (confirm the factory bytecode hash is unchanged)

### MCP/tools
Shell.

### Skills
None.

### Browser/Chrome
None unless the explorer is needed.

### External dependencies
None.

### Inputs
Phase 12 evidence.

### Outputs
`deployments/ADVERSARIAL.md` with one row per threat-table line that can be executed, each with a hash or a test name. Donations, replay, tamper, early reclaim, direct `close`, random signature, and the decimal formatter are mandatory.

## VALIDATION BEFORE START
Factory code size is still 2355 bytes, or re-check `IMPLEMENTATION()` if the size differs because you measured differently. A changed `IMPLEMENTATION()` is a STOP.

## EXECUTION
Run the mandatory rows. Update the threat table's "Outcome" column only if a real result surprises you, and write the correction at the top of the file.

## TESTS
The rows are the tests.

## EXIT GATE
Every mandatory row matches the plan. Any surprise is either a contract fix plus a re-run, or a written change to the claim.

## FAILURE / STOP CONDITIONS
Agent spend decreases PQRoot balance other than by the funded cap. Stop and treat I7 as broken.

## EVIDENCE LABELS
ADVERSARIAL.md is VERIFIED for the rows it contains.

# PHASE 14 — Render

## REQUIRED RESOURCES

### Files to read
Backend section. `.env.example`.

### Official docs
https://render.com/docs/web-services

### GitHub repositories
The GitHub repo only if the operator chooses to deploy from Git. A Render deploy from a repo requires a push. Ask first. Until then, document the Render service and deploy only when the operator says to push.

### MCP/tools
Render API via the official CLI or HTTP, using `RENDER_API_KEY` from the environment. Do not echo the key.

### Skills
None.

### Browser/Chrome
Render dashboard only if the API is insufficient.

### External dependencies
Render web service. Node version equal to the version recorded in Phase 1.

### Inputs
Phase 11 tests passed. PQRoot address.

### Outputs
A running service. `BACKEND_URL` filled in `.env` locally. Render env contains only: `ARC_RPC_URL`, `ARC_CHAIN_ID`, `USDC_ADDRESS`, `PQ_PRECOMPILE_ADDRESS`, `BARKEEP_FACTORY_ADDRESS`, `BARKEEP_TAB_IMPLEMENTATION`, `PQROOT_ADDRESS`, `RELAYER_PRIVATE_KEY`, `X402_FACILITATOR_BASE`, `X402_NETWORK`.

Build command: `npm ci && npm run build`. Start: `node dist/index.js`. Health check path: `/health`.

## VALIDATION BEFORE START
The Render env var list does not include `DEPLOYER_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `GITHUB_TOKEN`, `VERCEL_TOKEN`, `RENDER_API_KEY`, or anything under `pq-keys/`.

## EXECUTION
Create the service. Set the health check. Deploy. `GET /ready` from outside must be 200. `GET /root` must match `cast` against the same RPC. Restart the service once and repeat `/ready`.

## TESTS
The two HTTP checks after a restart. Relayer nonce must not change across a restart with no relay call.

## EXIT GATE
Public `/ready` and `/root` match the chain.

## FAILURE / STOP CONDITIONS
The only way to "make it work" is to upload the PQ seed or the deployer key. Refuse and keep the relay on the operator machine.

## EVIDENCE LABELS
Service URL: recorded when deployed.

# PHASE 15 — Frontend contract

## REQUIRED RESOURCES

### Files to read
The next section of this plan. `deployments/mainnet.json`. `backend` route list.

### Official docs
https://explorer.arc.io

### GitHub repositories
None.

### MCP/tools
None.

### Skills
None. The future frontend agent may have its own. This phase does not build UI.

### Browser/Chrome
None.

### External dependencies
None.

### Inputs
PQRoot ABI from `out/PQRoot.sol/PQRoot.json` after Phase 4. Addresses from Phase 12.

### Outputs
`PQTABS/FRONTEND-CONTRACT.md` copied from the section below, with the real address, the real ABI path, and the real `BACKEND_URL` filled in. No `FRONTEND/` directory.

## VALIDATION BEFORE START
`FRONTEND/` does not exist. If someone added it, do not wire it until Phase 16.

## EXECUTION
Publish the ABI JSON (the compiler artifact, not a hand-written ABI) at `abi/PQRoot.json`. Fill the contract document.

## TESTS
A reader who was not in the room can name: which function opens a tab, which key signs it, which endpoint broadcasts it, and which read proves the owner.

## EXIT GATE
`FRONTEND-CONTRACT.md` has no TODOs and no private keys.

## FAILURE / STOP CONDITIONS
A mock balance "so the UI has something to show." Delete it.

## EVIDENCE LABELS
Addresses in that file are VERIFIED only if they match `deployments/mainnet.json`.

# PHASE 16 — Frontend integration, later

## REQUIRED RESOURCES

### Files to read
`FRONTEND-CONTRACT.md`. The `FRONTEND/` tree the other agent delivers.

### Official docs
The framework docs for whatever that tree actually uses. Do not assume a framework today.

### GitHub repositories
The frontend's dependency list, reviewed at integration time.

### MCP/tools
Browser via the Chrome tools, because this phase is the first UI. Use it to click the relay flow, not just to screenshot.

### Skills
Whatever the delivered frontend requires, chosen at that time. Not now.

### Browser/Chrome
The deployed Vercel URL and the explorer links it opens.

### External dependencies
Vercel, using `VERCEL_TOKEN` locally. Public env only: `VITE_` or `NEXT_PUBLIC_` RPC URL, chain id, PQRoot address, factory address, USDC address, backend URL, explorer URL. No private keys. No relayer key.

### Inputs
Phase 12 evidence. Phase 14 URL. A `FRONTEND/` directory that this plan did not create.

### Outputs
The UI reading live chain data and submitting only through `/relay` or through a wallet for actions that are already permissionless (`reclaim` after expiry). Root signing stays in the CLI.

## VALIDATION BEFORE START
Phases 12 and 14 passed. The UI repo contains no copy of `.env`.

## EXECUTION
Point the UI at the ABI and the addresses. Replace any fixture data. Walk the demo in the browser: balance matches `cast`, a signed file relayed from the UI shows a real receipt, a tampered file shows `SIMULATION_FAILED`.

## TESTS
The browser walk. Desktop width is enough unless the delivered CSS claims mobile layouts.

## EXIT GATE
The demo steps in Phase 12 are clickable, and every number on screen was read from the chain or from a receipt.

## FAILURE / STOP CONDITIONS
The UI needs the PQ seed in the browser. Stop. Change the UI, not the trust model.

## EVIDENCE LABELS
UI: not started. Do not mark this phase done in advance.

# MAINNET PROOF

The submission paragraph should contain the PQRoot address and one `OPEN_TAB` hash, then point at `deployments/EVIDENCE.md` for the rest.

| Claim | Evidence |
|---|---|
| Precompile checks the root | `OPEN_TAB` trace includes a call to `0x1800…0004` |
| Tab is owned by the root | `owner()` read |
| Agent can pay | `transferWithAuthorization` receipt status 1 and tab balance delta |
| Agent cannot overpay | receipt status 0 |
| Tampered root action does nothing | receipt status 0, nonce unchanged |
| Expiry returns funds without a PQ signature | `reclaim` receipt, root balance delta |
| Backend cannot sign | Render env list and the mutated-signature test |

Small amounts only. The deployer started at 10.782756 USDC and nonce 0. Spend well under that. Gas for a root action is on the order of a cent at a 20 gwei floor; Phase 2's `estimateGas` is the number to quote, not this sentence.

# DEPLOYMENT RUNBOOK

1. Confirm `.env` is gitignored.
2. Phase 1 versions recorded.
3. Phase 2 vectors pass.
4. Phase 3 digests match.
5. `keygen` into `pq-keys/root.json`.
6. Deploy from the deployer key. Write `deployments/mainnet.json`.
7. ERC-20 transfer 2 USDC to PQRoot.
8. Send 1 USDC to the relayer for gas.
9. Sign `OPEN_TAB` locally. Relay it.
10. Run Phase 9 spends.
11. Write `EVIDENCE.md`.
12. Deploy Render with the reduced env list.
13. Fill `FRONTEND-CONTRACT.md`.

A reverted transaction is final. Do not resubmit it hoping for a different result. Fix the payload, and if the nonce was not consumed, sign again only if the deadline still holds.

# RENDER DEPLOYMENT

Covered in Phase 14. Order: contract first, `PQROOT_ADDRESS` second, service third. Restart policy: Render's default restart on failure. Logs: error codes and tx hashes only.

# FUTURE FRONTEND CONTRACT

The other agent builds `FRONTEND/`. It connects to real data only.

## Addresses and ABI

- ABI: `abi/PQRoot.json` produced by Forge. Do not retype it.
- PQRoot: value in `deployments/mainnet.json` after Phase 6.
- Factory: `0xccebc58dd1f5937b36d5f9f89f0754424f4d443c`
- Tab implementation: `0x89B63f2E43dea9014750925C01996D34856B01D2`
- USDC: `0x3600000000000000000000000000000000000000`
- Precompile: `0x1800000000000000000000000000000000000004`
- Chain: 5042. RPC: `https://rpc.mainnet.arc.io`. Explorer: `https://explorer.arc.io/tx/` plus the hash, and `https://explorer.arc.io/address/` plus the address.

## Reads

`pqVk()`, `nextNonce()`, `maxOpenExposure()`, `openExposure()`, `tabs(address)`, `digestFor(bytes,uint64,uint64)`, USDC `balanceOf`, tab `terms()`, `closed()`, `balance()`, `owner()`.

Display USDC as `balanceOf / 1e6` with 6 digits. Never display `eth_getBalance / 1e6`.

## Writes the UI may send

| Action | Who signs | How it is sent |
|---|---|---|
| `execute` | PQ CLI, already done | `POST /relay` with the JSON file |
| `reclaim` | nobody | relayer or a browser wallet, after expiry |
| `retrySweep` | nobody | same |
| Agent spend | agent CLI | not a browser action in v1 |

The browser must not collect a seed or a private key.

## Events

`RootExecuted`, `TabOpened`, `TabClosed`, `SweepRetried`, `TreasuryTransfer`, `KeyRotated`. Tab history comes from `TabOpened` logs.

## Backend

`GET /health`, `GET /ready`, `GET /root`, `GET /tabs/:address`, `GET /tx/:hash`, `POST /relay`.

`/tx/:hash` returns `SUBMITTED`, `FINAL_SUCCESS`, `FINAL_REVERT`, or `DROPPED`. Show success only for `FINAL_SUCCESS`.

## Errors

Contract errors listed in the Contract section. Backend codes: `BAD_PAYLOAD`, `SIMULATION_FAILED`, `REVERTED`, `DROPPED`, `CHAIN_MISMATCH`, `NOT_READY`, `RATE_LIMITED`. Show the code. Do not parse a raw revert string except the precompile's length errors.

## UI states

Wrong network if the wallet is not on 5042. Loading while `/ready` is down. Root panel from `/root`. Tab panel from `/tabs/:address`. Relay idle, submitting, success (with explorer link), revert, dropped. Empty tab list is a real state, not a placeholder card.

## Env the frontend build may see

`NEXT_PUBLIC_ARC_RPC_URL` or the Vite equivalent, chain id, the four addresses, `NEXT_PUBLIC_BACKEND_URL`, explorer base. Nothing from the secret half of `.env`.

# ENVIRONMENT VARIABLE MASTER LIST

| Name | Class | When | Secret? |
|---|---|---|---|
| `ARC_RPC_URL` | public config | now | no |
| `ARC_CHAIN_ID` | public config | now | no |
| `ARC_EXPLORER_URL` | public config | now | no |
| `USDC_ADDRESS` | public config | now | no |
| `PQ_PRECOMPILE_ADDRESS` | public config | now | no |
| `BARKEEP_FACTORY_ADDRESS` | public config | now | no |
| `BARKEEP_TAB_IMPLEMENTATION` | public config | now | no |
| `DEPLOYER_ADDRESS` | public | now | no |
| `DEPLOYER_PRIVATE_KEY` | deployer only | now | yes, local only |
| `RELAYER_ADDRESS` | derived | Phase 1 | no |
| `RELAYER_PRIVATE_KEY` | relayer only | Phase 1 | yes, local and Render |
| `AGENT_ADDRESS` | derived | Phase 1 | no |
| `AGENT_PRIVATE_KEY` | agent only | Phase 1 | yes, local only |
| `PQROOT_ADDRESS` | public | Phase 6 | no |
| `PQ_SIGNER_KEY_PATH` | path | Phase 3 | the file is the secret, not the path |
| `X402_FACILITATOR_BASE` | public | Phase 10 | no |
| `X402_NETWORK` | public | Phase 10 | no |
| `CIRCLE_API_KEY` | optional | only if the trial returns 403 and the operator creates a key | yes |
| `RENDER_API_KEY` | deploy tooling | Phase 14 | yes, local only |
| `VERCEL_TOKEN` | deploy tooling | Phase 16 | yes, local only |
| `GITHUB_TOKEN` | deploy tooling | only if a push is requested | yes, local only |
| `GITHUB_REPO` | public | now | no |
| `BACKEND_URL` | public | Phase 14 | no |

Not used: `BARKEEP_TAB_ADDRESS` (there are many tabs), any Supabase key, any PQ seed variable, any AI API key.

# DO / DON'T

Do pin the factory, the implementation, the precompile, and `slh-dsa =0.2.0-rc.5`.

Do keep the PQ seed in `pq-keys/` and the deployer key on the operator machine.

Do treat a receipt plus a state read as the only success.

Do stop when a phase gate fails.

Don't build `FRONTEND/`.

Don't add a database, a proxy, an owner, a recovery key, or ERC-8004 in v1.

Don't fork Barkeep.

Don't put a PQ signature on the agent spend.

Don't use `pyspx`, `slh-dsa` 0.1.0, or a non-empty FIPS context.

Don't mix 6-decimal and 18-decimal units in the contract.

Don't broadcast below 20 gwei.

Don't mock the precompile and call the result a PQ test.

Don't commit `.env`, `pq-keys/`, or `signed-actions/`.

Don't push the GitHub repo unless the operator asks.

# KNOWN GOTCHAS

- Precompile `false` and precompile revert are different failures. Handle both.
- Barkeep `isValidSignature` never reverts. It returns `0xffffffff`. The revert you see is USDC's.
- Barkeep `close` sets `closed` even when the USDC transfer fails. Use `retrySweep`.
- Extra USDC sent straight to a tab is spendable by the agent.
- `openTab` uses `transferFrom`. The root must `approve` the exact cap in the same transaction.
- Payees are capped at 20.
- A signature binds the nonce. Two different actions at the same nonce cannot both execute.
- Dropped txs below 20 gwei never appear. Raise the fee; do not wait for a receipt.
- Blocklisted addresses make USDC revert. One bad payee fails that spend only; it does not drain the tab.
- Generic Forge forks do not run this precompile.
- The planning machine had no Foundry and no Rust. Phase 1 is real work, not a formality.

# UNRESOLVED UNKNOWNs

| Item | Blocks | What resolves it |
|---|---|---|
| `eth_estimateGas` of our own signed `execute` | Quoting a cost in the submission | Phase 2 and Phase 6 |
| `rustc` version that builds `slh-dsa` 0.2.0-rc.5 | Phase 3 | Phase 1 compile |
| Exact viem and Node versions | Backend pin | Phase 11, written into the lockfile |
| Circle keyless trial still open for a new seller | x402 claim only | Phase 10 |
| Explorer source-verify support for this contract | Badge vs "source in the repo" | Phase 12 |
| Byte-level identity of factory bytecode vs the GitHub build | Residual trust in the pinned address | Phase 13 code-size / `IMPLEMENTATION()` re-check. Behavior tests in Phase 6 are the real gate. |

None of these block writing the contract **after** Phase 2 passes. Phase 2 itself is the blocker for everything that follows.

# FINAL ACCEPTANCE CHECKLIST

- [ ] Phase 2 official vector returns `true` from this machine
- [ ] Phase 3 Rust digest equals Solidity digest
- [ ] PQRoot deployed, no owner, no proxy
- [ ] `pqVk` matches `pq-keys/root.json`
- [ ] A tab's `owner()` is PQRoot
- [ ] Agent payment receipt status 1, tab balance decreased, root balance not decreased beyond the cap
- [ ] Over-cap and non-payee receipts status 0
- [ ] Tampered PQ signature does not change nonce
- [ ] Replay does not run twice
- [ ] `reclaim` before expiry reverts; after expiry it returns USDC
- [ ] Render env has no deployer key and no PQ seed
- [ ] `.env` is gitignored and not in the repo
- [ ] `EVIDENCE.md` maps I1–I10 to hashes
- [ ] `FRONTEND/` was not created by this work
- [ ] No database was added
- [ ] x402 is claimed only if a facilitator tx exists
