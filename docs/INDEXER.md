# Derived index

Arc remains the authority. The database is a replay of logs.

`GET /v1/roots/:root/portfolio` reads the derived rows. It does not scan factory history and it does not wait for the backfill. While a backfill read is in flight, or for 15 seconds after Arc rate-limits a live read, the response is those stored rows with `freshness: "degraded"`. A swept close is a zero balance. An open capability without a fresh Arc read is returned with `balanceKnown: false` rather than a made-up balance. When the backfill is idle and the cursor is within 2,000 blocks, the response adds one multicall for balances and open flags. `freshness` is `live` within 2 blocks, `recent` within 120, and `indexing` when the cursor is further behind but the stored rows are still returned. Registrar and root identity use the same rule: the indexed row is served immediately when Arc is busy, and the balance is marked unconfirmed until a live read succeeds.

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
