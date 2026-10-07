# Production gap audit

Code-verified 2026-10-07 from the current tree and `HISTORY.md`. This file is the gate before implementation. No indexer, contract, or frontend change is authorized by this document alone.

External Arc documentation and competitor mechanisms are not filled in here. That pass is still open. A cell that would require a live page or a repo that is not in this tree says so, instead of repeating an older note.

## Source ledger

Verified, and not to be re-derived unless the cited file or live behavior changes:

- `GET /v1/roots/:root/portfolio` calls `readPortfolio` (`backend/src/server.ts`). `readPortfolio` coalesces only requests already in flight for the same root (`backend/src/chain.ts`). There is no cross-request cache and no backend database.
- One portfolio read starts at factory block `24_623_258`, then windowed `eth_getLogs` for `TabOpened`, `TabClosed`, `TreasuryTransfer`, `KeyRotated`, and, when any tab exists, USDC `Transfer`. Each stream is scanned separately. The first window is 10,000 blocks. A range error restarts that stream at 4,000 blocks. Tab state is one `multicall` of seven reads per opened tab. `docs/API.md` still says the window is 4,000 blocks only.
- `HISTORY.md` records a completed portfolio read of about 11 seconds, and HTTP 429 on ordinary loads. The UI response to 429 is a named wallet error and a 20-second wait before Try again.
- `docs/ARCHITECTURE.md` states the backend is stateless and has no database. That was the previous rule. The production directive now allows Postgres for derived event state. The chain stays authoritative.
- Agent ECDSA keys live in a module `Map` (`frontend/src/data/spend.ts`). Reload clears them. A registrar change calls `forgetAgentKeys()` and `lockRoot()`. `localStorage` key `pqtabs.agent-labels.v1` stores a name, a purpose, and an address.
- The PQ signing key lives in memory in `frontend/src/data/pq-vault.ts`. Inside one unlocked session, open and close call `signRootDigest` without uploading the backup again. After reload, lock, or a registrar change, the backup file and passphrase are required again. Reclaim and retry-sweep do not use it.
- Wallet identity is `eth_accounts`, preferring `ethereum.selectedAddress`. `pqtabs.registrar` and `pqtabs.root` are the only account keys in `localStorage`. An account change deletes `pqtabs.root`.
- `PQRoot` public mutations are `execute` (open, close, transfer, rotate, set exposure), `reclaim`, and `retrySweep`. `RootFactory` is `createRoot` plus a registrar index. There is no owner, pause, or recovery function. The frontend prepares open and close only. Rotate, set exposure, and treasury transfer have no product screen.
- Barkeep `Tab.sol` is not in this repository. The pinned factory is `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c`. Tests use `MockBarkeep` / `MockTab`.
- Live chain facts already recorded: registrar `0xf76e…71a3`, root `0x846f…65Cf`, 139994 raw USDC, exposure 0, nonce 13, five closed capabilities, one of those closes permissionless. Registrar `0xbdfc…0034` has no root. A fresh-wallet create-root, fund, authorize, spend, and reclaim journey for that second wallet was not driven.

## Matrix

### Portfolio indexing

- Current behavior: every portfolio request rescans root logs from block 24,623,258 to head, then multicalls current tab state.
- Expected behavior: incremental ingestion once, then a fast read of derived rows plus a small live check of balances and open flags.
- Root cause: the reader is the indexer. History grows with the chain, not with the user’s tab count.
- Security impact: a failed or partial scan can omit a capability or an activity row. It does not let the backend sign.
- UX impact: multi-second waits and a full-page 429. The last known treasury can remain, but the capability list does not.
- Performance impact: five log streams times the number of windows, plus one block read and one multicall. History records about 11 seconds and 429s.
- Competitor comparison: not filled. Awaiting the live source pass.
- Arc relevance: log range limits and read throttling are already observed against the public RPC. Official indexing guidance is not cited until that page is read in this pass.
- Required change: durable derived store, backfill, then a cursor. Portfolio becomes that store plus one batched live read. Do not add another in-request retry loop as the fix.
- Risk: a cursor that advances before rows commit will hide events until a rebuild. The database must be reconstructable from Arc.
- Test required: rebuild from zero matches a direct log read; duplicate logs do not double-apply; a crash between row write and cursor write does not skip events.
- Deployment impact: backend and a database. Render env gains a database URL. The relayer key stays on Render. No contract deploy.

### Rate limits and stale reads

- Current behavior: process-memory 60 reads per minute per IP, eight RPC retries, then HTTP 429. The screen waits 20 seconds and offers Try again.
- Expected behavior: indexed reads rarely touch `eth_getLogs`. A live-head check that is rate-limited shows the last confirmed block and does not sit on Loading.
- Root cause: the hot path is a history scan, so retries multiply the same expensive calls.
- Security impact: none on authority. A user can mistake an unfinished list for an empty list if a future change drops the loading gate.
- UX impact: the product feels down when Arc throttles history scans.
- Performance impact: retries add delay on top of the 11-second scan.
- Competitor comparison: not filled.
- Arc relevance: observed on `rpc.mainnet.arc.io`.
- Required change: coalescing stays; history scans leave the request path. Degraded states are loading, updating, stale-through-block, and unavailable.
- Risk: serving a scan result from memory across requests without a block watermark would hide a new tab.
- Test required: two overlapping portfolio calls share one scan today; after the indexer, a request must not issue a factory-to-head `getLogs`.
- Deployment impact: backend. Frontend copy for the degraded states.

### Wallet identity

- Current behavior: the selected permitted account is the registrar. Stored registrar and root are hints. A real switch to `0xbdfc…0034` showed an empty domain and not root `0x846f…65Cf`.
- Expected behavior: the same isolation after the indexed read exists, including a switch back to a wallet that has a root.
- Root cause: isolation is implemented in the client store. It has not been re-proved against a second root in this browser since the later deploys, because this Chrome profile’s selected account has no root.
- Security impact: a bug in the new indexer’s registrar filter would leak another user’s rows. That filter does not exist yet.
- UX impact: wallet 2 still lands on first-time setup, which is correct. Returning to wallet 1 is unproven on the latest frontend.
- Performance impact: none.
- Competitor comparison: not filled.
- Arc relevance: chain id 5042 is checked before create-root and deposit.
- Required change: keep the wallet as the only boot identity. The indexer must key rows by root and registrar, and the API must not return another registrar’s root for the selected wallet.
- Risk: `pqtabs.root` could point at a root the new registrar does not own. The loader already ignores a stored root that is not in that registrar’s factory list.
- Test required: two registrars, two roots, no shared tab, and a browser switch in both directions.
- Deployment impact: frontend and the new read API. No contract deploy.

### Root backup and session

- Current behavior: one unlock works for later open and close in the same page session. Reload requires the file and passphrase again. Lost file and lost device means the USDC stays in the root.
- Expected behavior: the mandatory encrypted `PQTABS1` backup remains. The unlocked key stays for the session and locks on logout or account switch. The screen does not show key bytes or a 7856-byte signature.
- Root cause: the key is a module variable. That matches “do not persist the seed,” and it also matches the complaint that every visit feels like a ceremony.
- Security impact: persisting the decrypted key would be a regression. Persisting only the encrypted backup in the browser would still require the passphrase.
- UX impact: a returning user with a root must find the file before any PQ action.
- Performance impact: Argon2id unlock and SLH-DSA sign are slow. They are not the 11-second portfolio wait.
- Competitor comparison: not filled.
- Arc relevance: the signature is verified by the SLH-DSA precompile. The product must not move that check off Arc.
- Required change: design the session unlock so a refresh does not demand the file again, without writing the signing key to `localStorage` or to Render. Do not invent operator recovery.
- Risk: any new storage of the decrypted key is a theft path on a shared machine.
- Test required: unlock, reload, authorize still signs; switch wallet and the previous key is locked; the backup file format still matches `pqtabs-sign backup`.
- Deployment impact: frontend only, unless the encrypted blob is stored server-side. Server-side storage of the encrypted backup is not decided.

### Agent key continuity

- Current behavior: the agent key exists only until reload. The name survives. After reload the UI says the agent cannot spend. There is no export of an encrypted agent key.
- Expected behavior: the user never pastes a private key. If the agent is supposed to keep paying after refresh, a secure continuity path exists and is explained before creation. If it is device-session-only, that is stated before Create, not after the key is already gone.
- Root cause: the key was kept out of `localStorage` on purpose. The product then still says “create an agent” as if the agent outlives the tab.
- Security impact: writing the raw key to `localStorage` would expose it to any script on the origin.
- UX impact: a created agent becomes unable to pay, with the explanation after the fact.
- Performance impact: none.
- Competitor comparison: not filled.
- Arc relevance: the spend is an EIP-3009 signature over USDC, relayed by the backend. The backend does not hold the agent key.
- Required change: choose one model after this audit is complete: encrypted browser vault with unlock, or an explicit session-only agent with a real export. Do not store a raw key.
- Risk: a vault passphrase that is the same as the root passphrase widens a single theft. A vault that cannot be restored makes the agent as fragile as the session map.
- Test required: create agent, reload, and either spend still signs or the pre-create copy already said it would not.
- Deployment impact: frontend. No contract deploy. Agent identity is not on `PQRoot`.

### Contract surface

- Current behavior: one root per `createRoot`, PQ `execute` for open, close, transfer, rotate, and exposure, plus permissionless reclaim and retry-sweep. No admin key.
- Expected behavior: the deployed bytecode stays the production contract unless a gap is proven and a versioned migration is written. Existing roots must not be stranded.
- Root cause: the contract is a hackathon-sized authority boundary. Rotate and treasury transfer exist on chain and are absent in the product, so the UI is narrower than the chain, not the reverse.
- Security impact: adding recovery or an upgrade switch to this factory is impossible without a new factory. A second unexplained factory would split users.
- UX impact: users cannot rotate the root key in the product even though `execute` kind 4 exists.
- Performance impact: none.
- Competitor comparison: not filled.
- Arc relevance: PQ verification is the load-bearing Arc primitive. USDC pays gas. That does not by itself require new Solidity.
- Required change: no contract edit in the indexer work. A later completeness pass may justify rotate in the product against the current ABI. New bytecode requires a migration document and a new security gate.
- Risk: redeploying “for completeness” strands the funded root `0x846f…65Cf`.
- Test required: existing forge tests remain the gate for this bytecode. New tests only if a new function is actually added.
- Deployment impact: none until a migration is proven.

### Barkeep fidelity

- Current behavior: production opens tabs through the pinned factory. This repo does not contain Barkeep’s `Tab.sol`. Tests use a mock.
- Expected behavior: indexer event decoding and UI labels match the pinned Barkeep source, not the mock.
- Root cause: the dependency is recorded as a commit hash in `docs/DEPENDENCIES.md` and is not checked out here.
- Security impact: a mock that disagrees with production close, sweep, or payee behavior can hide a real revert.
- UX impact: low until the indexer decodes Barkeep logs incorrectly.
- Performance impact: none.
- Competitor comparison: Barkeep is the capability primitive this product calls. A judgment of “better UX than Barkeep” is not made without the current Barkeep source.
- Arc relevance: the tab is a normal contract on Arc. The PQ check is in `PQRoot`, not in the tab.
- Required change: read the pinned Barkeep sources before encoding their events into a database. Do not treat `test/mocks/Mocks.sol` as production semantics.
- Risk: indexing a wrong `TabClosed` or spend topic silently drops activity.
- Test required: a fixture log decoded by the indexer matches a known mainnet open, spend, and close receipt already in `HISTORY.md`.
- Deployment impact: none by itself.

### Fresh-user proof

- Current behavior: wallet `0xf76e…71a3` has authorized, spent, and closed on the production origin. Wallet `0xbdfc…0034` has been shown an empty setup screen and has not created a domain.
- Expected behavior: one additional real wallet completes create-root, a tiny fund, an agent, a capability, a payment, and close or reclaim, without a pasted signature or private key.
- Root cause: that journey was deliberately not started from this browser without an explicit backup and a wallet confirmation.
- Security impact: shipping an indexer does not prove the product if only the original registrar is exercised.
- UX impact: the empty-wallet screen is still the unproven half of onboarding.
- Performance impact: the first portfolio after create-root should be the indexed path, not a full rescan.
- Competitor comparison: not filled.
- Arc relevance: the receipt is the proof.
- Required change: after the indexer and the agent-continuity decision, drive that journey once. Do not create the domain as a side effect of writing this audit.
- Risk: a backup downloaded and then lost strands the new root’s USDC.
- Test required: the Arc receipt, the indexed portfolio, and a second registrar that still cannot see the new root.
- Deployment impact: production frontend, backend, and database already live before the journey.

## Not decided yet

- Database host. Postgres is allowed. Supabase is allowed if it is only derived state. The connection string belongs in Render, not in `NEXT_PUBLIC_*`.
- Whether the encrypted root backup may live in the browser. The decrypted signing key must not.
- Whether agent continuity is an encrypted vault or a stated session limit.
- Whether on-chain rotate should become a product action against the current `PQRoot` ABI.
- Competitor mechanism notes. They stay out of this file until the live source pass returns a URL or a repo path.
