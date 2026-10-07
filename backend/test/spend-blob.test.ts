import assert from "node:assert/strict";
import test from "node:test";
import { type Hex, encodeAbiParameters, getAddress, hexToBytes, keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseSpendBlob, recoverSpendSigner, sameSpendTerms } from "../src/index/spend-blob.js";

const tab = "0x56377522376b5273a97313992c7970B106cB3837";
const payee = "0xC485B657C140C9677846f3E9ca6a3158e5623044";

function word(value: bigint): Uint8Array {
  return hexToBytes(encodeAbiParameters([{ type: "uint256" }], [value]));
}

test("the recovered signer is the key that signed these exact terms", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
  const value = 5n;
  const validBefore = 200n;
  const signature = await account.signTypedData({
    domain: {
      name: "USDC",
      version: "2",
      chainId: 5042,
      verifyingContract: "0x3600000000000000000000000000000000000000",
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: getAddress(tab), to: getAddress(payee), value, validAfter: 0n, validBefore, nonce },
  });
  const packed = new Uint8Array(213);
  packed.set(hexToBytes(signature), 0);
  packed.set(hexToBytes(getAddress(payee)), 65);
  packed.set(word(value), 85);
  packed.set(word(0n), 117);
  packed.set(word(validBefore), 149);
  packed.set(hexToBytes(nonce), 181);
  const blob = parseSpendBlob(toHex(packed));
  assert.ok(blob);
  assert.equal(
    sameSpendTerms(blob, { to: getAddress(payee), value, validAfter: 0n, validBefore, nonce }),
    true,
  );
  assert.equal(await recoverSpendSigner(getAddress(tab), blob), account.address);

  const changed = new Uint8Array(packed);
  changed[90] ^= 0x01;
  const tampered = parseSpendBlob(toHex(changed));
  assert.ok(tampered);
  assert.equal(
    sameSpendTerms(tampered, { to: getAddress(payee), value, validAfter: 0n, validBefore, nonce }),
    false,
  );

  const flipped = new Uint8Array(packed);
  flipped[10] ^= 0x01;
  const bad = parseSpendBlob(toHex(flipped));
  assert.ok(bad);
  const recovered = await recoverSpendSigner(getAddress(tab), bad).catch(() => null);
  assert.notEqual(recovered, account.address);
});

test("a blob that is not 213 bytes is rejected", () => {
  assert.equal(parseSpendBlob(`0x${"11".repeat(65)}` as Hex), null);
});
