# Judge quickstart

Three checks. No wallet. No spend. About three minutes.

## 1. A mainnet receipt

```bash
curl -s https://rpc.mainnet.arc.io \
  -H 'content-type: application/json' \
  -H 'user-agent: pqtabs-judge' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x41496d2663c553f4948680b24f9de159026c2e2212514b44ffb60eda237076ae"]}'
```

Expect `"status":"0x1"`. The USDC log (`address` `0x3600000000000000000000000000000000000000`, topic0 `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`) has `data` `0x0168`, which is 360 raw, 0.00036 USDC. Ignore the 18-decimal log from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`.

Explorer: https://explorer.arc.io/tx/0x41496d2663c553f4948680b24f9de159026c2e2212514b44ffb60eda237076ae

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
