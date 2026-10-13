# pqtabs-signer

Local agent signer for PQTABS on Arc. It keeps the agent key on this machine, protected by the operating system, and signs one Arc USDC authorization at a time for Barkeep. The key is never printed, sent to the backend, placed in the frontend, stored in a database, or returned to MCP.

Status: private package, version 0.1.0, not published. Windows only in this version. Other platforms fail closed.

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
npm test          # 34 unit tests, including real DPAPI round-trips on Windows
npm run lint      # Biome
```
