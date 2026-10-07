# Derived index

Arc remains the authority. The database is a replay of logs.

`GET /v1/roots/:root/portfolio` reads the derived rows. It does not scan factory history, it does not wait for the backfill, and it does not call Arc. Registrar and root identity for a known root come from the same rows. A registrar with no stored root is reported as no root when the cursor is within 30 blocks of the head the indexer last observed. If the cursor is further behind and a live read is paused, the route returns 503 instead of claiming the wallet has no domain.

The background loop pages `eth_getLogs` at 2,000 blocks, under the public 9,999-block cap documented at https://docs.arc.io/arc/references/rpc-endpoints. When the cursor is caught up, a `newHeads` subscription on `wss://rpc.mainnet.arc.io` wakes that same loop for the next block. The subscription does not read logs itself. If the socket drops, the loop returns to polling `eth_getBlock`. Committed blocks are not rolled back. Ordering is block number, then log index. USDC spends are the ERC-20 `Transfer` from `0x3600…0000` only. The system emitter is not indexed, because that would double-count. The sender of a spend is the token log `from`, which is the capability, not the relayer.

`DATABASE_URL` selects hosted Postgres. Production uses Supabase Postgres 17 in `eu-west-1` through the session pooler, because the indexer holds transactions and node-postgres prepared statements. The connection string is a Render environment variable. It is not in the repository and it is not a `NEXT_PUBLIC_` value. The earlier Render Postgres `dpg-db38gcflk1mc739pi860-a` was free, expired on 2026-11-06, and is no longer the store the API reads. Its derived rows were copied first: 2 roots, 6 capabilities, 27 activity rows, and the cursor. Render's web service disk is ephemeral, so the embedded database is still not started there.

A portfolio read does not call Arc. It returns the stored capabilities. A swept close is a zero balance. A background reconciliation, at most every 30 seconds and only when the cursor is within 2,000 blocks of the head, writes the latest USDC balances, exposure, nonce, per-payment limits, and recipients. `GET /v1/index` reports `indexedBlock`, `chainHead`, `lag`, `lastSuccessfulIndex`, `lastError`, and `queueDepth`. It does not report secrets. `freshness` is `live` within 2 blocks of the head the indexer last observed, `recent` within 120, `indexing` when the cursor is further behind, and `degraded` when that head is not known yet.

Without `DATABASE_URL`, a local process uses an embedded Postgres file at `INDEX_PATH` or `.pqtabs-index`. On Render the embedded database is not started. The process that did start it restarted about every 30 seconds, and the portfolio route returned 502.

Wipe and replay:

```
cd backend
npm run build
node ../scripts/rebuild-index.mjs
```

The script deletes the derived rows and reads Arc again. It does not sign, and it does not change contracts.
