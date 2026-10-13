import { spawn } from "node:child_process";
import { SignerError } from "./errors.js";

/**
 * Encrypts key bytes so that only the current operating-system user can decrypt them.
 * Implementations must fail closed: a failed protect or unprotect throws and never returns partial data.
 */
export interface Protector {
  readonly name: string;
  protect(plaintext: Uint8Array): Promise<Uint8Array>;
  unprotect(ciphertext: Uint8Array): Promise<Uint8Array>;
}

const DPAPI_ENTROPY = "pqtabs-signer-v1";
const DPAPI_TIMEOUT_MS = 30_000;

// Static PowerShell program. It holds no secrets. The request arrives as JSON on stdin, so key bytes never
// appear on a command line or in a process listing.
const DPAPI_PROGRAM = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$data = [Convert]::FromBase64String($request.data)
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
if ($request.op -eq 'protect') {
  $out = [Security.Cryptography.ProtectedData]::Protect($data, $entropy, $scope)
} elseif ($request.op -eq 'unprotect') {
  $out = [Security.Cryptography.ProtectedData]::Unprotect($data, $entropy, $scope)
} else {
  throw 'unknown operation'
}
[Console]::Out.Write([Convert]::ToBase64String($out))
`;

/** Runs the DPAPI program with `op` and returns the output bytes. Errors carry no payload data. */
function runDpapi(op: "protect" | "unprotect", input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(DPAPI_PROGRAM, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new SignerError("protector_timeout", "Windows did not answer in time. Nothing was changed."));
    }, DPAPI_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => {
      clearTimeout(timer);
      reject(new SignerError("protector_unavailable", "Windows PowerShell is not available on this machine."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new SignerError(
            op === "protect" ? "protect_failed" : "unlock_failed",
            op === "protect"
              ? "Windows could not protect the agent key for this user account. Nothing was stored."
              : "Windows could not unlock the stored agent key for this user account. It may belong to a different Windows user.",
          ),
        );
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length === 0) {
        reject(new SignerError(op === "protect" ? "protect_failed" : "unlock_failed", "Windows returned an unexpected result."));
        return;
      }
      resolve(new Uint8Array(Buffer.from(text, "base64")));
    });
    const request = JSON.stringify({ op, data: Buffer.from(input).toString("base64") });
    child.stdin.end(request);
  });
}

/** Windows DPAPI with user scope. The protected blob can be opened only by this Windows user account. */
export function dpapiProtector(): Protector {
  return {
    name: "windows-dpapi-user",
    async protect(plaintext) {
      const out = await runDpapi("protect", plaintext);
      if (out.length === 0) throw new SignerError("protect_failed", "Windows returned an empty result. Nothing was stored.");
      return out;
    },
    async unprotect(ciphertext) {
      const out = await runDpapi("unprotect", ciphertext);
      if (out.length === 0) throw new SignerError("unlock_failed", "The stored agent key could not be unlocked.");
      return out;
    },
  };
}

/** The protector for this machine. Other platforms fail closed until a reliable store is implemented and tested. */
export function platformProtector(platform: NodeJS.Platform = process.platform): Protector {
  if (platform === "win32") return dpapiProtector();
  throw new SignerError(
    "unsupported_platform",
    `No tested operating-system key store exists for ${platform} yet. Use Windows, or keep the key in your own secret manager and use the SDK's privateKeySigner.`,
  );
}
