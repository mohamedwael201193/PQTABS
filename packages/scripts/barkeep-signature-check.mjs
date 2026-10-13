// Barkeep signature check against real Arc Mainnet spend transactions.
//
// Read-only. It makes JSON-RPC reads and eth_call simulations only. It sends no transaction,
// never reads or prints a private key, and prints only public addresses, hashes, and booleans.
//
// For each spend transaction it:
//   1. decodes USDC.transferWithAuthorization(from = tab, ...) and takes the 213-byte blob;
//   2. checks USDC DOMAIN_SEPARATOR() equals the domain we sign with (name USDC, version 2, chain 5042);
//   3. rebuilds the EIP-712 digest and recovers the signer from the first 65 bytes;
//   4. checks the signer equals the tab's agent() at the spend's block;
//   5. asks the live tab isValidSignature(digest, blob) at that block (must return 0x1626ba7e);
//   6. runs negative controls (tampered value, high-s, v in {0,1}) so a passing check can fail.
//
// Usage: node packages/scripts/barkeep-signature-check.mjs <spendTxHash> [more hashes...]

import { createRequire } from "node:module";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const {
  decodeFunctionData,
  hashTypedData,
  recoverAddress,
  getAddress,
  hexToBigInt,
  toHex,
  hexToBytes,
  parseAbi,
  encodeFunctionData,
  keccak256,
  encodeAbiParameters,
  decodeEventLog,
} = require("viem");

const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
const USDC = getAddress("0x3600000000000000000000000000000000000000");
const CHAIN_ID = 5042;
const MAGIC = "0x1626ba7e";
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N / 2n;

const usdcAbi = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const tabAbi = parseAbi([
  "function agent() view returns (address)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);

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

let rpcId = 0;
async function rpc(method, params) {
  rpcId += 1;
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
  });
  const body = await response.json();
  if (body.error) return { error: body.error };
  return { result: body.result };
}

async function readOrThrow(method, params) {
  const { result, error } = await rpc(method, params);
  if (error) throw new Error(`${method} failed: ${error.message ?? JSON.stringify(error)}`);
  return result;
}

// eth_call that never throws. A revert is reported as null, which the caller treats as "not valid".
async function ethCallSafe(to, data, blockNumberHex) {
  const { result, error } = await rpc("eth_call", [{ to, data }, blockNumberHex]);
  if (error) return { ok: false, reason: error.message ?? "revert" };
  return { ok: true, result };
}

function domainSeparator() {
  const typeHash = keccak256(
    new TextEncoder().encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        typeHash,
        keccak256(new TextEncoder().encode(domain.name)),
        keccak256(new TextEncoder().encode(domain.version)),
        BigInt(CHAIN_ID),
        USDC,
      ],
    ),
  );
}

function splitSignature(sig65) {
  const bytes = hexToBytes(sig65);
  const r = toHex(bytes.subarray(0, 32));
  const s = toHex(bytes.subarray(32, 64));
  const v = bytes[64];
  return { r, s, v, sBig: hexToBigInt(s) };
}

function digestFor(tab, to, value, validAfter, validBefore, nonce) {
  return hashTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message: { from: tab, to, value, validAfter, validBefore, nonce },
  });
}

function toHexSig(bytes) {
  return toHex(bytes);
}

function withV(sig65, v) {
  const bytes = hexToBytes(sig65);
  bytes[64] = v;
  return toHexSig(bytes);
}

function withHighS(sig65) {
  // Replace s with n - s and flip v parity. Same signer under ECDSA, but rejected by EIP-2 low-s rules.
  const { r, sBig, v } = splitSignature(sig65);
  const highS = SECP256K1_N - sBig;
  const flipped = v === 27 ? 28 : v === 28 ? 27 : v;
  const bytes = new Uint8Array(65);
  bytes.set(hexToBytes(r), 0);
  bytes.set(hexToBytes(toHex(highS, { size: 32 })), 32);
  bytes[64] = flipped;
  return toHexSig(bytes);
}

async function verifySpend(txHash) {
  const tx = await readOrThrow("eth_getTransactionByHash", [txHash]);
  const receipt = await readOrThrow("eth_getTransactionReceipt", [txHash]);
  if (!tx || !receipt) throw new Error(`Transaction ${txHash} not found`);
  const row = { txHash, status: receipt.status === "0x1" ? "success" : "failed", block: hexToBigInt(receipt.blockNumber).toString() };
  if (getAddress(tx.to) !== USDC) return { ...row, ok: false, reason: "to is not USDC" };

  const decoded = decodeFunctionData({ abi: usdcAbi, data: tx.input });
  if (decoded.functionName !== "transferWithAuthorization") return { ...row, ok: false, reason: "not transferWithAuthorization" };
  const [from, to, value, validAfter, validBefore, nonce, blob] = decoded.args;
  const tab = getAddress(from);
  row.tab = tab;
  row.payee = getAddress(to);
  row.value = value.toString();
  row.blobBytes = (blob.length - 2) / 2;
  if (row.blobBytes !== 213) return { ...row, ok: false, reason: "blob is not 213 bytes" };

  const blockTag = receipt.blockNumber;
  const agent = getAddress(
    (await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "agent" }), blockTag)).result.replace(/^0x(0{24})/, "0x"),
  );
  row.agent = agent;

  const onchainDomain = await readOrThrow("eth_call", [{ to: USDC, data: encodeFunctionData({ abi: usdcAbi, functionName: "DOMAIN_SEPARATOR" }) }, blockTag]);
  row.domainSeparatorMatches = onchainDomain.toLowerCase() === domainSeparator().toLowerCase();

  const sig65 = toHex(hexToBytes(blob).subarray(0, 65));
  const digest = digestFor(tab, to, value, validAfter, validBefore, nonce);
  const { r, s, v, sBig } = splitSignature(sig65);
  row.signatureV = v;
  row.lowS = sBig <= SECP256K1_HALF_N;
  const signer = getAddress(await recoverAddress({ hash: digest, signature: { r, s, v: BigInt(v) } }));
  row.recoveredSigner = signer;
  row.signerIsAgent = signer === agent;

  // The live tab's own ERC-1271 check on the exact blob the relayer sent, at the spend's block.
  const onchain = await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, blob] }), blockTag);
  row.tabAcceptsBlob = onchain.ok && onchain.result.slice(0, 10).toLowerCase() === MAGIC;

  // Transfer log: the 6-decimal ERC-20 Transfer amount must equal the signed value.
  const transferLog = receipt.logs.find((log) => log.address.toLowerCase() === USDC.toLowerCase() && log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  row.erc20TransferValue = transferLog ? hexToBigInt(transferLog.data).toString() : null;
  row.transferMatchesValue = row.erc20TransferValue === value.toString();

  // Negative controls. Each must FAIL, or the check cannot discriminate.
  const tampered = digestFor(tab, to, value + 1n, validAfter, validBefore, nonce);
  const tamperedCall = await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [tampered, blob] }), blockTag);
  row.controlTamperedValueRejected = !(tamperedCall.ok && tamperedCall.result.slice(0, 10).toLowerCase() === MAGIC);

  const highSBlob = toHex(new Uint8Array([...hexToBytes(withHighS(sig65)), ...hexToBytes(blob).subarray(65)]));
  const highSCall = await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, highSBlob] }), blockTag);
  row.informationalHighSAccepted = highSCall.ok && highSCall.result.slice(0, 10).toLowerCase() === MAGIC;

  const vZeroBase = v >= 27 ? v - 27 : v;
  const v01Blob = toHex(new Uint8Array([...hexToBytes(withV(sig65, vZeroBase)), ...hexToBytes(blob).subarray(65)]));
  const v01Call = await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, v01Blob] }), blockTag);
  row.informationalV01Accepted = v01Call.ok && v01Call.result.slice(0, 10).toLowerCase() === MAGIC;

  row.ok =
    row.status === "success" &&
    row.domainSeparatorMatches &&
    row.signerIsAgent &&
    row.tabAcceptsBlob &&
    row.transferMatchesValue &&
    row.lowS &&
    (v === 27 || v === 28) &&
    row.controlTamperedValueRejected;
  return row;
}

// Harness control. The tab's agent is an immutable clone argument, so its 20 bytes appear once in
// eth_getCode. An eth_call state override can replace those bytes with a DIFFERENT agent address for
// the duration of one simulated call. Nothing is broadcast and no state persists.
// A random in-memory key signs a synthetic authorization with the historical spend's exact terms.
// Expected: the live tab accepts it (positive control) and rejects a signature from another key.
async function harnessControl(txHash) {
  const tx = await readOrThrow("eth_getTransactionByHash", [txHash]);
  const receipt = await readOrThrow("eth_getTransactionReceipt", [txHash]);
  const decoded = decodeFunctionData({ abi: usdcAbi, data: tx.input });
  const [from, to, value, validAfter, validBefore, nonce] = decoded.args;
  const tab = getAddress(from);
  const blockTag = receipt.blockNumber;
  const originalAgent = getAddress(
    (await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "agent" }), blockTag)).result.replace(/^0x(0{24})/, "0x"),
  );
  const code = (await readOrThrow("eth_getCode", [tab, blockTag])).toLowerCase();
  const needle = originalAgent.slice(2).toLowerCase();
  const occurrences = code.split(needle).length - 1;
  const position = code.indexOf(needle);
  if (occurrences !== 1 || position % 2 !== 0) {
    return { txHash, ok: false, reason: `agent bytes found ${occurrences} times; override not safe` };
  }

  const digest = digestFor(tab, to, value, validAfter, validBefore, nonce);
  const overrideWith = (agentAddress) => {
    const patched = code.slice(0, position) + agentAddress.slice(2).toLowerCase() + code.slice(position + 40);
    return { [tab]: { code: `0x${patched.slice(2)}` } };
  };
  const simulate = async (signature, agentAddress) => {
    const blob = toHex(new Uint8Array([...hexToBytes(signature), ...hexToBytes(encodeTail(to, value, validAfter, validBefore, nonce))]));
    const body = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: tab, data: encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, blob] }) }, blockTag, overrideWith(agentAddress)] };
    const response = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json();
    return !json.error && typeof json.result === "string" && json.result.slice(0, 10).toLowerCase() === MAGIC;
  };

  const signerKey = generatePrivateKey();
  const signer = privateKeyToAccount(signerKey);
  const synthetic = await signer.signTypedData({ domain, types, primaryType: "TransferWithAuthorization", message: { from: tab, to, value, validAfter, validBefore, nonce } });
  const strangerKey = generatePrivateKey();
  const stranger = await privateKeyToAccount(strangerKey).signTypedData({ domain, types, primaryType: "TransferWithAuthorization", message: { from: tab, to, value, validAfter, validBefore, nonce } });

  const positive = await simulate(synthetic, signer.address);
  const wrongSignerRejected = !(await simulate(stranger, signer.address));
  const originalStillAccepted = await simulate(
    await readOriginalSignature(txHash),
    originalAgent,
  );
  const wrongAgentRejected = !(await simulate(await readOriginalSignature(txHash), signer.address));
  return {
    txHash,
    tab,
    originalAgent,
    harnessAgentOverrideAccepted: positive,
    controlSignatureFromOtherKeyRejected: wrongSignerRejected,
    controlOriginalSignatureWithOriginalAgentAccepted: originalStillAccepted,
    controlOriginalSignatureWithOverriddenAgentRejected: wrongAgentRejected,
    ok: positive && wrongSignerRejected && originalStillAccepted && wrongAgentRejected,
  };
}

// Probe for contract-account agents (an SCA such as a Circle agent wallet). The tab's agent is set to a
// contract address X whose code ALWAYS returns the ERC-1271 magic value. If the tab accepted contract
// agents through ERC-1271, this would pass. A rejection shows the tab only accepts ECDSA recovery.
async function contractAgentProbe(txHash) {
  const tx = await readOrThrow("eth_getTransactionByHash", [txHash]);
  const receipt = await readOrThrow("eth_getTransactionReceipt", [txHash]);
  const decoded = decodeFunctionData({ abi: usdcAbi, data: tx.input });
  const [from, to, value, validAfter, validBefore, nonce, blob] = decoded.args;
  const tab = getAddress(from);
  const blockTag = receipt.blockNumber;
  const originalAgent = getAddress(
    (await ethCallSafe(tab, encodeFunctionData({ abi: tabAbi, functionName: "agent" }), blockTag)).result.replace(/^0x(0{24})/, "0x"),
  );
  const code = (await readOrThrow("eth_getCode", [tab, blockTag])).toLowerCase();
  const needle = originalAgent.slice(2).toLowerCase();
  const position = code.indexOf(needle);
  if (code.split(needle).length - 1 !== 1 || position % 2 !== 0) {
    return { txHash, ok: false, reason: "agent bytes not unique in tab code" };
  }
  // PUSH32 <0x1626ba7e padded to 32 bytes>, MSTORE at 0, RETURN 32 bytes. Returns the magic value for any input.
  const alwaysMagic = `0x7f1626ba7e${"00".repeat(28)}600052602060 00f3`.replace(/ /g, "");
  const contractAgent = getAddress("0x00000000000000000000000000000000000000c1");
  const patched = code.slice(0, position) + contractAgent.slice(2).toLowerCase() + code.slice(position + 40);
  const override = {
    [tab]: { code: `0x${patched.slice(2)}` },
    [contractAgent]: { code: alwaysMagic },
  };
  const digest = digestFor(tab, to, value, validAfter, validBefore, nonce);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: tab, data: encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, blob] }) }, blockTag, override],
  };
  const response = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  const acceptedAsContractAgent = !json.error && typeof json.result === "string" && json.result.slice(0, 10).toLowerCase() === MAGIC;
  // Control: the stub itself must return the magic value when called directly, so a rejection means the tab declined.
  const stubBody = {
    jsonrpc: "2.0",
    id: 2,
    method: "eth_call",
    params: [{ to: contractAgent, data: encodeFunctionData({ abi: tabAbi, functionName: "isValidSignature", args: [digest, blob] }) }, blockTag, { [contractAgent]: { code: alwaysMagic } }],
  };
  const stubResponse = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(stubBody) });
  const stubJson = await stubResponse.json();
  const stubReturnsMagic = !stubJson.error && typeof stubJson.result === "string" && stubJson.result.slice(0, 10).toLowerCase() === MAGIC;
  return {
    txHash,
    tab,
    originalAgent,
    probeContractAgentAccepted: acceptedAsContractAgent,
    controlStubReturnsMagic: stubReturnsMagic,
    // ok requires a working stub (control) and a tab that declines contract agents (current ECDSA-only design).
    ok: stubReturnsMagic && acceptedAsContractAgent === false,
  };
}

function encodeTail(to, value, validAfter, validBefore, nonce) {
  return toHex(
    new Uint8Array([
      ...hexToBytes(to),
      ...hexToBytes(encodeAbiParameters([{ type: "uint256" }], [value])),
      ...hexToBytes(encodeAbiParameters([{ type: "uint256" }], [validAfter])),
      ...hexToBytes(encodeAbiParameters([{ type: "uint256" }], [validBefore])),
      ...hexToBytes(nonce),
    ]),
  );
}

async function readOriginalSignature(txHash) {
  const tx = await readOrThrow("eth_getTransactionByHash", [txHash]);
  const decoded = decodeFunctionData({ abi: usdcAbi, data: tx.input });
  return toHex(hexToBytes(decoded.args[6]).subarray(0, 65));
}

const args = process.argv.slice(2);
const harnessMode = args.includes("--harness");
const probeMode = args.includes("--probe-contract-agent");
const mode = probeMode ? "probe-contract-agent" : harnessMode ? "harness" : "verify";
const hashes = args.filter((arg) => /^0x[0-9a-fA-F]{64}$/.test(arg));
if (hashes.length === 0) {
  console.error("Usage: node packages/scripts/barkeep-signature-check.mjs [--harness | --probe-contract-agent] <spendTxHash> [more hashes...]");
  process.exit(2);
}

const runners = { verify: verifySpend, harness: harnessControl, "probe-contract-agent": contractAgentProbe };
const results = [];
for (const hash of hashes) {
  try {
    results.push(await runners[mode](hash));
  } catch (error) {
    results.push({ txHash: hash, ok: false, reason: error instanceof Error ? error.message : String(error) });
  }
}

const allOk = results.every((row) => row.ok === true);
console.log(JSON.stringify({ rpc: RPC, mode, checked: results.length, allOk, results }, null, 2));
process.exit(allOk ? 0 : 1);
