# User flow

The product is a treasury with a post-quantum root and a bounded spending capability. The dashboard shows that split. It is not the mechanism.

## What a connected wallet sees

1. Connect the wallet. The account is `eth_accounts`, not a stored address.
2. If that wallet has no root, the screen is "Protect your treasury". The next action is a backup download, then a wallet transaction that calls `createRoot`. Success is an Arc receipt with `RootCreated`. That journey has not been driven for a new wallet in this audit.
3. If the wallet has a root, the overview names the treasury, what agents can reach, and what stays in the root.
4. Create an agent by name. The signing key is encrypted in this browser before the row appears. The page says it can pay after a reload, and that another device needs an encrypted backup. There is no private-key field.
5. Create a capability: agent, budget, per-payment limit, recipients, expiry, review, then authorize with the root backup. The signer produces the SLH-DSA signature. The user does not paste it.
6. A payment is an agent signature over a USDC authorization. The tab contract checks the cap, the recipient, and the expiry. A rejected payment does not move funds and is not written as a payment.
7. Close returns the remaining USDC to the root after the root authorizes it. After expiry, reclaim is permissionless and does not need the root key.

## What Chrome showed on the current production site

An earlier production session with wallet `0xBDfC…0034` opened "Protect your treasury". No backup was downloaded and no domain was created. The current production page shows registrar `0xf76e…71a3`, root `0x846f…65Cf`, and `0.139994` USDC, with 0 open capabilities. Agent `0x074D…096B` is encrypted on that origin and still present after a reload. The capability review named the live recipient `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9` and stopped because the security-key backup was not chosen. No transaction was sent.

## What is already proven on Arc for registrar A

Those receipts were recorded before this indexer cutover. They are still the chain evidence:

- Open `0x313b912a0f8eccc4d3f082f344520076541fced85060a7e26f49f09c21e3accd`, tab `0x56377522376b5273a97313992c7970B106cB3837`, agent `0x54113A5C0195821c42CB831d280A73670951166D`.
- Payment `0xfcbbe662e18c9f726381e90067ebd40df0c1d739407dccbf481d6cad8315b2cf`.
- Close `0xf0b5fa82775ce8f49a1b49ba14291fe4186e2c8c379d7f813ee939872dd616f3`.
- After close, root USDC is 139994 raw, open exposure 0, nonce 13.

## What a refresh does

The agent name stays in `localStorage` under the registrar. The signing key stays encrypted in IndexedDB for that registrar. The root signing key does not. A PQ action after reload still needs the `PQTABS1` backup file. Switching accounts forgets the in-memory agent keys and loads only the new registrar's vault.
