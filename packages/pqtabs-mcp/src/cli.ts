#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type AgentSigner,
  DEFAULT_BACKEND_URL,
  DEFAULT_RPC_URL,
  fileAttemptStore,
  PqtabsClient,
  PqtabsError,
} from "pqtabs-sdk";
import { signerFromEnv } from "./local-signer.js";
import { createPqtabsServer, PACKAGE_VERSION } from "./server.js";

const HELP = `pqtabs-mcp ${PACKAGE_VERSION}

A local stdio MCP server for PQTABS on Arc mainnet. Start it from your MCP host. Do not run it on a public port.

Environment:
  PQTABS_BACKEND_URL       backend URL (default ${DEFAULT_BACKEND_URL})
  PQTABS_RPC_URL           Arc RPC URL (default ${DEFAULT_RPC_URL})
  PQTABS_STATE_DIR         directory for stored authorizations (default ~/.pqtabs)
  PQTABS_SIGNER_CLI        optional. Path to the pqtabs-signer CLI (packages/pqtabs-signer/dist/src/cli.js).
                           With PQTABS_SIGNER_AGENT, enables pqtabs_run_paid_research. The key stays in the
                           local signer (OS credential store). This MCP never receives it.
  PQTABS_SIGNER_AGENT      optional. The agent address the local signer holds. Must be an address, not a key.
  PQTABS_AGENT_PRIVATE_KEY legacy only. The raw agent key in this environment. Use it only when the local
                           signer is not available. Do not set it together with the local signer.

Flags:
  --version    print the version
  --help       print this help
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--version")) {
    process.stdout.write(`${PACKAGE_VERSION}\n`);
    return;
  }
  if (args.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }

  const env = process.env;
  let signer: AgentSigner | undefined;
  try {
    const chosen = signerFromEnv(env);
    signer = chosen.signer;
    if (chosen.notice) process.stderr.write(`${chosen.notice}\n`);
  } catch (error) {
    // Fail closed. Say what is wrong. Never echo a key.
    process.stderr.write(`${error instanceof PqtabsError ? error.message : "The signer could not be chosen. Nothing was started."}\n`);
    process.exit(1);
  }

  const stateDir = env.PQTABS_STATE_DIR?.trim() || join(homedir(), ".pqtabs");
  let client: PqtabsClient;
  try {
    client = new PqtabsClient({
      backendUrl: env.PQTABS_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL,
      rpcUrl: env.PQTABS_RPC_URL?.trim() || DEFAULT_RPC_URL,
      attemptStore: fileAttemptStore(join(stateDir, "attempts.json")),
    });
  } catch (error) {
    const message = error instanceof PqtabsError ? error.message : "The PQTABS client could not start.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  const server = createPqtabsServer({ client, signer });
  await server.connect(new StdioServerTransport());
  // stdout carries the MCP protocol. Status goes to stderr only.
  process.stderr.write(
    `pqtabs-mcp ${PACKAGE_VERSION} ready on stdio. Paid research: ${signer ? "enabled" : "disabled (no signer configured)"}.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`pqtabs-mcp stopped: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exit(1);
});
