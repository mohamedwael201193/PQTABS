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
  privateKeySigner,
} from "pqtabs-sdk";
import { createPqtabsServer, PACKAGE_VERSION } from "./server.js";

const HELP = `pqtabs-mcp ${PACKAGE_VERSION}

A local stdio MCP server for PQTABS on Arc mainnet. Start it from your MCP host. Do not run it on a public port.

Environment:
  PQTABS_BACKEND_URL       backend URL (default ${DEFAULT_BACKEND_URL})
  PQTABS_RPC_URL           Arc RPC URL (default ${DEFAULT_RPC_URL})
  PQTABS_STATE_DIR         directory for stored authorizations (default ~/.pqtabs)
  PQTABS_AGENT_PRIVATE_KEY optional. Enables pqtabs_run_paid_research. The agent key for an
                           already-authorized capability. Prefer a secret manager over a plain config file.

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
  const keyText = env.PQTABS_AGENT_PRIVATE_KEY?.trim();
  if (keyText) {
    try {
      signer = privateKeySigner(keyText as `0x${string}`);
    } catch {
      // Never echo the value. Say what is wrong and stop.
      process.stderr.write("PQTABS_AGENT_PRIVATE_KEY is not a 32-byte hex key. Fix it or unset it. Nothing was started.\n");
      process.exit(1);
    }
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
    `pqtabs-mcp ${PACKAGE_VERSION} ready on stdio. Paid research: ${signer ? "enabled" : "disabled (no agent key set)"}.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`pqtabs-mcp stopped: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exit(1);
});
