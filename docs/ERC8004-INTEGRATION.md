# ERC-8004

Checked 2026-10-08.

Circle's contract address page lists three Arc mainnet registries:

- Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- Validation `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`

`eth_getCode` on each address returned 130 bytes. That is not empty code. It is not a decoded registry call, and it is not a test that `getAgentWallet` matches a PQTABS agent.

PQTABS does not call these registries. An `agentId` does not set the tab owner, the payee list, `maxPerCall`, the expiry, or the root exposure. Those are the Barkeep tab and the PQ root. Using the registry as a badge would not change what the agent can spend.

It stays out of v1. A later version can snapshot `agentId` and wallet at capability creation only if a mismatch test refuses payment when the wallet changes. That test does not exist, and no registry call is pretended.
