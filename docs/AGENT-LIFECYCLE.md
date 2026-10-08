# Agent lifecycle

The agent key is created in the browser and wrapped with a non-extractable AES-GCM key in IndexedDB (`frontend/src/data/agent-vault.ts`). `localStorage` stores the name, purpose, and address only. An export file is `PQTABS-AGENT-1`: PBKDF2-SHA-256 and AES-GCM. `frontend` test `test:agent-vault` checks that the file does not contain the key and that the wrong passphrase fails.

A registrar change drops the in-memory copies and loads only that registrar's records.

On `http://localhost:3000`, registrar `0xf76e…71a3` was connected and root `0x846f…65Cf` was shown. IndexedDB `pqtabs-agent-vault` had the `agents` and `wrap` stores, zero agent records, and no device wrap key. `localStorage` key `pqtabs.registrar` was present. No PQTABS value was a 32-byte private key. The create screen still listed three agents taken from closed capabilities, including `0x5411…166D`, and would have let that address be authorized. Those addresses are chain history. This browser cannot sign for them. The create screen now offers an agent only when this browser holds its key. Pasting an address without that key does not select it. The agents list says the key is absent even when the agent was never named on this device. The agents page header says no agent on that page can pay from this browser when none of those keys are stored here.

The root security key was not unlocked. The authorize step asked for the backup file and passphrase. Neither was supplied. No capability was opened.

Not proven: restore on a second browser, a signature after reload on https://pqtabs.vercel.app, or a mainnet payment after that reload. The production Chrome wallet is still `0xBDfC…0034` and has no root. The key still cannot pay from another device until the backup file is restored. The dashboard is not a background agent. Closing the page stops any unpaid click. There is no separate runtime that pays while the dashboard is closed.
