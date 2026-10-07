# Derived index

Arc remains the authority. The database is a replay of logs.

`GET /v1/roots/:root/portfolio` reads those rows and then one multicall for balances, open flags, payees, and the per-payment limit. It does not scan factory history. A gap of 30 blocks or fewer is ingested inside that request so a transaction that just landed is included. A larger gap returns `freshness: "indexing"` and `indexedThrough`. The screen keeps the treasury balance and says which block the list has reached.

The background loop pages `eth_getLogs` at 2,000 blocks, under the public 9,999-block cap documented at https://docs.arc.io/arc/references/rpc-endpoints. Committed blocks are not rolled back. Ordering is block number, then log index. USDC spends are the ERC-20 `Transfer` from `0x3600…0000` only. The system emitter is not indexed, because that would double-count. The sender of a spend is the token log `from`, which is the capability, not the relayer.

`DATABASE_URL` selects Postgres. Without it, a local process uses an embedded Postgres file at `INDEX_PATH` or `.pqtabs-index`. On Render the embedded database is not started unless `DATABASE_URL` is set. The process that did start it restarted about every 30 seconds, and the portfolio route returned 502. Until a hosted database URL is set, that service keeps the direct reader. Do not put the database URL in a `NEXT_PUBLIC_` variable.

Wipe and replay:

```
cd backend
npm run build
node ../scripts/rebuild-index.mjs
```

The script deletes the derived rows and reads Arc again. It does not sign, and it does not change contracts.
