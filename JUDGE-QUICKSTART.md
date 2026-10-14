# Judge quickstart

Three checks. No wallet. No spend. About three minutes.

## 1. A mainnet receipt

```bash
curl -s https://rpc.mainnet.arc.io \
  -H 'content-type: application/json' \
  -H 'user-agent: pqtabs-judge' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x41496d2663c553f4948680b24f9de159026c2e2212514b44ffb60eda237076ae"]}'
```

Expect `"status":"0x1"`. The USDC log (`address` `0x3600000000000000000000000000000000000000`, topic0 `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`) decodes to `0x0168`, which is 360 raw, 0.00036 USDC. Ignore the 18-decimal log from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`.

Explorer: https://explorer.arc.io/tx/0x41496d2663c553f4948680b24f9de159026c2e2212514b44ffb60eda237076ae

The same check on 2026-10-14 uses receipt `0x53fc6e7c43b71cd14f98e70f8fbd182d55b55d3bed471f56ac5d0a00a88e6ebc` (block 25,942,948). Status is success. The USDC transfer is 360 raw from capability `0xaf6b27486B8429D68Bef65674cB420141Fe1aF96` to `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`. That capability was opened by the security key in `0xf1711679b2256b6fe3050fc2f89b01d489f3619d096b4d943b115369f97f250c` and closed in `0x8b6ba50cf54bf13534c168088f1db533327c19606c8ddc86385a0cd771e5312c`. It is closed. The wallet did not sign the open or the close. The relayer broadcast all three.

## 2. The contracts

| What | Address | Check |
|---|---|---|
| RootFactory | `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` | [Sourcify match](https://sourcify.dev/server/v2/contract/5042/0x05545F026b75f03aE9Cf1eA8a8373473c94ed323) |
| PQRoot implementation | `0xb147Ec122E0b8F91dC4398dD0746372fdC22A894` | [Sourcify match](https://sourcify.dev/server/v2/contract/5042/0xb147Ec122E0b8F91dC4398dD0746372fdC22A894) |
| RootFactoryNext | `0x909AF4dFeEcDf8B72eaf918f185Cd89d460b0E63` | [Sourcify match](https://sourcify.dev/server/v2/contract/5042/0x909AF4dFeEcDf8B72eaf918f185Cd89d460b0E63). New roots only. |
| PQRootNext implementation | `0xBc597CDC7c822fC198Da14A134353ad0eCC16758` | [Sourcify match](https://sourcify.dev/server/v2/contract/5042/0xBc597CDC7c822fC198Da14A134353ad0eCC16758). New roots only. |
| Barkeep factory | `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c` | Bytecode present. Source not verified. |
| Barkeep tab implementation | `0x89B63f2E43dea9014750925C01996D34856B01D2` | Bytecode present. Source not verified. |

Roots `0x2d0F…6b95` and `0x4450…9787` are 45-byte clones of the original PQRoot. On 2026-10-14 each of those registrars had one root on the original factory and zero on RootFactoryNext. Delayed recovery and the yield vault apply only to a root created on the next factory. The Galaxy vault `maxDeposit` was still 0, and no deposit was sent.

The full table, hashes, and the trust split are in [CONTRACT-VERIFICATION.md](CONTRACT-VERIFICATION.md).

## 3. The read-only API

```bash
npx -y pqtabs-mcp@0.1.2
```

Call `pqtabs_status`. Expect `backendOk` true, `sdkRpcChainId` 5042, and `onArc` true. Do not set a signer. That configuration does not list a paid tool.

`pqtabs-mcp@0.1.2` accepts only a `pqtabs-barkeep` row in a quote. Production quotes also include an `exact` row, so `pqtabs_check_spend_policy` on that published package stops with a schema error and signs nothing. The SDK in this repository accepts both rows. A direct `POST /v1/x402/decide` for the closed capability above returns `REFUSE` with `capability_inactive` and `balance`. The same quote with amount 361 and payee `0x0000000000000000000000000000000000000001` also returns `wrong_payee` and `max_per_call`. Those calls do not broadcast.

The local signer address is `0x2c0e47e0950e7fE6C62D5F4E70d8C0b51d8B4865`. Its exported backup must not be reused, so no capability was opened for it. The 360-raw payment above was signed by browser agent `0x1b12403A79dE64Ff628D92c05620136AA5CE501d`.
