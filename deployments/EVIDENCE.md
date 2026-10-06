# Evidence

Labels mean what was measured, not what was intended.

## VERIFIED

Arc mainnet chain id is 5042. Measured with `eth_chainId` on `https://rpc.mainnet.arc.io` during phase 2 (`evidence/phase2.json`).

The SLH-DSA-SHA2-128s precompile at `0x1800000000000000000000000000000000000004` accepts selector `0xbf4db8ba`.

Official vector 0 from `circlefin/arc-node` commit `6e764023ee6515fe70573e123ed2db912a7207b4` (`Hello, World!`, 7856-byte signature) returns `true` from `eth_call`. A flipped byte returns `false`. A truncated signature reverts with `Invalid signature length`. Vector 2, marked invalid upstream, returns `false`.

A fresh signature from `slh-dsa` 0.2.0-rc.5, empty context, over 32 zero bytes, returns `true` from the same `eth_call`. Flipping the first byte returns `false`. The public verifying key and the signature hash are in `evidence/phase2.json`. This was not a broadcast. No USDC moved.

`PQRoot.digestFor` matches `pqtabs-sign digest` for all five action kinds. That is a local FFI test, not a mainnet transaction.

## Local gate, not a deployment

`docs/PHASE-5.5.md` records the Slither run, the 4,096-run fuzz, the invariant, the size report, and a deployment simulation. The simulation was not broadcast. Its address is not on Arc.

## Phase 6, VERIFIED

Measured on Arc mainnet, chain id 5042, by `scripts/stage_mainnet.py` on 2026-10-06. The full table is `deployments/mainnet.json`. Explorer links use `https://explorer.arc.io/tx/<hash>`.

`RootFactory` `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` was created in `0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916`, block 24623258, receipt status 1. A later `implementation()` read returned `0xb147Ec122E0b8F91dC4398dD0746372fdC22A894`.

Two registrars created two roots. Root A `0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf` reports registrar `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`. Root B `0x27F441D82d6b364E06eb906889BE8Fc02Df8F762` reports registrar `0xB96Aa3d062eF493FC6E9bFcFe181b4bac7e72f33`.

Each root was funded with 150,000 raw USDC. Each PQ `execute` opened a Barkeep tab with cap 100,000. Tab A `0xE3051e8173fDBEC33B826352CB177a306B9d5109` is owned by root A. After the open, root A held 50,000 and `openExposure` was 100,000. The same accounting held for root B and tab `0xD14d151eD5Eb7dE58A3893c7C69e374E37d1184d`.

Agent spends of 10,000 raw USDC each were `transferWithAuthorization` calls. Both tabs returned ERC-1271 magic `0x1626ba7e` before broadcast. Tab balances went from 100,000 to 90,000. The payee `0xC485B657C140C9677846f3E9ca6a3158e5623044` ended at 20,000. A non-payee broadcast, tx `0x399e5e89c8d6be28efc394a37a074884768e0a8e63a533b53c6eae1904ee35ca`, has receipt status 0. Over-max and cross-agent `isValidSignature` calls returned `0xffffffff`.

A 1-unit PQ transfer on root A, then the same payload on root B, reverted. The eth_call data was `0x8baa579f`, which is `InvalidSignature()`. Receipt `0x7cf1d0d5e5a7e9029f9961478e1d16ec379dd27c87992ebf62e5acaf71ae1a17` status 0. Root B's reclaim still succeeded.

After expiry `1791322070`, reclaim returned 90,000 to each root and `openExposure` read 0. A later `balanceOf` on tab A was 0 and `owner()` was still root A.

Root A rotated its verifying key in `0x184edd6aedb3a58e4db90645e7b110bb387ee4c393a9cd2f65a7965817e5c55c`. The old key's next transfer reverted `0x8baa579f`. The new key moved 1 raw unit. Final balances: root A 139,998, root B 140,000, both tabs 0, payee 20,000.

This factory is the production factory. It has no admin, so deploying another one would split users rather than promote this one. The two roots above are disposable. Their signing keys are not in git.

## Render, VERIFIED

`https://pqtabs.onrender.com/ready` returned chain id 5042, factory `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323`, and `relayer: true` after deploy `dep-db2mr5q6f5ic73d58gag` was live. The root A read from that service matched the rotated verifying key and the final balance 139,998. The deployment receipt read from `GET /v1/tx/0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916` was status success, block 24623258, gas 2,016,614. The service is a free Render plan. It sleeps when idle. Details are in `docs/DEPLOYMENT.md`.

## Hosted relay, VERIFIED

`POST https://pqtabs.onrender.com/v1/relay/execute` submitted a root A transfer of 1 raw unit. The receipt is `0x205114d24dcb3c894aa82a394d3709f26c07ffb3ea6dcb40a465546a091db33d`, status success, block 24627943, gas 439,075. Root A USDC moved from 139,998 to 139,997 and the nonce moved from 4 to 5. The signature was produced locally. The service did not hold the PQ key.

## Not a claim

No third-party audit. Render had not been deployed at the time these receipts were recorded. The Forge mock is not the verifier that accepted the mainnet signatures. The precompile accepted them inside the successful `execute` transactions.
