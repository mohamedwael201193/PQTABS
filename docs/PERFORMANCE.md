# Performance

Measured against production after the portfolio read stopped calling Arc. Two samples are not a percentile.

| Read | When | Result |
|---|---|---|
| `GET /v1/index` | Render `dep-db39mggg6u5c73cifnm0`, commit `fbbd232` | HTTP 200 in 0.36s. Cursor 24779278. Head 24779282. Lag 4. |
| Portfolio, first sample | same deploy, root A | HTTP 200 in 0.62s. `freshness: recent`. 5 capabilities, 0 open, 23 activity rows. Balances and per-payment limits were already stored. |
| Portfolio, second sample | same deploy, immediately after | HTTP 200 in 0.96s. `freshness: live`. Same 5 capabilities. |

Earlier reads on the previous deploys: 2.15s then 0.39s while live Arc calls were paused (`ab2ece0`), 1.64s stored (`9cc4040`), 3.46s HTTP 429 (`18984cc`), and a 25s timeout when the request waited on the backfill (`9eb8dbf`). Those paths are not what `fbbd232` serves.

The warm target under 500ms is not met by the 0.62s and 0.96s samples. The typical target under 1s is met by those two samples only. No P50 or P95 series exists yet.

What a normal portfolio request does now:

- One SQL read of stored rows.
- No `eth_getLogs`, no `balanceOf`, no multicall, no `eth_getBlock`.
- Freshness comes from the indexer's last noted head. Lag of 2 blocks or fewer is `live`. Lag through 120 blocks is `recent`. A larger gap is `indexing`. An unknown head is `degraded`.

What still costs time:

- Render's free web service sleeps. The first request after idle includes a cold start. That is hosting, not a chain scan.
- The API is in Frankfurt and the database pooler is in `eu-west-1`.
- Background reconciliation still uses one multicall, at most every 30 seconds, and only when the cursor is within 2,000 blocks of head and no ingest read is in flight.
- The ingest loop still pages `eth_getLogs` at 2,000 blocks. A rate limit is recorded on `GET /v1/index` and does not fail the portfolio response.

Chrome on `https://pqtabs.vercel.app` with wallet `0xBDfC…0034` loaded config and `GET /v1/registrars/…/roots` (`count: 0`). It did not request root A's portfolio.
