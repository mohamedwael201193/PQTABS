import assert from "node:assert/strict";
import test from "node:test";
import { rootSignatureBlock } from "./root-sign-check.ts";

const vk = "0x5419dd969dc1290bb3cf19d47d5bd0d627fb085c3dc3d38d53a3b1275347bd20";

test("a current root key and nonce can be signed", () => {
  assert.equal(rootSignatureBlock({
    unlockedVk: vk,
    chainVk: vk.toUpperCase(),
    chainNonce: "1",
    preparedNonce: "1",
    now: BigInt(1_700_000_000),
    expiry: "1791560403",
  }), null);
});

test("a different verifying key is not signed", () => {
  assert.match(rootSignatureBlock({
    unlockedVk: "0x1111111111111111111111111111111111111111111111111111111111111111",
    chainVk: vk,
    chainNonce: "1",
    preparedNonce: "1",
    now: BigInt(1_700_000_000),
  }) ?? "", /older security key/);
});

test("a changed nonce is not signed", () => {
  assert.match(rootSignatureBlock({
    unlockedVk: vk,
    chainVk: vk,
    chainNonce: "2",
    preparedNonce: "1",
    now: BigInt(1_700_000_000),
  }) ?? "", /nonce changed/);
});

test("a missing clock or expiry is not signed", () => {
  assert.match(rootSignatureBlock({
    unlockedVk: vk,
    chainVk: vk,
    chainNonce: "1",
    preparedNonce: "1",
    now: BigInt(0),
  }) ?? "", /clock/);
  assert.match(rootSignatureBlock({
    unlockedVk: vk,
    chainVk: vk,
    chainNonce: "1",
    preparedNonce: "1",
    now: BigInt(1_700_000_000),
    expiry: "",
  }) ?? "", /expiry/);
});
