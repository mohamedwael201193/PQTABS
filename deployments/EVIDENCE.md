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

## Not measured yet

No `RootFactory` deployment transaction exists. No production or staging root address exists. No USDC transfer receipt exists. Do not treat any address in the source as a deployed PQTABS contract. The Barkeep and USDC addresses are pinned constants; their code was re-read on chain before this implementation session and is recorded in `docs/ARCHITECTURE.md`.
