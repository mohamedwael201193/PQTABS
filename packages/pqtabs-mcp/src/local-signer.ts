import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { type AgentSigner, PqtabsError, privateKeySigner, type TransferAuthorization } from "pqtabs-sdk";
import { type Address, type Hex, isAddress } from "viem";

/**
 * The MCP never holds the agent key on this path. The key stays inside the local `pqtabs-signer` process, which
 * protects it with the OS credential store (Windows DPAPI). The MCP sends one authorization on stdin and gets back
 * one 65-byte signature. The SDK still checks that the signature recovers to the capability's agent.
 */

const MAX_STDOUT = 4_096;
const MAX_STDERR = 2_048;
const DEFAULT_TIMEOUT_MS = 30_000;

export type LocalSignerOptions = {
  /** The agent address, as stored by `pqtabs-signer import-backup`. */
  address: Address;
  /** Absolute path to the pqtabs-signer CLI entry (`packages/pqtabs-signer/dist/src/cli.js`). Run with this Node binary. */
  cliPath: string;
  timeoutMs?: number;
  /** Test seam. Defaults to `process.execPath` with `cliPath`. */
  command?: { file: string; args: string[] };
};

/** Turns any long hex in a message into a placeholder, so no key or signature can reach the user through an error. */
function safeText(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{40,}/g, "[hex]").replace(/\s+/g, " ").trim().slice(0, 240);
}

function failSigner(message: string): PqtabsError {
  return new PqtabsError("signer_unavailable", `${message} Nothing was broadcast.`);
}

/** A signer that asks the local pqtabs-signer process for one signature. */
export function localSignerProcess(options: LocalSignerOptions): AgentSigner {
  if (!isAddress(options.address)) {
    throw new PqtabsError("invalid_config", "The local signer needs a valid agent address.");
  }
  const address = options.address;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const command = options.command ?? { file: process.execPath, args: [options.cliPath] };

  return {
    address,
    signTransferAuthorization: (authorization: TransferAuthorization) =>
      runSign(command, address, authorization, timeoutMs),
  };
}

function runSign(
  command: { file: string; args: string[] },
  address: Address,
  authorization: TransferAuthorization,
  timeoutMs: number,
): Promise<Hex> {
  const payload = JSON.stringify({
    chainId: authorization.chainId,
    asset: authorization.asset,
    from: authorization.from,
    to: authorization.to,
    value: authorization.value.toString(),
    validAfter: authorization.validAfter.toString(),
    validBefore: authorization.validBefore.toString(),
    nonce: authorization.nonce,
  });

  return new Promise<Hex>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command.file, [...command.args, "sign", "--agent", address], {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      reject(failSigner("The local signer could not start. Check PQTABS_SIGNER_CLI."));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: PqtabsError | null, value?: Hex) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value as Hex);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(failSigner("The local signer did not answer in time."));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_STDOUT) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString("utf8");
    });
    child.on("error", () => finish(failSigner("The local signer could not start. Check PQTABS_SIGNER_CLI.")));
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        finish(refusalFrom(stderr));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { ok?: boolean; agent?: string; signature?: string };
        if (parsed.ok !== true || typeof parsed.signature !== "string") {
          finish(failSigner("The local signer returned an unexpected answer."));
          return;
        }
        if (typeof parsed.agent !== "string" || parsed.agent.toLowerCase() !== address.toLowerCase()) {
          finish(failSigner("The local signer holds a different agent than this capability expects."));
          return;
        }
        if (!/^0x[0-9a-fA-F]{130}$/.test(parsed.signature)) {
          finish(failSigner("The local signer returned a signature that is not 65 bytes."));
          return;
        }
        finish(null, parsed.signature as Hex);
      } catch {
        finish(failSigner("The local signer returned an unreadable answer."));
      }
    });

    child.stdin?.on("error", () => {
      // The child may exit before reading stdin. The close handler reports the failure.
    });
    child.stdin?.end(payload);
  });
}

/** Maps the signer's `{ok:false, code, message}` refusal. An unreadable refusal still fails closed. */
function refusalFrom(stderr: string): PqtabsError {
  try {
    const parsed = JSON.parse(stderr.trim().split("\n").pop() ?? "") as { code?: string; message?: string };
    if (parsed && typeof parsed.code === "string") {
      const detail = typeof parsed.message === "string" ? safeText(parsed.message) : "";
      return failSigner(`The local signer refused (${safeText(parsed.code)}). ${detail}`.trim());
    }
  } catch {
    // Fall through: not a JSON refusal.
  }
  return failSigner("The local signer refused the request or failed.");
}

export type SignerFromEnv = {
  signer?: AgentSigner;
  /** A human note for stderr. Never contains a key. */
  notice?: string;
};

/**
 * Chooses the signer from the environment. Fails closed: a local signer needs both the CLI path and the agent.
 * The legacy key variable is accepted only alone, and it is named as the legacy path.
 */
export function signerFromEnv(env: NodeJS.ProcessEnv): SignerFromEnv {
  const cliPath = env.PQTABS_SIGNER_CLI?.trim() ?? "";
  const agent = env.PQTABS_SIGNER_AGENT?.trim() ?? "";
  const legacyKey = env.PQTABS_AGENT_PRIVATE_KEY?.trim() ?? "";
  const local = cliPath !== "" || agent !== "";

  if (local && legacyKey !== "") {
    throw new PqtabsError(
      "invalid_config",
      "Set the local signer (PQTABS_SIGNER_CLI and PQTABS_SIGNER_AGENT) or the legacy key (PQTABS_AGENT_PRIVATE_KEY), not both. Nothing was started.",
    );
  }
  if (local) {
    if (cliPath === "" || agent === "") {
      throw new PqtabsError("invalid_config", "The local signer needs both PQTABS_SIGNER_CLI and PQTABS_SIGNER_AGENT. Nothing was started.");
    }
    if (!isAddress(agent)) {
      throw new PqtabsError("invalid_config", "PQTABS_SIGNER_AGENT must be an agent address, not a key. Nothing was started.");
    }
    if (!existsSync(cliPath)) {
      throw new PqtabsError("invalid_config", "PQTABS_SIGNER_CLI does not point to an existing pqtabs-signer CLI. Nothing was started.");
    }
    return { signer: localSignerProcess({ address: agent, cliPath }) };
  }
  if (legacyKey !== "") {
    try {
      return {
        signer: privateKeySigner(legacyKey as Hex),
        notice:
          "Legacy mode: the agent key is in PQTABS_AGENT_PRIVATE_KEY. Move it to the local signer (PQTABS_SIGNER_CLI and PQTABS_SIGNER_AGENT) when you can.",
      };
    } catch {
      // Never echo the value. Say what is wrong and stop.
      throw new PqtabsError("invalid_config", "PQTABS_AGENT_PRIVATE_KEY is not a 32-byte hex key. Fix it or unset it. Nothing was started.");
    }
  }
  return {};
}
