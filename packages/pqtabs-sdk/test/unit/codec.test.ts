/** MOCKED unit tests for the byte layout, the signer boundary, and the receipt rule. No network. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Hex, hexToBytes, pad, toHex } from "viem";
import { SPEND_BLOB_BYTES, TRANSFER_TOPIC, USDC_ADDRESS } from "../../src/constants.js";
import { PqtabsError } from "../../src/errors.js";
import { checkUsdcSettlement } from "../../src/receipt.js";
import { privateKeySigner, recoverAuthorizationSigner, type TransferAuthorization } from "../../src/signer.js";
import { decodeSpendBlob, encodeSpendBlob } from "../../src/spend-blob.js";
import { PAYEE, settledReceipt, TAB, TEST_KEY } from "../helpers.js";

const NONCE = `0x${"42".repeat(32)}` as Hex;

test("spend blob is 213 bytes and round-trips every field", () => {
  const signature = `0x${"aa".repeat(65)}` as Hex;
  const blob = encodeSpendBlob({ signature, to: PAYEE, value: 360n, validAfter: 0n, validBefore: 1_900_000_000n, nonce: NONCE });
  assert.equal(hexToBytes(blob).length, SPEND_BLOB_BYTES);
  const decoded = decodeSpendBlob(blob);
  assert.equal(decoded.signature, signature);
  assert.equal(decoded.to, PAYEE);
  assert.equal(decoded.value, 360n);
  assert.equal(decoded.validAfter, 0n);
  assert.equal(decoded.validBefore, 1_900_000_000n);
  assert.equal(decoded.nonce, NONCE);
});

test("spend blob refuses a signature that is not 65 bytes", () => {
  assert.throws(
    () => encodeSpendBlob({ signature: `0x${"aa".repeat(64)}` as Hex, to: PAYEE, value: 1n, validAfter: 0n, validBefore: 2n, nonce: NONCE }),
    (error: unknown) => error instanceof PqtabsError && error.code === "invalid_input",
  );
});

test("decodeSpendBlob refuses a blob of the wrong length", () => {
  assert.throws(() => decodeSpendBlob(`0x${"00".repeat(212)}` as Hex), PqtabsError);
});

test("the agent signature recovers to the signer address over the USDC EIP-3009 digest", async () => {
  const signer = privateKeySigner(TEST_KEY);
  const authorization: TransferAuthorization = {
    chainId: 5042,
    asset: USDC_ADDRESS,
    from: TAB,
    to: PAYEE,
    value: 360n,
    validAfter: 0n,
    validBefore: 1_900_000_000n,
    nonce: NONCE,
  };
  const signature = await signer.signTransferAuthorization(authorization);
  assert.equal(hexToBytes(signature).length, 65);
  const recovered = await recoverAuthorizationSigner(authorization, signature);
  assert.equal(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("a changed value does not recover to the agent, so a tampered authorization is detectable", async () => {
  const signer = privateKeySigner(TEST_KEY);
  const authorization: TransferAuthorization = {
    chainId: 5042,
    asset: USDC_ADDRESS,
    from: TAB,
    to: PAYEE,
    value: 360n,
    validAfter: 0n,
    validBefore: 1_900_000_000n,
    nonce: NONCE,
  };
  const signature = await signer.signTransferAuthorization(authorization);
  const recovered = await recoverAuthorizationSigner({ ...authorization, value: 361n }, signature);
  assert.notEqual(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("the signer never exposes its private key in its serialized form", () => {
  const signer = privateKeySigner(TEST_KEY);
  const serialized = JSON.stringify(signer);
  assert.equal(serialized.includes(TEST_KEY.slice(2)), false);
  assert.equal(Object.keys(signer).some((key) => /key|secret|private/i.test(key)), false);
});

test("a signer rejects a malformed private key", () => {
  assert.throws(() => privateKeySigner("0x1234" as Hex), (error: unknown) => error instanceof PqtabsError && error.code === "invalid_config");
});

test("a settled receipt needs exactly one USDC transfer from the capability to the payee", () => {
  const result = checkUsdcSettlement(settledReceipt(360n), { from: TAB, to: PAYEE, value: 360n });
  assert.equal(result.ok, true);
});

test("a reverted receipt never settles, even with a matching log", () => {
  const receipt = { ...settledReceipt(360n), status: "reverted" as const };
  assert.deepEqual(checkUsdcSettlement(receipt, { from: TAB, to: PAYEE, value: 360n }), { ok: false, reason: "reverted" });
});

test("a transfer to another payee, or of another amount, does not match", () => {
  const receipt = settledReceipt(360n);
  assert.deepEqual(
    checkUsdcSettlement(receipt, { from: TAB, to: "0x0000000000000000000000000000000000000001", value: 360n }),
    { ok: false, reason: "no_matching_transfer" },
  );
  assert.deepEqual(checkUsdcSettlement(receipt, { from: TAB, to: PAYEE, value: 359n }), { ok: false, reason: "no_matching_transfer" });
});

test("two matching transfers are refused, not counted as a success", () => {
  const base = settledReceipt(360n);
  const receipt = { ...base, logs: [...base.logs, ...base.logs] };
  assert.deepEqual(checkUsdcSettlement(receipt, { from: TAB, to: PAYEE, value: 360n }), {
    ok: false,
    reason: "multiple_matching_transfers",
  });
});

test("the 18-decimal native system log at 0xffff...fffe does not count as a USDC transfer", () => {
  const base = settledReceipt(360n);
  const native = {
    address: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
    topics: [TRANSFER_TOPIC, pad(TAB.toLowerCase() as Hex, { size: 32 }), pad(PAYEE.toLowerCase() as Hex, { size: 32 })],
    data: pad(toHex(360n), { size: 32 }),
  };
  const receipt = { ...base, logs: [native] };
  assert.deepEqual(checkUsdcSettlement(receipt, { from: TAB, to: PAYEE, value: 360n }), { ok: false, reason: "no_matching_transfer" });
});
