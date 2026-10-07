import assert from "node:assert/strict";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openAgentBackup, sealAgentBackup } from "./agent-vault.ts";

test("an agent backup opens only with its passphrase and never names a different key", async () => {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  const file = await sealAgentBackup(privateKey, address, "correct horse battery");
  const parsed = JSON.parse(file) as { ciphertext: string };
  assert.equal(parsed.ciphertext.includes(privateKey.slice(2)), false);
  const opened = await openAgentBackup(file, "correct horse battery");
  assert.equal(opened.address.toLowerCase(), address.toLowerCase());
  assert.equal(opened.privateKey, privateKey);
  await assert.rejects(() => openAgentBackup(file, "wrong passphrase"), /passphrase/);
});
