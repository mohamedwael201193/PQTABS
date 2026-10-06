# API and signing contract

The backend is a stateless reader and relayer. It does not hold a PQ seed, an agent key, or the deployer key. Chain state is authoritative. There is no database.

Public configuration, also returned by `GET /v1/config`:

| Name | Value |
|---|---|
| Chain id | 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Factory | `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` |
| USDC | `0x3600000000000000000000000000000000000000` |
| Barkeep factory | `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c` |
| Explorer | `https://explorer.arc.io` |

ABIs generated from the compiler are in `abi/PQRoot.json` and `abi/RootFactory.json`.

## Reads

`GET /health` returns `{ "ok": true }`. It does not touch the network.

`GET /ready` returns 200 only when `eth_chainId` is 5042 and the configured factory has bytecode. Otherwise 503.

`GET /v1/registrars/:address/roots` reads `rootCount` and `rootAt`. The registrar is an index. It cannot move funds.

`GET /v1/roots/:address` reads `pqVk`, `registrar`, `nextNonce`, `maxOpenExposure`, `openExposure`, and the USDC balance. Unknown addresses return `unknown_root`.

`GET /v1/roots/:root/tabs/:tab` reads the root's `tabs` record plus the tab's `owner`, `agent`, `maxPerCall`, `expiry`, and USDC balance.

`GET /v1/tx/:hash` returns the receipt status, block, and gas used.

## Relay

Every relay simulates with `eth_estimateGas` before `eth_sendRawTransaction`. A failed simulation is not broadcast. `maxFeePerGas` is `max(eth_gasPrice, 20 gwei)`.

The relayer key is the only key the process may hold. It pays gas. It is not an authority.

`POST /v1/relay/execute`

```json
{ "root": "0x…", "action": "0x…", "nonce": "0", "deadline": "1893456000", "signature": "0x…" }
```

The signature must be 7856 bytes. The calldata is only `PQRoot.execute`. The nonce must equal `nextNonce`. A smaller nonce returns `nonce_consumed` and is not broadcast.

`POST /v1/relay/reclaim` and `POST /v1/relay/retry-sweep` take `{ "root", "tab" }` and call those two functions. They do not accept arbitrary calldata.

`POST /v1/relay/spend`

```json
{
  "tab": "0x…",
  "to": "0x…",
  "value": "10000",
  "validAfter": "0",
  "validBefore": "1893456000",
  "nonce": "0x…32 bytes…",
  "signature": "0x…213 bytes…"
}
```

This calls USDC `transferWithAuthorization` with `from` set to the tab. The tab's `owner()` must be a root of this factory. The 213-byte blob is the Barkeep ERC-1271 signature, not a raw 65-byte ECDSA signature. A tab that refuses the blob makes the simulation fail, so the backend does not broadcast it.

## Signing payload

The PQ digest is `keccak256(abi.encode(DOMAIN, chainid, root, nonce, deadline, keccak256(action)))` with `DOMAIN = keccak256("PQTABS_V2")`. The signer signs those 32 raw bytes with SLH-DSA-SHA2-128s and an empty context. `pqtabs-sign digest` produces the same bytes as `PQRoot.digestFor`.

Action encodings are Solidity `abi.encode` of:

| Kind | Fields |
|---|---|
| 1 OPEN_TAB | `uint8`, `address agent`, `address[] payees`, `uint256 maxPerCall`, `uint64 expiry`, `uint256 cap` |
| 2 CLOSE_TAB | `uint8`, `address tab` |
| 3 TRANSFER | `uint8`, `address to`, `uint256 amount` |
| 4 ROTATE_KEY | `uint8`, `bytes32 newVk` |
| 5 SET_EXPOSURE | `uint8`, `uint256 newMax` |

The deadline must satisfy `block.timestamp <= deadline <= block.timestamp + 7 days`.

Agent spend uses the USDC EIP-712 domain `USDC`, version `2`, chain 5042, verifying contract the USDC address. The type is `TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)`. `from` is the tab. `validBefore` must be less than or equal to the tab expiry, and `value` must be less than or equal to `maxPerCall`.

## Errors

| HTTP | code | Meaning |
|---|---|---|
| 400 | `bad_signature_length` | PQ signature is not 7856 bytes, or the spend blob is not 213 |
| 400 | `unknown_root` | The address is not a root created by this factory |
| 400 | `simulation_failed` | The node rejected the exact call. Nothing was broadcast |
| 409 | `nonce_consumed` / `bad_nonce` | The nonce does not match the root |
| 413 | `payload_too_large` | Body above 64 KiB |
| 429 | `rate_limited` | More than 60 reads or 8 relays from one address in a minute |
| 503 | `relayer_unconfigured` | The process has no relayer key, so it can still read |

## Environment

The server reads `PORT`, `ARC_RPC_URL`, `FACTORY_ADDRESS`, and `RELAYER_PRIVATE_KEY`. The first three may be public. The relayer key must be injected by the host and must not be the deployer key or a user key. Rate-limit counters live in memory and reset when a free-tier host sleeps.
