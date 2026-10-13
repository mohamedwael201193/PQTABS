# pqtabs-signer

Local agent signer for PQTABS on Arc. It keeps the agent key on this machine, protected by the operating system, and signs one Arc USDC authorization at a time for Barkeep. The key is never printed, sent to the backend, placed in the frontend, stored in a database, or returned to MCP.

Status: private package, version 0.1.0, not published to npm. Windows only in this version. Other platforms fail closed.

## Install on Windows

Requirements: Windows 10 or 11, Windows PowerShell 5.1 or PowerShell 7, Node.js 22 or newer.

```powershell
cd packages\pqtabs-signer
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

The script runs `npm ci` from the committed lockfile, builds the CLI, runs the 43 signer tests (including real DPAPI round-trips), checks that the machine reports `windows-dpapi-user`, and prints the CLI path and the two MCP settings. It creates, imports, and prints no key. Add `-SkipTests` to skip the tests. A clean copy of this package was installed and tested this way on 2026-10-13.

Then choose one of these, in an interactive terminal (the passphrase is read with echo off):

```powershell
node dist\src\cli.js create                                   # a new agent key on this machine
node dist\src\cli.js import-backup backup.json --agent 0x...  # an existing PQTABS-AGENT-1 backup
node dist\src\cli.js status --agent 0x...                     # prints whether it unlocks, never the key
```

Put the printed `PQTABS_SIGNER_CLI` (absolute path to `dist\src\cli.js`) and `PQTABS_SIGNER_AGENT` (the public address) in the `pqtabs` entry of your MCP configuration. Do not set `PQTABS_AGENT_PRIVATE_KEY` as well: the MCP refuses to start with both.

## Other operating systems

macOS and Linux are not supported yet. `platform`, `create`, `import-backup`, `status`, `list`, `forget`, and `sign` all stop with `unsupported_platform` and store nothing. This is deliberate: no key is written to a file that the operating system does not protect.

To add a platform, implement a `Protector` in `src/protect.ts` (`protect` and `unprotect`, both failing closed) backed by that system's own store, for example the macOS Keychain with an access-control item, or the Linux Secret Service. Then:

1. Add tests that run on that platform, including a round-trip, a wrong-user or missing-item refusal, and a corrupt-store refusal.
2. Add a CI job on that platform's runner, next to the `pqtabs-signer` Windows job in `.github/workflows/ci.yml`.
3. Add its install script next to `scripts/install-windows.ps1` and update this section.

Until then, a developer on macOS or Linux can use the MCP without a local signer (read tools only), or pair from a machine that runs Windows.

## Commands

| Command | Purpose |
| --- | --- |
| `pqtabs-signer platform` | Shows the protector for this machine and the key directory. |
| `pqtabs-signer import-backup <file> --agent 0x...` | Opens a PQTABS dashboard backup (`PQTABS-AGENT-1`) and stores its key. The passphrase is read from the terminal with echo off. |
| `pqtabs-signer status --agent 0x...` | Reports whether a key is stored and unlocks. Prints no key. |
| `pqtabs-signer list` | Lists stored agent addresses. |
| `pqtabs-signer forget --agent 0x...` | Removes the stored key. |
| `pqtabs-signer sign --agent 0x...` | Reads one authorization as JSON on stdin and prints `{ok, agent, signature}`. |

The `sign` input is:

```json
{"chainId":5042,"asset":"0x3600000000000000000000000000000000000000","from":"0xTAB","to":"0xPAYEE","value":"360","validAfter":"0","validBefore":"1800000600","nonce":"0x...32 bytes..."}
```

## Guarantees

- The key is stored only as ciphertext from Windows DPAPI with user scope. Only this Windows user account can unlock it. The stored file is named by the public agent address.
- Every store, import, and unlock derives the address from the key and fails closed on mismatch.
- Import refuses a backup whose named address does not match its key, and refuses to overwrite a stored key unless `--replace` is given.
- Signing accepts only chain 5042 and the Arc USDC asset. It refuses zero or oversized amounts, an empty or inverted validity window, a window already expired, and a nonce that is not 32 bytes.
- Signatures are 65 bytes with v in {27, 28} and low s, which Barkeep requires.
- Errors carry stable codes and human messages. No command prints key material.

## Not guaranteed

- Barkeep's on-chain caps, payee allowlist, balance, and expiry remain the real spend limits. This signer does not enforce a tariff, a per-day budget, or payee policy. The MCP and SDK must check policy before calling `sign`.
- Anyone who can run this CLI as the same Windows user can ask it to sign. The signer does not authenticate its caller.
- A stored key is only as safe as the Windows account that owns it. Keep a backup of the encrypted dashboard export in a secure place. Losing both the stored key and the backup means losing the agent key.
- macOS and Linux are not supported. Add a store there only with tests on that platform.

## Development

```
npm run build
npm test          # 43 unit tests, including real DPAPI round-trips on Windows (CI: windows-latest)
npm run lint      # Biome
```
