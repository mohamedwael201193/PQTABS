# Security

PQTABS is not deployed. This file describes the model under test, not a live treasury.

## Authority

A registrar wallet can create a root and is then only an index. Moving USDC, opening a tab, closing a tab, rotating the SLH-DSA key, or changing the exposure ceiling requires a valid SLH-DSA-SHA2-128s signature over `PQRoot.digestFor`. The signature covers the domain `PQTABS_V2`, chain id, that root's address, the nonce, the deadline, and the action hash.

The relayer chooses `msg.sender` and pays gas. It does not choose the action. A bad signature does not consume the nonce, because the nonce increments only after verification and a reverting action rolls the increment back.

There is no owner, proxy, or upgrade on `RootFactory` or `PQRoot`.

## Isolation

Each root is an EIP-1167 clone with its own verifying key, nonce, exposure, and USDC balance. A signature for root A includes A's address and does not verify on root B. An agent key is bound to one tab by Barkeep and cannot be swapped inside that tab. Closing the tab is a signed root action. After expiry, anyone may call `reclaim`, which can only return that tab's USDC to its owning root.

## Keys

PQ signing keys and agent keys stay with the user. `pqtabs-sign backup` encrypts a key file with Argon2id and AES-256-GCM. The passphrase never goes to a server. If the user loses both the key and the backup, that root's USDC cannot be moved. There is no operator recovery key.

## What this file does not claim

No third-party audit has been completed. Slither has not been run yet. Mainnet deployment has not happened. The Forge mock verifier must not be cited as a cryptographic proof.
