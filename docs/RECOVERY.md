# Key backup and recovery

There is no operator recovery key and no ECDSA override. A lost PQ key without a backup leaves that root's USDC where it is. That is the cost of keeping the server from being a second root.

## What the user keeps

Each root has its own SLH-DSA-SHA2-128s signing key. `pqtabs-sign keygen` writes a JSON file containing the signing key and the verifying key. The verifying key is public and is what `initialize` stores. The signing key is 64 bytes. It must not be committed, logged, or sent to the backend.

Agent keys are ordinary ECDSA keys, one per tab, because Barkeep binds `agent` into the tab clone. Revoking an agent is `CLOSE_TAB`. Replacing an agent is a new key, a new tab, and a close of the old tab. Rotating the PQ key does not change the agent.

## Backup file

`pqtabs-sign backup` encrypts the key file. The format is:

`PQTABS1` || salt (16) || nonce (12) || AES-256-GCM ciphertext

The key is derived with the `argon2` crate's `Argon2::default()`. In argon2 0.5.3 that is Argon2id, version `0x13`, memory cost 19,456 KiB, time cost 2, parallelism 1, and a 32-byte output. The passphrase is read from the terminal and is not written to the file. `restore` decrypts and prints the verifying key. The user compares that value to `pqVk()` on the root. The server never sees the passphrase.

A backup file without the passphrase does not yield the signing key. A passphrase without the backup file does not either. The user needs both, on a device they control.

## Rotation

`ROTATE_KEY` replaces `pqVk`. Signatures from the previous key no longer verify, including signatures that were already formed and not yet submitted. The mainnet record is tx `0x184edd6aedb3a58e4db90645e7b110bb387ee4c393a9cd2f65a7965817e5c55c` followed by the rejected old-key tx `0x19338117dd8b56fc01b95db0036e4efd6217f24d855c85c1046d0b2975f437ee`. The new key then transferred 1 raw unit.

Rotation does not sweep tabs. Open tabs keep their agent and their cap until close, expiry, or reclaim.

## What is intentionally absent

Threshold PQ backup, social recovery, and a second on-chain authority were not added. Any of those would be a second way to move the treasury. The chosen model is an encrypted copy the user holds.
