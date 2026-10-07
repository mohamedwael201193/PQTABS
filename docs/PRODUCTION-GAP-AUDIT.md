# Production gap audit

Code-verified 2026-10-07 from the current tree and `HISTORY.md`. This file is the gate before implementation. No indexer, contract, or frontend change is authorized by this document alone.

Arc documentation and competitor mechanisms below were read on 2026-10-07 from the live pages and repositories named in each row. Firecrawl could not fetch those pages. The text used here came from the pages themselves and from raw GitHub files.

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
- Arc’s indexing page says: subscribe to new heads, page `eth_getLogs` (sample batch 1,000; public cap 10,000 blocks, error `-32012`, so page at 9,999 or below), order by block number then log index, and do not build Ethereum reorg rollback for committed blocks. https://docs.arc.io/integrate/infrastructure/indexing-events and https://docs.arc.io/arc/references/rpc-endpoints
- Deterministic finality is Malachite BFT: a committed block is treated as irreversible. That does not make a pending transaction final, and a reverted inclusion (`status: 0`) still happened. https://docs.arc.io/arc/concepts/deterministic-finality
- Native USDC `Transfer` logs come from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` at 18 decimals. The ERC-20 face `0x3600…0000` also emits 6-decimal `Transfer`. Indexing both without filtering double-counts. Gas spent does not emit `Transfer`. For EIP-3009, `tx.from` is the relayer; the token log’s `from` is the tab. https://docs.arc.io/integrate/infrastructure/indexing-events
- SLH-DSA-SHA2-128s verification is precompile `0x1800000000000000000000000000000000000004`. `verifySlhDsaSha2128s` takes a 32-byte key and a 7856-byte signature. Native PQ wallet signing is documented as future. https://docs.arc.io/arc/concepts/post-quantum-security and https://github.com/circlefin/arc-node/blob/main/contracts/src/pq/IPQ.sol
- `arc-node` README still says the network is in testnet. https://docs.arc.io/ and https://docs.arc.io/arc/references/connect-to-arc say mainnet chain id 5042 is live. The docs win. https://docs.arc.io/arc-chain still shows chain id 5042002 in its network table. https://docs.arc.io/arc/references/gas-and-fees still says “may change before mainnet launch.”
- This process has no `DATABASE_URL`. A durable index cannot be turned on in production until that exists. Render is still serving the scan.

## Matrix

### Portfolio indexing

- Current behavior: every portfolio request rescans root logs from block 24,623,258 to head, then multicalls current tab state.
- Expected behavior: incremental ingestion once, then a fast read of derived rows plus a small live check of balances and open flags.
- Root cause: the reader is the indexer. History grows with the chain, not with the user’s tab count. The first window is 10,000 blocks, which is the size the public RPC rejects (`-32012`). A range error restarts the stream at 4,000. Official paging is 9,999 or below. https://docs.arc.io/arc/references/rpc-endpoints
- Security impact: a failed or partial scan can omit a capability or an activity row. It does not let the backend sign.
- UX impact: multi-second waits and a full-page 429. The last known treasury can remain, but the capability list does not.
- Performance impact: five log streams times the number of windows, plus one block read and one multicall. History records about 11 seconds and 429s.
- Competitor comparison: Pigeonhole pages logs at 9,000 blocks and keeps no database, so a wide query can still show a false unpaid state. PoolLens is a view call, not a history scan. Neither is a multi-root portfolio. https://github.com/edycutjong/pigeonhole and https://github.com/babaanalytix-commits/baba-lens
- Arc relevance: committed blocks do not need reorg rollback. Order is block number plus log index, because two blocks can share a timestamp. Resume from the last processed block. https://docs.arc.io/integrate/infrastructure/indexing-events
- Required change: durable derived store, historical backfill, then a cursor. Portfolio becomes that store plus one batched live read of balances and open flags. Page logs at 9,999 blocks or fewer. Do not add another in-request retry loop as the fix.
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
- Competitor comparison: Pigeonhole’s own write-up says a 10,000-block query returns `-32012` and a burst can return `-32005`. Arc’s RPC page documents `-32012` and a 10,000-block cap. It does not document `-32005`. https://docs.arc.io/arc/references/rpc-endpoints
- Arc relevance: a load-balanced head can return `-32014` if `eth_blockNumber` and `eth_getLogs` hit different backends. A cursor must not treat those two calls as one atomic height.
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
- Competitor comparison: Barkeep, arc-guard, A-Identity, and AgentPay all key the user by a wallet or an owner key. None of those repositories show a second user’s root being served for the first user’s wallet. https://github.com/barbarosalagoz/barkeep-arc and https://github.com/Jayanthkoppala/arc-guard
- Arc relevance: chain id 5042 is the documented mainnet. The arc-chain table that still lists 5042002 is stale. https://docs.arc.io/arc/references/connect-to-arc
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
- Competitor comparison: arc-guard generates the SLH-DSA key in the browser and uses it for withdraw and key rotation. PQ Release Log uses SLH-DSA to publish artifacts and moves no value. Neither product is a Barkeep capability. https://github.com/Jayanthkoppala/arc-guard and https://github.com/wayfold-labs/pq-release-log
- Arc relevance: the precompile verifies the signature. It does not sign, and wallet transactions are still classical. https://docs.arc.io/arc/concepts/post-quantum-security
- Required change: design the session unlock so a refresh does not demand the file again, without writing the signing key to `localStorage` or to Render. Do not invent operator recovery.
- Risk: any new storage of the decrypted key is a theft path on a shared machine.
- Test required: unlock, reload, authorize still signs; switch wallet and the previous key is locked; the backup file format still matches `pqtabs-sign backup`.
- Deployment impact: frontend only, unless the encrypted blob is stored server-side. Server-side storage of the encrypted backup is not decided.

### Agent key continuity

- Current behavior: creating an agent encrypts the ECDSA key in IndexedDB with a non-extractable AES-GCM key that stays in this browser. The Agents page says that before creation. A passphrase file in format `PQTABS-AGENT-1` can move the key to another device. `localStorage` still stores only the name, purpose, and address. A registrar change drops the in-memory copies and loads only that registrar's vault. This reload path has not been exercised in Chrome on the production origin yet.
- Expected behavior: the user never pastes a private key. The agent can sign again after a refresh in the same browser. Another device needs the encrypted backup.
- Root cause: a module `Map` died with the page, so a created agent stopped being able to pay.
- Security impact: the raw key is not written to `localStorage`. Any script that already runs on this origin can still ask IndexedDB to decrypt, because the wrap key is origin-bound and has no passphrase.
- UX impact: the copy now says the key stays encrypted in this browser, and the agent drawer can export or restore a backup.
- Performance impact: none on portfolio reads.
- Competitor comparison: Barkeep keeps the agent key in the MCP process and the owner key in a separate process. A-Identity’s operator is often a server signer. AgentPay’s suggested limits are off-chain; a stolen signer can pay any recipient the allowance allows. https://github.com/barbarosalagoz/barkeep-arc and https://github.com/enstest1/arc-agentpay
- Arc relevance: the spend is an EIP-3009 signature over USDC, relayed by the backend. The backend does not hold the agent key. The activity row must use the token log’s `from`, not `tx.from`.
- Required change: prove create, reload, and sign on the production origin. Do not store a raw key.
- Risk: a stolen browser profile can unwrap the key without a passphrase. The exported file still needs its passphrase.
- Test required: `npm run test:agent-vault` in `frontend/` checks that the backup ciphertext does not contain the key and that the wrong passphrase fails. A Chrome reload spend is still open.
- Deployment impact: frontend. No contract deploy. Agent identity is not on `PQRoot`.

### Contract surface

- Current behavior: one root per `createRoot`, PQ `execute` for open, close, transfer, rotate, and exposure, plus permissionless reclaim and retry-sweep. No admin key.
- Expected behavior: the deployed bytecode stays the production contract unless a gap is proven and a versioned migration is written. Existing roots must not be stranded.
- Root cause: the contract is a hackathon-sized authority boundary. Rotate and treasury transfer exist on chain and are absent in the product, so the UI is narrower than the chain, not the reverse.
- Security impact: adding recovery or an upgrade switch to this factory is impossible without a new factory. A second unexplained factory would split users.
- UX impact: users cannot rotate the root key in the product even though `execute` kind 4 exists.
- Performance impact: none.
- Competitor comparison: Barkeep’s owner is a classical key that can drain the treasury and open tabs. arc-guard’s wallet can start a 7-day exit without the PQ key. A-Identity’s owner can withdraw the vault. Those are the gaps `PQRoot` is meant to close. Adding their extra product surface to this factory is not justified by that comparison. https://github.com/barbarosalagoz/barkeep-arc and https://github.com/Jayanthkoppala/arc-guard
- Arc relevance: PQ verification is the load-bearing Arc primitive. USDC pays gas. The precompile authors say not to rely on it alone and to pair it with a classical signature. This product’s classical signer is the relayer, not a second owner of the treasury. https://github.com/circlefin/arc-node/blob/main/contracts/src/pq/IPQ.sol
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
- Competitor comparison: Barkeep’s published contract funds a clone with an exact cap and checks ERC-1271 over EIP-3009. Payees, `maxPerCall`, and expiry are immutable. `close()` is owner-only. A stolen agent key spends only that tab. A stolen owner key drains the treasury. https://github.com/barbarosalagoz/barkeep-arc The pinned commit in `docs/DEPENDENCIES.md` is `60f4b608`. That file is still not in this tree, so the indexer must not decode Barkeep logs from the mock.
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
- Competitor comparison: Payrun, Legwork, MergePay, BountyAgent, A NEW ONE, and Arc-Stream solve payroll, keeper jobs, GitHub escrow, bounties, a launchpad, or a payment channel. None of those repositories combine an SLH-DSA root with a Barkeep tab. https://github.com/s21v1d9p/arcpayrun and https://github.com/barbarosalagoz/barkeep-arc
- Arc relevance: the receipt is the proof. A successful inclusion is final. A `status: 0` receipt is still an inclusion and must not be shown as a payment.
- Required change: after the indexer and the agent-continuity decision, drive that journey once. Do not create the domain as a side effect of writing this audit.
- Risk: a backup downloaded and then lost strands the new root’s USDC.
- Test required: the Arc receipt, the indexed portfolio, and a second registrar that still cannot see the new root.
- Deployment impact: production frontend, backend, and database already live before the journey.

## Where PQTABS is stronger, and where it is not

Stronger, from the repositories above: the treasury owner is an SLH-DSA root, not a classical EOA, and the agent’s reach is a real Barkeep tab. Barkeep’s owner key can open tabs and drain the treasury. arc-guard has PQ withdraw but no capability. AgentPay, A-Identity, Arc-Stream, Legwork, Payrun, MergePay, BountyAgent, and A NEW ONE do not put SLH-DSA under the funds. PQ Release Log uses the precompile and moves no USDC. PoolLens moves no USDC. Pigeonhole has no agent.

Not stronger yet: Pigeonhole and PoolLens answer a read without scanning factory history on every request. arc-guard lets the PQ key cancel a wallet-started exit. A-Identity enforces a daily cap in the vault. Arc-Stream settles many off-chain vouchers with one transaction. None of those missing behaviors authorize a new `PQRoot` until a migration is proven.

## Not decided yet

- Supabase Postgres is the derived store. Render's disk is not. The free Render web service can still sleep, so the first request after idle is a hosting delay, not an index scan.
- The indexer polls `eth_getLogs` for history. When the cursor is caught up it also listens for `newHeads` and the poll remains the fallback.
- The encrypted root backup is still a file the user holds. The decrypted signing key is not stored.
- On-chain rotate and treasury transfer exist on `PQRoot` and are not product actions.
- A Chrome proof that an agent pays after refresh, and a fresh-wallet mainnet journey, are still open.
