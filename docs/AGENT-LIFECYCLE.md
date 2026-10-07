# Agent lifecycle

The agent key is created in the browser and wrapped with a non-extractable AES-GCM key in IndexedDB (`frontend/src/data/agent-vault.ts`). `localStorage` stores the name, purpose, and address only. An export file is `PQTABS-AGENT-1`: PBKDF2-SHA-256 and AES-GCM. `frontend` test `test:agent-vault` checks that the file does not contain the key and that the wrong passphrase fails.

A registrar change drops the in-memory copies and loads only that registrar's records.

Not proven: restore on a second browser, a signature after reload on https://pqtabs.vercel.app, or a mainnet payment after that reload. The selected Chrome wallet has no root, so that path was not opened. The key still cannot pay from another device until the backup file is restored. The dashboard is not a background agent. Closing the page stops any unpaid click. There is no separate runtime that pays while the dashboard is closed.
