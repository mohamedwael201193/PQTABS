#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { type Address, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { openAgentBackup } from "./backup.js";
import { SignerError } from "./errors.js";
import { defaultKeyDir, loadAgentKey, removeAgentKey, saveAgentKey, storedAgents } from "./keystore.js";
import { platformProtector } from "./protect.js";
import { openKeystoreSigner, parseAuthorizationJson } from "./signer.js";

/**
 * Command-line entry point. Every output is public data: addresses, booleans, signatures, and error codes.
 * No command prints a private key, and the passphrase is read only from an interactive terminal.
 *
 * Commands:
 *   platform                                     Show whether this machine has a tested key store.
 *   import-backup <file> --agent <address>       Import a PQTABS dashboard backup into the local store.
 *   status --agent <address>                     Report whether a key is stored and unlocks for this agent.
 *   list                                         List stored agent addresses.
 *   forget --agent <address>                     Remove the stored key for an agent.
 *   sign --agent <address>                       Sign one Arc USDC authorization read as JSON from stdin.
 */

type Parsed = { command: string; positional: string[]; flags: Record<string, string | true> };

function parseArgs(argv: string[]): Parsed {
  const [command = "", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] as string;
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = rest[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        index++;
      } else {
        flags[name] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { command, positional, flags };
}

function requireAgent(flags: Record<string, string | true>): Address {
  const value = flags.agent;
  if (typeof value !== "string") throw new SignerError("missing_agent", "Pass the agent address with --agent 0x...");
  try {
    return getAddress(value);
  } catch {
    throw new SignerError("invalid_address", "That is not a valid Ethereum address.");
  }
}

/** Reads a passphrase from the terminal with echo off. Refuses when stdin is not a terminal. */
function readHiddenLine(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new SignerError("tty_required", "Run this in an interactive terminal so the passphrase is never echoed or logged.");
  }
  process.stderr.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\r" || character === "\n") {
          finish();
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          finish();
          process.stderr.write("\n");
          reject(new SignerError("cancelled", "Cancelled. Nothing was stored."));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function run(argv: string[]): Promise<unknown> {
  const { command, positional, flags } = parseArgs(argv);
  const dir = defaultKeyDir();
  switch (command) {
    case "platform": {
      const protector = platformProtector();
      return { ok: true, protector: protector.name, keyDir: dir };
    }
    case "import-backup": {
      const file = positional[0];
      if (!file) throw new SignerError("missing_file", "Pass the backup file path.");
      const agent = requireAgent(flags);
      const protector = platformProtector();
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        throw new SignerError("missing_file", "The backup file could not be read. Check the path.");
      }
      const passphrase = await readHiddenLine("Backup passphrase (hidden): ");
      const opened = openAgentBackup(text, passphrase);
      if (opened.address.toLowerCase() !== agent.toLowerCase()) {
        throw new SignerError("address_mismatch", `The backup holds ${opened.address}, not ${agent}. Nothing was stored.`);
      }
      await saveAgentKey({ dir, agent, privateKey: opened.privateKey, protector, replace: flags.replace === true });
      // Read back through the same path the signer uses, so a bad store is caught now, not at payment time.
      const check = await loadAgentKey({ dir, agent, protector });
      const derived = privateKeyToAccount(check).address;
      return { ok: derived.toLowerCase() === agent.toLowerCase(), agent, stored: true, verifiedAfterStore: true, protector: protector.name };
    }
    case "status": {
      const agent = requireAgent(flags);
      const protector = platformProtector();
      const stored = (await storedAgents(dir)).some((address) => address.toLowerCase() === agent.toLowerCase());
      if (!stored) return { ok: false, agent, stored: false, unlocks: false };
      try {
        await loadAgentKey({ dir, agent, protector });
        return { ok: true, agent, stored: true, unlocks: true };
      } catch (error) {
        const code = error instanceof SignerError ? error.code : "unknown";
        return { ok: false, agent, stored: true, unlocks: false, code };
      }
    }
    case "list": {
      return { ok: true, agents: await storedAgents(dir) };
    }
    case "forget": {
      const agent = requireAgent(flags);
      const removed = await removeAgentKey({ dir, agent });
      return { ok: true, agent, removed };
    }
    case "sign": {
      const agent = requireAgent(flags);
      const protector = platformProtector();
      const signer = await openKeystoreSigner({ dir, agent, protector });
      const authorization = parseAuthorizationJson(await readStdin());
      const signature = await signer.signTransferAuthorization(authorization);
      return { ok: true, agent: signer.address, signature };
    }
    default:
      throw new SignerError(
        "usage",
        "Usage: pqtabs-signer <platform | import-backup <file> --agent 0x... | status --agent 0x... | list | forget --agent 0x... | sign --agent 0x...>",
      );
  }
}

async function main(): Promise<void> {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof SignerError ? error.code : "unexpected";
    const message = error instanceof SignerError ? error.message : "Unexpected error. No key was printed.";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message })}\n`);
    process.exitCode = 1;
  }
}

void main();
