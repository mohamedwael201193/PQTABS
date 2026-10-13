# pqtabs-mcp

A local **stdio** [Model Context Protocol](https://modelcontextprotocol.io) server for [PQTABS](https://pqtabs.vercel.app) on Arc mainnet (chain `5042`). It lets an AI host check a PQTABS capability, price an Arc Research question, verify a receipt, and, only when you enable it, pay for research inside a capability the root already authorized.

It is a thin layer over [`pqtabs-sdk`](https://www.npmjs.com/package/pqtabs-sdk). Every tool reads the live backend or Arc. Nothing is mocked, and no tool returns a success that the chain or backend did not confirm.

- Local stdio only. It does not open a network port and is not a hosted remote server.
- The root stays with you. No tool creates a root, opens or closes a capability, changes a limit or exposure ceiling, adds a payee, rotates root authority, or funds a wallet.
- Requires Node.js 20.19 or later.

## Install

Run the published package through `npx` from your host configuration. Or install it globally:

```sh
npm install -g pqtabs-mcp
pqtabs-mcp --version
```

## Configure a host

Each host starts the server with a command and reads its config from its own file. Restart the host after editing. Some hosts also ask you to approve a new server.

**Claude Desktop** (`claude_desktop_config.json`; on Windows `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pqtabs": {
      "command": "npx",
      "args": ["-y", "pqtabs-mcp"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "pqtabs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "pqtabs-mcp"]
    }
  }
}
```

**Claude Code** (run in a terminal):

```sh
claude mcp add --transport stdio pqtabs -- npx -y pqtabs-mcp
```

Claude Code also reads a project `.mcp.json` with the same `mcpServers` shape as the Cursor example. Add `--scope user` to make it available in every project.

For a host that is not listed, use its stdio server setting with `command` set to `npx` and `args` set to `["-y", "pqtabs-mcp"]`.

On Windows, if the host cannot start `npx`, use the full path to `npx.cmd`, or install globally and set `command` to `pqtabs-mcp`.

### Enable paid research (optional)

Read tools work without a signer. Paid research is offered only when the server has a signer for an agent that an already-authorized capability names. Use the **local signer**. The MCP server then never holds the agent key. It starts `pqtabs-signer sign` as a child process and receives one signature per approved payment:

```json
{
  "mcpServers": {
    "pqtabs": {
      "command": "npx",
      "args": ["-y", "pqtabs-mcp@0.1.2"],
      "env": {
        "PQTABS_SIGNER_CLI": "<path to packages/pqtabs-signer/dist/src/cli.js>",
        "PQTABS_SIGNER_AGENT": "<the public agent address from pqtabs-signer status>"
      }
    }
  }
}
```

`PQTABS_SIGNER_CLI` needs the `pqtabs-signer` CLI from the PQTABS repository. It is not published to npm yet. Build it with `npm run build` in `packages/pqtabs-signer`. Setting both variables without the CLI, or the CLI without the address, stops the server with a message. Nothing is started.

The legacy `PQTABS_AGENT_PRIVATE_KEY` variable still works, but the key then sits in the server process. Do not set it together with the local signer. Never paste the root's post-quantum key or backup phrase into any configuration.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PQTABS_BACKEND_URL` | `https://pqtabs.onrender.com` | Backend. Plain `http` is allowed only for localhost. |
| `PQTABS_RPC_URL` | `https://rpc.mainnet.arc.io` | Arc RPC for chain checks and receipts |
| `PQTABS_STATE_DIR` | `~/.pqtabs` | Stores spend attempts so a retry never signs twice |
| `PQTABS_SIGNER_CLI` | unset | Optional. Path to the `pqtabs-signer` CLI. With `PQTABS_SIGNER_AGENT`, enables `pqtabs_run_paid_research`. The key stays in the local signer |
| `PQTABS_SIGNER_AGENT` | unset | Optional. The public agent address the local signer holds. Must be an address, not a key |
| `PQTABS_AGENT_PRIVATE_KEY` | unset | Legacy. The raw agent key in this process. An invalid key stops the server and is not echoed. Do not combine with the local signer |

Flags: `--version` prints the version. `--help` prints usage. Status messages go to stderr. The MCP protocol uses stdout.

## Tools

Read-only tools never sign or broadcast anything. Tools marked **state-changing** can move USDC.

| Tool | Type | Input | Output |
| --- | --- | --- | --- |
| `pqtabs_status` | read-only | none | backend health, backend chain, RPC chain, `onArc`, USDC and Barkeep addresses, whether paid research is enabled |
| `pqtabs_get_portfolio` | read-only | `root` | the root's capabilities with counts |
| `pqtabs_list_capabilities` | read-only | `root`, `openOnly?` | each capability's cap, per-payment limit, live USDC balance, expiry, and payees (raw 6-decimal units) |
| `pqtabs_create_research_quote` | writes a quote record | `task` | `quoteId`, price, payee, model, expiry. Signs nothing and moves no USDC |
| `pqtabs_check_spend_policy` | creates a quote record, no payment | `tab`, `task` | `ALLOW` or `REFUSE` with the backend's reasons, price, payee, and remaining balance. Nothing is signed or moved |
| `pqtabs_get_receipt` | read-only | `txHash`, `tab`, `payee`, `amountRaw` | `settled`, `reverted`, `not_found`, or `mismatch`, read from Arc |
| `pqtabs_recover_result` | idempotent, no payment | `quoteId`, `txHash`, `tab`, `payee?`, `amountRaw?` | `complete`, `result_pending`, or `settlement_pending`. Never relays, signs, or charges |
| `pqtabs_run_paid_research` | **state-changing: spends USDC** | `tab`, `task`, `maxPriceRaw`, `confirmSpend: true` | `complete`, `result_pending`, or `settlement_pending`, with the capability, payee, amount, chain, and transaction |

`pqtabs_run_paid_research` is listed only when `PQTABS_AGENT_PRIVATE_KEY` is set. It requires `confirmSpend: true` and a `maxPriceRaw` ceiling. Before it signs, it checks the quote against the capability's cap, per-payment limit, expiry, approved payee, balance, and the chain. If any check fails, it refuses. A refusal returns an error with `nothingSigned: true` and never includes the key.

Errors are returned as structured content with `error`, `message`, and `retryable`. A backend outage is retryable. It is never reported as a success.

## Verify the connection

Ask your host to call `pqtabs_status`. A healthy connection shows `backendOk: true`, `sdkRpcChainId: 5042`, and `onArc: true`. Then call `pqtabs_get_portfolio` with a root address you control.

## Safety model

- Keys: the agent key is read once from the environment and kept inside the signer. It is never sent to the backend, returned, logged, or written to a file. The stored spend attempts contain signed authorizations only, not keys.
- Limits: a payment can only use a capability that the root already opened. MCP cannot raise a cap or add a payee.
- Idempotency: a quote is signed at most once. A retry or `recover` call never signs or charges again.
- Receipts: a result is returned only when the Arc receipt succeeded and contains exactly one matching USDC transfer.
- Chain: backend and RPC must both report Arc mainnet (`5042`).
- Stdout is reserved for the protocol. Status and errors go to stderr.

## Development

```sh
npm run build
npm test                # mocked in-memory tests
npm run test:protocol   # starts the built server over stdio; read-only calls to the live backend and Arc
```

## Links

- App and developer guide: https://pqtabs.vercel.app/developers
- SDK: https://www.npmjs.com/package/pqtabs-sdk
- Source: https://github.com/mohamedwael201193/PQTABS (directory `packages/pqtabs-mcp`)
- Issues: https://github.com/mohamedwael201193/PQTABS/issues

## License

MIT. See [LICENSE](./LICENSE).

## Changelog

- **0.1.2:** Local signer support. `PQTABS_SIGNER_CLI` and `PQTABS_SIGNER_AGENT` enable `pqtabs_run_paid_research` through the `pqtabs-signer` child process, so the MCP never holds the key. The legacy `PQTABS_AGENT_PRIVATE_KEY` path is unchanged, with a notice, and cannot be combined with the local signer. Read tools and the other quote tools behave as before.
- **0.1.1:** `pqtabs_check_spend_policy` is marked `readOnlyHint: false` and its description says it creates a quote record on the backend. Nothing is signed, broadcast, or moved. The 0.1.0 README and annotation called it read-only; this release corrects both. No behavior change.
- **0.1.0:** first release.