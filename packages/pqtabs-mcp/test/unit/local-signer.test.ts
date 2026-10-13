/**
 * The local signer path: the MCP asks a separate process for one signature and never receives the key.
 * The fixture is a test double for the pqtabs-signer CLI. Its expected signature comes from viem with a public
 * test key, so the check is exact. The test key is public and must never hold funds.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isPqtabsError, type TransferAuthorization, transferAuthorizationTypedData } from "pqtabs-sdk";
import { type Hex, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localSignerProcess, signerFromEnv } from "../../src/local-signer.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "..", "..", "test", "fixtures", "fake-signer.mjs");

const TEST_KEY = `0x${"11".repeat(32)}` as const;
const account = privateKeyToAccount(TEST_KEY);
const TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const USDC = "0x3600000000000000000000000000000000000000";
const NONCE = `0x${"ab".repeat(32)}` as const;

function authorization(): TransferAuthorization {
  return {
    chainId: 5042,
    asset: USDC,
    from: TAB,
    to: PAYEE,
    value: 360n,
    validAfter: 0n,
    validBefore: 1_900_000_000n,
    nonce: NONCE,
  };
}

async function expectedSignature(): Promise<Hex> {
  return account.signTypedData(transferAuthorizationTypedData(authorization()));
}

function withFake(mode: string, extra: Record<string, string> = {}): void {
  process.env.FAKE_MODE = mode;
  process.env.FAKE_AGENT = account.address;
  process.env.FAKE_EXPECT_FROM = TAB;
  for (const [key, value] of Object.entries(extra)) process.env[key] = value;
}

function signerFor(timeoutMs = 10_000) {
  return localSignerProcess({
    address: account.address,
    cliPath: FIXTURE,
    timeoutMs,
    command: { file: process.execPath, args: [FIXTURE] },
  });
}

test("the local signer returns the exact signature, and that signature recovers to the agent", async () => {
  const expected = await expectedSignature();
  process.env.FAKE_SIGNATURE = expected;
  withFake("sign");
  const signature = await signerFor().signTransferAuthorization(authorization());
  assert.equal(signature, expected);
  const recovered = await recoverTypedDataAddress({ ...transferAuthorizationTypedData(authorization()), signature });
  assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
});

test("the MCP holds no key on the local path, and the signer object carries no secret", async () => {
  delete process.env.PQTABS_AGENT_PRIVATE_KEY;
  const signer = signerFor();
  assert.equal(signer.address, account.address);
  assert.equal(JSON.stringify(signer).includes(TEST_KEY.slice(2)), false);
  assert.equal(Object.keys(signer).sort().join(","), "address,signTransferAuthorization");
});

test("a refusal from the signer is a signer error that names the reason and never a key", async () => {
  process.env.FAKE_SIGNATURE = await expectedSignature();
  withFake("refuse");
  await assert.rejects(
    () => signerFor().signTransferAuthorization(authorization()),
    (error: unknown) =>
      isPqtabsError(error) &&
      error.code === "signer_unavailable" &&
      error.message.includes("refused_chain") &&
      !error.message.includes(TEST_KEY.slice(2)),
  );
});

test("an unreadable failure from the signer still fails closed, with no echo of its output", async () => {
  process.env.FAKE_SIGNATURE = await expectedSignature();
  withFake("garbage");
  await assert.rejects(
    () => signerFor().signTransferAuthorization(authorization()),
    (error: unknown) => isPqtabsError(error) && error.code === "signer_unavailable" && !/0xab{10}/.test(error.message),
  );
});

test("a signer that never answers times out and nothing is broadcast", async () => {
  process.env.FAKE_SIGNATURE = await expectedSignature();
  withFake("hang");
  await assert.rejects(
    () => signerFor(300).signTransferAuthorization(authorization()),
    (error: unknown) => isPqtabsError(error) && error.code === "signer_unavailable" && error.message.includes("did not answer"),
  );
});

test("a signer that reports another agent is refused", async () => {
  process.env.FAKE_SIGNATURE = await expectedSignature();
  withFake("wrong_agent");
  await assert.rejects(
    () => signerFor().signTransferAuthorization(authorization()),
    (error: unknown) => isPqtabsError(error) && error.message.includes("different agent"),
  );
});

test("a missing signer executable fails closed", async () => {
  const signer = localSignerProcess({
    address: account.address,
    cliPath: "missing",
    timeoutMs: 5_000,
    command: { file: join(here, "no-such-binary-for-pqtabs-test"), args: [] },
  });
  await assert.rejects(
    () => signer.signTransferAuthorization(authorization()),
    (error: unknown) => isPqtabsError(error) && error.code === "signer_unavailable" && error.message.includes("could not start"),
  );
});

test("the environment chooses the local signer only with both the CLI and an agent address", async () => {
  delete process.env.PQTABS_AGENT_PRIVATE_KEY;
  const env = { PQTABS_SIGNER_CLI: FIXTURE, PQTABS_SIGNER_AGENT: account.address } as NodeJS.ProcessEnv;
  const chosen = signerFromEnv(env);
  assert.equal(chosen.signer?.address, account.address);
  assert.equal(chosen.notice, undefined);

  assert.throws(
    () => signerFromEnv({ PQTABS_SIGNER_CLI: FIXTURE } as NodeJS.ProcessEnv),
    (error: unknown) => isPqtabsError(error) && error.code === "invalid_config",
  );
  assert.throws(
    () => signerFromEnv({ PQTABS_SIGNER_CLI: FIXTURE, PQTABS_SIGNER_AGENT: TEST_KEY } as NodeJS.ProcessEnv),
    (error: unknown) => isPqtabsError(error) && error.code === "invalid_config" && !error.message.includes(TEST_KEY.slice(2)),
  );
  assert.throws(
    () => signerFromEnv({ PQTABS_SIGNER_CLI: join(here, "missing-cli.js"), PQTABS_SIGNER_AGENT: account.address } as NodeJS.ProcessEnv),
    (error: unknown) => isPqtabsError(error) && error.code === "invalid_config",
  );
});

test("the local signer and the legacy key cannot both be set", () => {
  assert.throws(
    () => signerFromEnv({ PQTABS_SIGNER_CLI: FIXTURE, PQTABS_SIGNER_AGENT: account.address, PQTABS_AGENT_PRIVATE_KEY: TEST_KEY } as NodeJS.ProcessEnv),
    (error: unknown) => isPqtabsError(error) && error.code === "invalid_config" && !error.message.includes(TEST_KEY.slice(2)),
  );
});

test("the legacy key works only alone, and it is named as legacy", () => {
  const chosen = signerFromEnv({ PQTABS_AGENT_PRIVATE_KEY: TEST_KEY } as NodeJS.ProcessEnv);
  assert.equal(chosen.signer?.address, account.address);
  assert.match(chosen.notice ?? "", /Legacy mode/);
  assert.equal(chosen.notice?.includes(TEST_KEY.slice(2)), false);
});

test("no signer is configured when nothing is set, and a malformed legacy key never echoes", () => {
  assert.deepEqual(signerFromEnv({} as NodeJS.ProcessEnv), {});
  assert.throws(
    () => signerFromEnv({ PQTABS_AGENT_PRIVATE_KEY: "0xdeadbeef" } as NodeJS.ProcessEnv),
    (error: unknown) => isPqtabsError(error) && error.code === "invalid_config" && !error.message.includes("deadbeef"),
  );
});
