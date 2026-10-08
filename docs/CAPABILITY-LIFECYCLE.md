# Capability lifecycle

A capability is a Barkeep tab owned by one PQ root. Opening it is a root `execute` of kind open: agent, payees, `maxPerCall`, expiry, and cap. The cap is reserved in `openExposure` before the tab is opened. Close and reclaim release that cap. After expiry, reclaim does not need the root key.

The UI asks for agent, budget, per-payment limit, recipients, and expiry, then the root backup signs. It does not ask for a private key or a pasted signature. After the backup unlocks, its verifying key is compared with the treasury key. A different key, or a missing treasury key, is refused and nothing is signed.

Chain terms are read from the tab and the root. The portfolio response shows stored rows and a freshness label. A stored balance is not presented as a live balance when `balanceKnown` is false.

Not proven in this audit: a new mainnet open, a comparison of that tab's on-chain terms with the screen, or `openExposure` equal to the sum of open caps on a freshly opened tab. Older receipts for root `0x846f…65Cf` are in HISTORY. That root currently has no open capability. On the production page the review for agent `0x074D…096B` reached the security-key backup and did not submit. The live recipient on that review was `0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9`.
