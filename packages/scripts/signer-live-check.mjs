// Live check of the local signer against a real Arc tab. Read-only.
//
// 1. Asks the pqtabs-signer CLI (`sign`) for one Arc USDC TransferWithAuthorization. The key stays inside the CLI.
// 2. Recovers the signer from the returned signature with the USDC EIP-712 domain. It must equal the agent.
// 3. Calls the LIVE tab's isValidSignature(digest, blob) through eth_call at "latest". No transaction is sent.
// 4. Negative control: the same blob with a tampered value must NOT be accepted.
//
// Prints only public values and booleans. Never prints a key or the raw signing payload.
//
// Usage: node packages/scripts/signer-live-check.mjs --agent 0x... --tab 0x... --payee 0x... --value 360

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const { encodeFunctionData, getAddress, hexToBigInt, hexToBytes, hashTypedData, parseAbi, recoverTypedDataAddress, toHex, pad } = require("viem");

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "pqtabs-signer", "dist", "src", "cli.js");
const RPC = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
const USDC = getAddress("0x3600000000000000000000000000000000000000");
const CHAIN_ID = 5042;
const MAGIC = "0x1626ba7e";

const domain = { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC };
const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
const tabAbi = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function word(value) {
  return hexToBytes(pad(toHex(value), { size: 32 }));
}

async function ethCall(to, data) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await response.json();
  if (json.error) return { ok: false, reason: json.error.message ?? "revert" };
  return { ok: true, result: json.result };
}

async function main() {
  const agent = getAddress(arg("--agent") ?? "");
  const tab = getAddress(arg("--tab") ?? "");
  const payee = getAddress(arg("--payee") ?? "");
  const value = BigInt(arg("--value") ?? "0");
  if (value <= 0n) throw new Error("--value must be a positive raw USDC amount");

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    chainId: CHAIN_ID,
    asset: USDC,
    from: tab,
    to: payee,
    value: value.toString(),
    validAfter: "0",
    validBefore: String(now + 600),
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };

  const signed = spawnSync(process.execPath, [cli, "sign", "--agent", agent], {
    input: JSON.stringify(authorization),
    encoding: "utf8",
    windowsHide: true,
  });
  if (signed.status !== 0) {
    const reason = (signed.stderr || "").trim().split("\n").pop() ?? "sign failed";
    console.log(JSON.stringify({ ok: false, step: "sign", reason: safeReason(reason) }));
    process.exitCode = 1;
    return;
  }
  const { signature } = JSON.parse(signed.stdout.trim());

  const typed = {
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message: {
      from: tab,
      to: payee,
      value,
      validAfter: 0n,
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  };
  const digest = hashTypedData(typed);
  const recovered = getAddress(await recoverTypedDataAddress({ ...typed, signature }));

  const blobFor = (sig, amount) =>
    toHex(
      new Uint8Array([
        ...hexToBytes(sig),
        ...hexToBytes(payee),
        ...word(amount),
        ...word(0n),
        ...word(BigInt(authorization.validBefore)),
        ...hexToBytes(authorization.nonce),
      ]),
    );

  const blob = blobFor(signature, value);
  const live = await ethCall(tab, encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, blob] }));
  const tamperedBlob = blobFor(signature, value + 1n);
  const tampered = await ethCall(tab, encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, tamperedBlob] }));

  const tabAccepts = live.ok && live.result.slice(0, 10).toLowerCase() === MAGIC;
  const tamperRejected = !(tampered.ok && tampered.result.slice(0, 10).toLowerCase() === MAGIC);
  const v = Number.parseInt(signature.slice(-2), 16);

  console.log(
    JSON.stringify({
      ok: recovered === agent && tabAccepts && tamperRejected && (v === 27 || v === 28),
      agent,
      tab,
      recoveredSigner: recovered,
      signerIsAgent: recovered === agent,
      signatureV: v,
      tabAcceptsSignedBlob: tabAccepts,
      controlTamperedValueRejected: tamperRejected,
      transactionSent: false,
      note: live.ok ? undefined : safeReason(live.reason),
    }),
  );
  process.exitCode = recovered === agent && tabAccepts && tamperRejected ? 0 : 1;
  void hexToBigInt;
}

function safeReason(text) {
  return String(text).replace(/0x[0-9a-fA-F]{64,}/g, "[redacted-hex]").slice(0, 200);
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, step: "unexpected", reason: safeReason(error?.message ?? error) }));
  process.exitCode = 1;
});
