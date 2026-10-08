# Performance

Measured from this machine against `https://pqtabs.onrender.com` on 2026-10-08, while Render `dep-db3evfeq1p3s73f5nmag` of `0e1efca` was already awake. The rank is `round(percentile / 100 * (n - 1))` on the sorted client times. These times include the path to Frankfurt. `/v1/index` and the registrar route do not set `Server-Timing`.

| Read | n | HTTP | P50 | P95 | P99 | Min | Max |
|---|---|---|---|---|---|---|---|
| `GET /v1/index` | 21 | 200 | 306ms | 414ms | 475ms | 242ms | 475ms |
| `GET /v1/registrars/0xBDfC…0034/roots` | 21 | 200 | 276ms | 347ms | 408ms | 258ms | 408ms |
| `GET /v1/roots/0x846f…65Cf/portfolio` | 11 | 200 | 354ms | 3160ms | 3160ms | 282ms | 3160ms |

The portfolio P95 and P99 are the same request because this sample has 11 rows and that request was the slowest. The other portfolio times in the summary sit at or below the 354ms median. `Server-Timing` was not captured on those 11. One later portfolio read was HTTP 200 in 734ms with `Server-Timing: app;dur=413`. An earlier single portfolio read, on `dep-db3a8vk9v7es73ckrpi0`, was 0.52s with `app;dur=193`. Handler time is not stable at 193ms.

The first registrar request after the index series returned HTTP 503. Its body was not saved, so the cause is not identified. The 21 registrar times above are the requests that followed.

A cache-bypass reload of `https://pqtabs.vercel.app` in the user's Chrome, wallet `0xBDfC…0034`, recorded one `GET /v1/config` at 3692ms and one registrar read at 1698ms. Both were HTTP 200. The page did not call the portfolio route, did not call Arc RPC, and did not receive 429. The loaded script `1-1w82nt3ognk.js` contains "No further payment was sent".

Earlier single samples, before this series: index 0.36s on `fbbd232`; portfolio 0.62s and 0.96s on that deploy; then 2.15s and 0.39s while live Arc calls were paused (`ab2ece0`), 1.64s stored (`9cc4040`), 3.46s HTTP 429 (`18984cc`), and a 25s timeout when the request waited on the backfill (`9eb8dbf`). Those paths are not what the current portfolio route does.

What a normal portfolio request does now:

- Four stored-row queries issued together. No second wait for the cursor.
- No `eth_getLogs`, no `balanceOf`, no multicall, no `eth_getBlock`.
- Freshness comes from the indexer's last noted head. Lag of 2 blocks or fewer is `live`. Lag through 120 blocks is `recent`. A larger gap is `indexing`. An unknown head is `degraded`.

What still costs time:

- Render's free web service sleeps. The first request after idle includes a cold start. That is hosting, not a chain scan.
- The API is in Frankfurt and the database pooler is in `eu-west-1`.
- Background reconciliation still uses one multicall, at most every 30 seconds, and only when the cursor is within 2,000 blocks of head and no ingest read is in flight.
- The ingest loop still pages `eth_getLogs` at 2,000 blocks. A rate limit is recorded on `GET /v1/index` and does not fail the portfolio response.

Chrome on `https://pqtabs.vercel.app` with wallet `0xBDfC…0034` loaded config and `GET /v1/registrars/…/roots` (`count: 0`). It did not request root A's portfolio.
