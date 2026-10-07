# Derived index

Arc remains the authority. The database is a replay of logs.

`GET /v1/roots/:root/portfolio` does not scan factory history. When the cursor is within 120 blocks, that request ingests the gap and then one multicall reads balances, open flags, payees, and the per-payment limit. When the cursor is within 2,000 blocks, the stored capabilities are returned with that live check and `freshness` of `live`, `recent`, or `indexing`. A larger gap returns `indexing` immediately and does not pretend the list is empty because of a rate limit.

The background loop pages `eth_getLogs` at 2,000 blocks, under the public 9,999-block cap documented at https://docs.arc.io/arc/references/rpc-endpoints. Committed blocks are not rolled back. Ordering is block number, then log index. USDC spends are the ERC-20 `Transfer` from `0x3600…0000` only. The system emitter is not indexed, because that would double-count. The sender of a spend is the token log `from`, which is the capability, not the relayer.

`DATABASE_URL` selects hosted Postgres. The production database is Render Postgres `dpg-db38gcflk1mc739pi860-a` in Frankfurt, plan `free`, Postgres 16. It expires on 2026-11-06. Render deletes an expired free database after a 14-day grace period unless it is upgraded. The rows are derived, so `scripts/rebuild-index.mjs` can recreate them from Arc. The connection string is a Render environment variable. It is not in the repository and it is not a `NEXT_PUBLIC_` value.

Without `DATABASE_URL`, a local process uses an embedded Postgres file at `INDEX_PATH` or `.pqtabs-index`. On Render the embedded database is not started. The process that did start it restarted about every 30 seconds, and the portfolio route returned 502.

Wipe and replay:

```
cd backend
npm run build
node ../scripts/rebuild-index.mjs
```

The script deletes the derived rows and reads Arc again. It does not sign, and it does not change contracts.
