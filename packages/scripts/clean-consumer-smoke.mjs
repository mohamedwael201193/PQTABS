/**
 * Clean-consumer smoke test for the PQTABS packages.
 *
 *   node scripts/clean-consumer-smoke.mjs            packs the local packages and installs the tarballs
 *   node scripts/clean-consumer-smoke.mjs --registry installs pqtabs-sdk and pqtabs-mcp from npm
 *
 * It creates a fresh temporary project outside this repository, imports the published entry points,
 * starts the packaged MCP server over stdio exactly as a host would, calls READ-ONLY tools against the
 * live backend and Arc, and checks the advertised output schemas. It never uses an agent key, never
 * creates a quote, and never sends a transaction. It also checks that the tarballs contain only the
 * intended distribution files.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packagesRoot = resolve(here, "..");
const sdkDir = join(packagesRoot, "pqtabs-sdk");
const mcpDir = join(packagesRoot, "pqtabs-mcp");
const useRegistry = process.argv.includes("--registry");
// Versions come from each package's manifest, so a release bump cannot leave the smoke test checking an old version.
const readVersion = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8").replace(/^\uFEFF/, "")).version;
const sdkVersion = readVersion(sdkDir);
const mcpVersion = readVersion(mcpDir);

const ROOT_A = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf";
const SETTLED_TX = "0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15";
const SETTLED_TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
const SETTLED_PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const SETTLED_RAW = "360";

const FORBIDDEN = [
  /(^|\/)test\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.env/,
  /\.(pem|key|keystore)$/i,
  /backup/i,
  /attempts\.json$/,
  /(^|\/)pq-keys\//,
  /\.tsbuildinfo$/,
  /^(src|scripts)\//,
  /^[^/]+\.ts$/,
];

const failures = [];
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures.push(message);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: true, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function packageFiles(dir) {
  const out = run("npm", ["pack", "--dry-run", "--json"], { cwd: dir });
  const [info] = JSON.parse(out);
  return info.files.map((file) => file.path);
}

function checkTarballContents(label, files) {
  console.log(`\n[${label}] tarball contents (${files.length} files)`);
  check(files.includes("package.json"), `${label}: includes package.json`);
  check(files.includes("README.md"), `${label}: includes README.md`);
  check(files.some((f) => f.startsWith("dist/src/") && f.endsWith(".js")), `${label}: includes compiled dist/src`);
  const bad = files.filter((f) => FORBIDDEN.some((rule) => rule.test(f)));
  check(bad.length === 0, `${label}: no tests, source, env, keys, backups, or build caches${bad.length ? ` (found: ${bad.join(", ")})` : ""}`);
}

const workdir = mkdtempSync(join(tmpdir(), "pqtabs-consumer-"));
let exitCode = 0;
try {
  const tarballs = { sdk: undefined, mcp: undefined };

  if (!useRegistry) {
    console.log("Packing local packages");
    checkTarballContents("pqtabs-sdk", packageFiles(sdkDir));
    checkTarballContents("pqtabs-mcp", packageFiles(mcpDir));
    run("npm", ["pack", "--pack-destination", workdir], { cwd: sdkDir });
    run("npm", ["pack", "--pack-destination", workdir], { cwd: mcpDir });
    tarballs.sdk = join(workdir, `pqtabs-sdk-${sdkVersion}.tgz`);
    tarballs.mcp = join(workdir, `pqtabs-mcp-${mcpVersion}.tgz`);
  }

  const project = join(workdir, "consumer");
  mkdirSync(project);
  const manifest = {
    name: "pqtabs-consumer-smoke",
    private: true,
    type: "module",
    dependencies: useRegistry
      ? { "pqtabs-mcp": "latest", "pqtabs-sdk": "latest" }
      : { "pqtabs-mcp": `file:${tarballs.mcp.replaceAll("\\", "/")}`, "pqtabs-sdk": `file:${tarballs.sdk.replaceAll("\\", "/")}` },
  };
  writeFileSync(join(project, "package.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nInstalling into a fresh project (${useRegistry ? "npm registry" : "local tarballs"})`);
  // --prefer-online revalidates cached registry metadata, so a stale earlier lookup cannot hide a new release.
  run("npm", ["install", "--no-audit", "--no-fund", "--prefer-online", "--loglevel=error"], { cwd: project });

  const installed = JSON.parse(readFileSync(join(project, "node_modules", "pqtabs-mcp", "package.json"), "utf8").replace(/^\uFEFF/, ""));
  const installedSdk = JSON.parse(readFileSync(join(project, "node_modules", "pqtabs-sdk", "package.json"), "utf8").replace(/^\uFEFF/, ""));
  // Local mode must install exactly the packed versions. Registry mode installs whatever npm has as latest.
  const expectMcp = useRegistry ? installed.version : mcpVersion;
  const expectSdk = useRegistry ? installedSdk.version : sdkVersion;
  check(installed.version === expectMcp && installedSdk.version === expectSdk, `installed versions are mcp ${installed.version} / sdk ${installedSdk.version}`);

  const probe = join(project, "probe.mjs");
  writeFileSync(
    probe,
    `
import assert from "node:assert/strict";
import { PqtabsClient, PqtabsError, ARC_CHAIN_ID, privateKeySigner, externalSigner, MemoryAttemptStore, DEFAULT_BACKEND_URL } from "pqtabs-sdk";
import { createPqtabsServer, PACKAGE_VERSION } from "pqtabs-mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// The published entry point is the package's bin. Resolve it the way npm links it, not by a deep dist path.
const mcpPackageJson = require.resolve("pqtabs-mcp/package.json");
const mcpPackage = JSON.parse(readFileSync(mcpPackageJson, "utf8").replace(/^\uFEFF/, ""));
const cliPath = join(dirname(mcpPackageJson), mcpPackage.bin["pqtabs-mcp"]);
assert.ok(existsSync(cliPath), "the pqtabs-mcp bin is present in the installed package");
const out = (label, value) => console.log("  " + label + ": " + value);

// 1. Public SDK entry points import and behave.
assert.equal(ARC_CHAIN_ID, 5042);
assert.equal(typeof PqtabsClient, "function");
assert.equal(typeof privateKeySigner, "function");
assert.equal(typeof externalSigner, "function");
assert.equal(typeof MemoryAttemptStore, "function");
assert.equal(DEFAULT_BACKEND_URL, "https://pqtabs.onrender.com");
assert.throws(() => new PqtabsClient({ backendUrl: "http://example.com" }), PqtabsError);
console.log("  ok   sdk entry points import; plain http is refused for a remote backend");

// 2. The MCP package exports a server factory and a version that matches.
assert.equal(PACKAGE_VERSION, "${installed.version}");
assert.equal(typeof createPqtabsServer, "function");
console.log("  ok   mcp entry points import (version " + PACKAGE_VERSION + ")");

// 3. Start the packaged stdio server exactly as a host would, with no agent key.
const env = { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", PQTABS_STATE_DIR: process.env.PQTABS_SMOKE_STATE };
const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath], env, stderr: "pipe" });
const client = new Client({ name: "consumer-smoke", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
assert.ok(names.includes("pqtabs_status") && names.includes("pqtabs_get_receipt"), "read tools advertised");
assert.ok(!names.includes("pqtabs_run_paid_research"), "paid tool is NOT advertised without an agent key");
for (const tool of tools) assert.ok(tool.outputSchema, tool.name + " declares an output schema");
console.log("  ok   stdio server advertises " + tools.length + " tools without the paid tool: " + names.join(", "));

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, name + " returned an error: " + JSON.stringify(result.content));
  assert.ok(result.structuredContent, name + " returned no structured content");
  return result.structuredContent;
}

const status = await call("pqtabs_status", {});
assert.equal(status.onArc, true, "status reports Arc");
assert.equal(status.sdkRpcChainId, 5042);
assert.equal(status.paidResearchEnabled, false);
out("status", "backendOk=" + status.backendOk + " onArc=" + status.onArc + " rpcChainId=" + status.sdkRpcChainId);

const portfolio = await call("pqtabs_get_portfolio", { root: "${ROOT_A}" });
assert.equal(portfolio.root.toLowerCase(), "${ROOT_A}".toLowerCase());
assert.ok(Array.isArray(portfolio.tabs));
out("portfolio", "tabs=" + portfolio.tabCount + " open=" + portfolio.openCount);

const receipt = await call("pqtabs_get_receipt", { txHash: "${SETTLED_TX}", tab: "${SETTLED_TAB}", payee: "${SETTLED_PAYEE}", amountRaw: "${SETTLED_RAW}" });
assert.equal(receipt.status, "settled", "the known settled receipt verifies");
out("receipt", receipt.status + " at block " + receipt.blockNumber);

const bad = await client.callTool({ name: "pqtabs_get_portfolio", arguments: { root: "not-an-address" } });
assert.equal(bad.isError, true, "invalid input is rejected");
console.log("  ok   invalid input is rejected by the schema");

await client.close();

// 4. Optional: the local-signer path. Runs only when the operator passes a signer CLI and a PUBLIC agent address.
// It never calls the paid tool and never signs. It checks that the paid tool is advertised and that status shows the address.
if (process.env.PQTABS_SMOKE_SIGNER_CLI && process.env.PQTABS_SMOKE_SIGNER_AGENT) {
  const signerEnv = { ...env, PQTABS_SIGNER_CLI: process.env.PQTABS_SMOKE_SIGNER_CLI, PQTABS_SIGNER_AGENT: process.env.PQTABS_SMOKE_SIGNER_AGENT };
  const signedTransport = new StdioClientTransport({ command: process.execPath, args: [cliPath], env: signerEnv, stderr: "pipe" });
  const signedClient = new Client({ name: "consumer-smoke-signer", version: "0.0.0" });
  await signedClient.connect(signedTransport);
  const signedTools = (await signedClient.listTools()).tools.map((t) => t.name);
  assert.ok(signedTools.includes("pqtabs_run_paid_research"), "paid tool is advertised with the local signer");
  const signedStatus = await signedClient.callTool({ name: "pqtabs_status", arguments: {} });
  assert.ok(!signedStatus.isError, "status works with the local signer");
  assert.equal(signedStatus.structuredContent.paidResearchEnabled, true, "status reports paid research enabled");
  assert.equal(signedStatus.structuredContent.agentAddress.toLowerCase(), process.env.PQTABS_SMOKE_SIGNER_AGENT.toLowerCase(), "status shows the public agent address");
  console.log("  ok   local signer path: paid tool advertised; status shows the public agent address; nothing was signed or spent");
  await signedClient.close();
}

console.log("SMOKE_OK");
`,
  );

  console.log("\nRunning read-only consumer checks");
  const probeOutput = spawnSync(process.execPath, [probe], {
    cwd: project,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      SYSTEMROOT: process.env.SYSTEMROOT ?? "",
      PQTABS_SMOKE_STATE: join(workdir, "state"),
      PQTABS_SMOKE_SIGNER_CLI: process.env.PQTABS_SMOKE_SIGNER_CLI ?? "",
      PQTABS_SMOKE_SIGNER_AGENT: process.env.PQTABS_SMOKE_SIGNER_AGENT ?? "",
    },
  });
  process.stdout.write(probeOutput.stdout);
  if (probeOutput.stderr.trim()) process.stdout.write(`stderr: ${probeOutput.stderr.slice(-1500)}\n`);
  check(probeOutput.status === 0 && probeOutput.stdout.includes("SMOKE_OK"), "clean consumer smoke test passed");
  if (probeOutput.status !== 0) exitCode = 1;
} catch (error) {
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures.length > 0) exitCode = 1;
console.log(exitCode === 0 ? "\nAll consumer checks passed." : "\nSome consumer checks FAILED.");
process.exit(exitCode);
