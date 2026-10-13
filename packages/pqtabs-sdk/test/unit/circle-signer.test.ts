/**
 * Circle developer-controlled signer. Known-vector tests need no Circle credentials. The "Circle" here is a fake
 * that returns a signature from a public test key, so the expected output is exact.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, type Hex, hashTypedData, keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type CircleSignTypedDataRequest,
  circleDeveloperSigner,
  fromCircleTypedDataJson,
  normalizeSignature,
  SECP256K1_ORDER,
  toCircleTypedDataJson,
} from "../../src/circle-signer.js";
import { isPqtabsError } from "../../src/errors.js";
import { type TransferAuthorization, transferAuthorizationTypedData } from "../../src/signer.js";

const USDC = "0x3600000000000000000000000000000000000000";
const TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
// A public, well-known test key. Never use it for funds.
const TEST_KEY = `0x${"11".repeat(32)}` as const;
const account = privateKeyToAccount(TEST_KEY);
const NONCE = `0x${"ab".repeat(32)}` as const;

function authorization(overrides: Partial<TransferAuthorization> = {}): TransferAuthorization {
  return {
    chainId: 5042,
    asset: USDC,
    from: TAB,
    to: PAYEE,
    value: 360n,
    validAfter: 0n,
    validBefore: 1_900_000_000n,
    nonce: NONCE,
    ...overrides,
  };
}

/** viem's own signature is the expected vector: low-s, v in {27, 28}, from the same key. */
async function expectedSignature(auth: TransferAuthorization): Promise<Hex> {
  return account.signTypedData(transferAuthorizationTypedData(auth));
}

/** Makes the variants a Circle response might use: v in {0, 1}, or a high s with v flipped. */
function variantV0(signature: Hex): string {
  return `${signature.slice(0, 130)}${(Number.parseInt(signature.slice(130, 132), 16) - 27).toString(16).padStart(2, "0")}`;
}
function variantHighS(signature: Hex): string {
  const r = signature.slice(2, 66);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = Number.parseInt(signature.slice(130, 132), 16);
  const highS = SECP256K1_ORDER - s;
  return `0x${r}${highS.toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}`;
}

test("the Arc USDC domain separator matches the on-chain value", () => {
  // EIP-712: keccak256(abi.encode(typehash, keccak(name), keccak(version), chainId, verifyingContract))
  const typehash = keccak256(stringToBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const separator = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [typehash, keccak256(stringToBytes("USDC")), keccak256(stringToBytes("2")), 5042n, USDC],
    ),
  );
  // Read from the live USDC contract during the Barkeep verification (packages/scripts/barkeep-signature-check.mjs).
  assert.equal(separator, "0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84");
});

test("the Circle JSON round trip keeps the exact EIP-712 digest", () => {
  const typed = transferAuthorizationTypedData(authorization());
  const back = fromCircleTypedDataJson(toCircleTypedDataJson(typed));
  assert.equal(hashTypedData(back), hashTypedData(typed));
});

test("a Circle signature with v=0 normalizes to the exact viem signature", async () => {
  const auth = authorization();
  const expected = await expectedSignature(auth);
  const signer = circleDeveloperSigner({
    address: account.address,
    walletId: "wallet-1",
    blockchain: "ARC",
    signTypedData: async () => ({ signature: variantV0(expected) }),
  });
  assert.equal(await signer.signTransferAuthorization(auth), expected);
});

test("a high-s Circle signature normalizes to low-s with the matching v", async () => {
  const auth = authorization();
  const expected = await expectedSignature(auth);
  const signer = circleDeveloperSigner({
    address: account.address,
    walletId: "wallet-1",
    blockchain: "ARC",
    signTypedData: async () => ({ signature: variantHighS(expected) }),
  });
  assert.equal(await signer.signTransferAuthorization(auth), expected);
});

test("normalizeSignature leaves a canonical signature unchanged", async () => {
  const expected = await expectedSignature(authorization());
  assert.equal(normalizeSignature(expected), expected);
});

test("the request sends EIP-712 JSON with the wallet id, or with the address and ARC", async () => {
  const seen: CircleSignTypedDataRequest[] = [];
  const expected = await expectedSignature(authorization());
  const provider = async (request: CircleSignTypedDataRequest) => {
    seen.push(request);
    return { signature: expected };
  };
  await circleDeveloperSigner({ address: account.address, walletId: "wallet-1", blockchain: "ARC", signTypedData: provider }).signTransferAuthorization(authorization());
  await circleDeveloperSigner({ address: account.address, blockchain: "ARC", signTypedData: provider }).signTransferAuthorization(authorization());

  assert.equal(seen[0].walletId, "wallet-1");
  assert.equal(seen[0].walletAddress, undefined);
  assert.equal(seen[1].walletAddress, account.address);
  assert.equal(seen[1].blockchain, "ARC");
  const json = JSON.parse(seen[1].data) as { primaryType: string; message: { value: string }; domain: { chainId: number } };
  assert.equal(json.primaryType, "TransferWithAuthorization");
  assert.equal(json.message.value, "360");
  assert.equal(json.domain.chainId, 5042);
});

test("refuses testnet, other chains, other assets, empty windows, and bad nonces before any provider call", async () => {
  let calls = 0;
  const provider = async () => {
    calls += 1;
    return { signature: "0x" };
  };
  assert.throws(
    () => circleDeveloperSigner({ address: account.address, blockchain: "ARC-TESTNET" as never, signTypedData: provider }),
    (error: unknown) => isPqtabsError(error) && error.code === "invalid_config",
  );
  const signer = circleDeveloperSigner({ address: account.address, blockchain: "ARC", signTypedData: provider });
  const bad: Array<[string, Partial<TransferAuthorization>]> = [
    ["chain 1", { chainId: 1 }],
    ["another asset", { asset: "0x0000000000000000000000000000000000000001" }],
    ["zero amount", { value: 0n }],
    ["empty window", { validAfter: 10n, validBefore: 10n }],
    ["short nonce", { nonce: "0x1234" as Hex }],
  ];
  for (const [label, overrides] of bad) {
    await assert.rejects(() => signer.signTransferAuthorization(authorization(overrides)), (error: unknown) => isPqtabsError(error), label);
  }
  assert.equal(calls, 0, "no request may reach Circle for a refused authorization");
});

test("a signature from another key is refused as a mismatch, and nothing is returned", async () => {
  const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const auth = authorization();
  const otherSig = await other.signTypedData(transferAuthorizationTypedData(auth));
  const signer = circleDeveloperSigner({
    address: account.address,
    walletId: "wallet-1",
    blockchain: "ARC",
    signTypedData: async () => ({ signature: otherSig }),
  });
  await assert.rejects(
    () => signer.signTransferAuthorization(auth),
    (error: unknown) => isPqtabsError(error) && error.code === "signer_mismatch",
  );
});

test("a malformed or failing Circle response is a signer error that never echoes the provider text", async () => {
  const auth = authorization();
  const short = circleDeveloperSigner({
    address: account.address,
    walletId: "wallet-1",
    blockchain: "ARC",
    signTypedData: async () => ({ signature: "0x1234" }),
  });
  await assert.rejects(() => short.signTransferAuthorization(auth), (error: unknown) => isPqtabsError(error) && error.code === "signer_unavailable");

  const failing = circleDeveloperSigner({
    address: account.address,
    walletId: "wallet-1",
    blockchain: "ARC",
    signTypedData: async () => {
      throw new Error("401 Unauthorized apiKey=SECRET-VALUE");
    },
  });
  await assert.rejects(
    () => failing.signTransferAuthorization(auth),
    (error: unknown) => isPqtabsError(error) && error.code === "signer_unavailable" && !error.message.includes("SECRET-VALUE"),
  );
});
