# pqtabs-sdk

TypeScript client for [PQTABS](https://pqtabs.vercel.app) on Arc mainnet (chain `5042`).

PQTABS lets a post-quantum root open a bounded USDC **capability** (a Barkeep tab) for an agent. The capability has a cap, a per-payment limit, an expiry, and approved payees. The agent's ECDSA signer authorizes payments only inside that capability. The backend checks live policy, relays the transaction, and returns a research result only after the exact matching Arc USDC receipt verifies.

This SDK wraps that flow. It does not hold a root, create capabilities, change limits, or add payees. Those actions stay in the PQTABS app, under the root's control.

- Protocol name: `pqtabs-barkeep`. It is not standard x402 `exact`, and it does not use an ArcRouter `PAYMENT-RESPONSE`.
- Requires Node.js 20.19 or later. ESM only.
- Dependencies: `viem` and `zod`.

## Install

```sh
npm install pqtabs-sdk
```

## Read-only quick start

Reads never move money. This runs against the public backend and Arc RPC with no keys:

```ts
import { PqtabsClient } from "pqtabs-sdk";

const pqtabs = new PqtabsClient();

const config = await pqtabs.read.config();        // refuses unless the backend is Arc mainnet
const chainId = await pqtabs.read.rpcChainId();    // 5042, read from the RPC, never assumed
const portfolio = await pqtabs.read.portfolio("0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf");

console.log(config.chainId, chainId, portfolio.tabs.length);
```

A runnable version is in `examples/read-only.mjs` in the repository.

## Paid research (spends USDC)

Paid calls need an **agent signer** and a capability that the root has already opened. The SDK refuses before signing if the payee, amount, expiry, balance, or chain does not match.

```ts
import { PqtabsClient, privateKeySigner } from "pqtabs-sdk";

const pqtabs = new PqtabsClient();
const signer = privateKeySigner(process.env.PQTABS_AGENT_PRIVATE_KEY as `0x${string}`);

const outcome = await pqtabs.spend.research({
  tab: "0x7D627201477f192DBB3dC5E7e993aeF6701F302d", // an open capability on Arc
  signer,
  maxPriceRaw: "1000",                              // the most this run may pay: 0.001 USDC
  task: "What is the Arc USDC gas token?",
});

if (outcome.status === "complete") console.log(outcome.result, outcome.txHash);
```

`outcome.status` is one of:

| status | meaning | what to do |
| --- | --- | --- |
| `complete` | The receipt matched exactly one USDC transfer from the capability to the payee, and the answer is ready. | Use `outcome.result`. |
| `result_pending` | The receipt matched, but the answer is not ready yet. | Call `pqtabs.research.recoverResult(...)` later. It never charges again. |
| `settlement_pending` | Submitted, but the receipt is not confirmed yet. | Call `pqtabs.spend.resume({ quoteId, tab })` later. It never signs or relays again. |

Refusals throw `PolicyRefusedError`. Its `reasons` are the backend's machine reasons, for example `capability_inactive`, `expired`, `wrong_payee`, `balance`, `exposure`, `max_per_call`, or `wrong_agent`. Nothing was signed or broadcast when this error is thrown.

## Read, research, spend

| Namespace | Moves money | Methods |
| --- | --- | --- |
| `read` | No | `health`, `ready`, `config`, `rpcChainId`, `time`, `portfolio(root)`, `capability(root, tab)` |
| `research` | No | `quote(task)`, `checkPolicy({ tab, paymentRequired })`, `verifyReceipt({ txHash, tab, payee, valueRaw })`, `recoverResult({ quoteId, txHash, tab, payee?, valueRaw? })` |
| `spend` | **Yes**, only inside an open capability | `research({ tab, signer, maxPriceRaw, task })`, `resume({ quoteId, tab })` |

`research.quote` creates a quote record only. It signs nothing and moves no USDC. `research.checkPolicy` returns `ALLOW` or `REFUSE` with the reasons, and it also moves no money.

## Signers and the signing boundary

The SDK never sees a private key. It passes only the authorization fields (`from` is always the capability) and receives a 65-byte EIP-712 signature.

- `privateKeySigner(privateKey)`: the key is read once, kept in a closure, and never returned or logged. Use it only in a process where you control the secret, such as a secret manager or environment variable.
- `externalSigner({ address, signTypedData })`: delegate to a hardware wallet, KMS, or enclave. `address` must be the capability's agent.

The signer's address must equal the capability's agent on chain. Otherwise the SDK refuses before signing, and it recovers the signature address before relaying.

Do not give the SDK a root's post-quantum key or backup phrase. The root does not sign payments.

## Idempotency and retries

- Each quote maps to one stored authorization in the `AttemptStore`. Retrying the same quote never signs again.
- A relay that is retried sends the **identical** authorization. The backend returns the earlier transaction hash.
- A rate-limited relay (HTTP 429) waits for `retry-after` and sends the same authorization again.
- Use `fileAttemptStore(path)` to persist attempts across restarts. It writes atomically with mode `0600`. The default `MemoryAttemptStore` forgets attempts when the process exits.

## Receipt verification

A result is returned only when all of these hold:

- The Arc receipt status is success. A reverted receipt never produces a result.
- Exactly one USDC `Transfer` in the receipt goes from the capability to the payee, for the stated amount.
- The chain is Arc mainnet (`5042`) on both the backend and the RPC.

An RPC rate limit (HTTP 429) is reported as `rpc_rate_limited`. It is never treated as a payment failure. The SDK reads USDC `Transfer` logs from the 6-decimal ERC-20 at `0x3600000000000000000000000000000000000000`. It ignores the native 18-decimal system log, so the same movement is not counted twice.

## Configuration

```ts
new PqtabsClient({
  backendUrl: "https://pqtabs.onrender.com", // default. Plain http is allowed only for localhost.
  rpcUrl: "https://rpc.mainnet.arc.io",      // default Arc RPC
  timeoutMs: 20_000,                         // per backend request
  receiptTimeoutMs: 90_000,                  // how long to wait for an Arc receipt
  maxRelayAttempts: 4,                       // up to 10
  attemptStore: fileAttemptStore("./attempts.json"),
});
```

Environment variable names used by the MCP server and the examples:

| Variable | Purpose |
| --- | --- |
| `PQTABS_BACKEND_URL` | Backend URL override |
| `PQTABS_RPC_URL` | Arc RPC URL override |
| `PQTABS_AGENT_PRIVATE_KEY` | Agent key for paid calls. Optional. Keep it in a secret store |
| `PQTABS_STATE_DIR` | Directory for stored attempts (MCP server only) |

## Errors

Every failure is a `PqtabsError` with a stable `code`, `retryable`, and optional `status`, `requestId`, and `errorCode`. Codes include `chain_mismatch`, `backend_unavailable`, `backend_error`, `rate_limited`, `timeout`, `aborted`, `schema_mismatch`, `quote_invalid`, `exceeds_max_price`, `policy_refused`, `signer_mismatch`, `authorization_expired`, `settlement_unknown`, `receipt_mismatch`, `rpc_error`, `rpc_rate_limited`, and `attempt_not_found`. Errors never include a key or a signature.

Use `isPqtabsError(value)` to narrow an unknown value.

## Verify without spending

```sh
npm run build
node examples/read-only.mjs
```

Read-only calls prove the connection to the live backend and Arc. Running a paid call requires your own open capability and signer. Start with a `maxPriceRaw` of `1000` (0.001 USDC).

## Links

- App and developer guide: https://pqtabs.vercel.app/developers
- Source: https://github.com/mohamedwael201193/PQTABS (directory `packages/pqtabs-sdk`)
- Issues: https://github.com/mohamedwael201193/PQTABS/issues
- MCP server for AI hosts: `pqtabs-mcp`

## License

MIT. See [LICENSE](./LICENSE).

## Changelog

- **0.1.1:** Packaging only. Removed a UTF-8 byte order mark from `package.json`, `README.md`, and `LICENSE`. No API change.
- **0.1.0:** First release.