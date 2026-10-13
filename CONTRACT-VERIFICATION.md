# Contract verification

Read on 2026-10-13 from Arc mainnet (`eth_chainId` = `0x13b2`, chain 5042) and the Sourcify v2 API (`https://sourcify.dev/server/v2/contract/5042/<address>?fields=all`).

`match` on that API means the submitted source matches the deployed bytecode. A 404 means Sourcify has no verification for that address. Runtime bytecode is hashed with keccak256 of the `eth_getCode` bytes.

| Address | Role | Bytecode | Source status | Evidence |
|---|---|---|---|---|
| `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` | PQTABS RootFactory. No admin. Deploys EIP-1167 clones of PQRoot. | 1,384 bytes. `0x4a2738ca10cbe808811aa8106216f60772c2296702e0305b686b7ec5c73bd1d9` | Sourcify runtime and creation match. `contracts/RootFactory.sol:RootFactory`. solc `0.8.30+commit.73712a01`, optimizer 200, viaIR, evmVersion prague, bytecodeHash none. Verified 2026-10-09. matchId 55800836. | [Sourcify v2](https://sourcify.dev/server/v2/contract/5042/0x05545F026b75f03aE9Cf1eA8a8373473c94ed323) |
| `0xb147Ec122E0b8F91dC4398dD0746372fdC22A894` | PQRoot implementation. Live clones delegate here. Not a proxy. | 7,321 bytes. `0xb8f3031b2b9e96955714c770812b5f042d72f6115de6d75d12cd82108c63257c` | Sourcify runtime and creation match. `contracts/PQRoot.sol:PQRoot`. Same compiler settings. matchId 55800835. | [Sourcify v2](https://sourcify.dev/server/v2/contract/5042/0xb147Ec122E0b8F91dC4398dD0746372fdC22A894) |
| `0x2d0FdFafCC7E46226D3db00Ae976aA8F53996b95` | Live root clone (demo). 45-byte EIP-1167 proxy. Implementation bytes in the code are `0xb147…A894`. | 45 bytes. `0xf90f34c0f04cecfb9d0d2d0b166aef3aa145ce4428c9b0f7aadadfa4de0122b9` | No separate Sourcify record (404). The executing logic is the matched PQRoot implementation above. | [Explorer](https://explorer.arc.io/address/0x2d0FdFafCC7E46226D3db00Ae976aA8F53996b95) |
| `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c` | Barkeep factory. Third-party. `IMPLEMENTATION()` returns the tab implementation. `USDC()` returns Arc USDC. | 2,355 bytes. `0x010f5ef4a9d2fd8c1883d3f4ac4347fc542a10ac80a4e5d182a96aad8062211d` | Not source-verified. Sourcify 404. Source is not in this repository. | [Explorer](https://explorer.arc.io/address/0xccebC58DD1F5937B36D5f9F89f0754424f4D443c) |
| `0x89B63f2E43dea9014750925C01996D34856B01D2` | Barkeep tab implementation. Third-party. The capability clone delegates here. | 3,637 bytes. `0x6bf2995c0c5c8d71ca18a41c079e58bf166aef6c742c76774cd8641ea590aad2` | Not source-verified. Sourcify 404. Source is not in this repository. | [Explorer](https://explorer.arc.io/address/0x89B63f2E43dea9014750925C01996D34856B01D2) |
| `0x74EBd639bBd9A18B28682FD5148D4a0eC041bf9F` | Live capability clone. Code embeds tab implementation `0x89B6…01D2`. | 301 bytes. `0x82c824c57e4ef3708e0c2065867676e7f9d90a732845d39ae1e94408098af984` | No separate Sourcify record (404). Behavior depends on the unverified tab implementation. | [Explorer](https://explorer.arc.io/address/0x74EBd639bBd9A18B28682FD5148D4a0eC041bf9F) |
| `0x3600000000000000000000000000000000000000` | Arc USDC ERC-20 interface. System contract, not a PQTABS deployment. | 1,798 bytes. `0xc9987bd3af6b26a030951faa7eacc017b68343aeedf3ce5fe68f821c4b93939d` | Not on Sourcify (404). Identity is the Arc system USDC address from the Arc docs. | [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses) |
| `0x1800000000000000000000000000000000000004` | SLH-DSA precompile. Not a deployed Solidity contract. | 1 byte. `0x309b8896ee4c1ff7ec1966155373dee42663b6b40c3fedc70ba501684848d2a3` | Not a Sourcify contract (404). Specified by Arc as the PQ verification precompile. | [Post-quantum security](https://docs.arc.io/arc/concepts/post-quantum-security) |
| `0x8E357432CC12ff425c36432F312968aEb16112AF` | Address cited elsewhere as a Galaxy Morpho USDC vault. Not used by PQTABS. | 21,808 bytes. `0xac3d89c4bed30ede74f4e94e9c0e124a13ed24d0e011181515996362879bae57` | Sourcify 404. Not integrated. | Not a PQTABS dependency |

PQRootNext and RootFactoryNext are in this repository and are not deployed. They are not in this table.

What PQTABS enforces, and what it inherits:

- PQTABS, in the matched PQRoot source: SLH-DSA authorization, nonce, deadline, exposure ceiling, open and close accounting, permissionless reclaim after expiry, and the factory pin to the Barkeep addresses above.
- Barkeep, in unverified bytecode: the capability's agent, payee list, per-call maximum, expiry, and the signature check on a spend. PQTABS tests that path with a mock, not with this bytecode. The live PQRoot does not read `agent()`, `payees()`, or `maxPerCall()` back after `openTab`. PQRootNext does, and it is not deployed.
