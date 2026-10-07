# PQTABS

**Post-quantum spending boundaries for autonomous agents.**

PQTABS separates root authority from day-to-day agent spending. A post-quantum
root (SLH-DSA) authorizes bounded spending capabilities — Barkeep tabs — that
carry their own policy: funded cap, per-call limit, approved recipients and
expiry. A compromised agent reaches exactly as far as its capability, and not
one dollar further.

> Give agents spending power. Never give them your treasury.

This repository contains the complete frontend experience: an editorial,
scroll-driven landing page and a production-quality application dashboard,
both served from a single route with an in-place transition between them.

---

## Running the project

```bash
bun install        # install dependencies
bun run dev        # start the dev server on port 3000
bun run lint       # ESLint (Next.js rules)
bun run build      # production build
bun run start      # serve the production build
```

Open `http://localhost:3000` — the landing page is the default view.
**Launch App** (nav, hero, final CTA) transitions into the dashboard.
The sidebar logo / **Back to site** returns to the landing page.

There are no other routes: the site and the app are one client-side
experience on `/`, with the dashboard code-split so the landing loads first.

---

## Architecture

```
src/
  app/
    layout.tsx                 # Space Grotesk + Geist fonts, metadata, sonner toaster
    page.tsx                   # single route → PqtabsRoot
    globals.css                # design tokens (dark premium theme), utilities
  components/
    pqtabs/
      root/PqtabsRoot.tsx      # landing ↔ app switch (AnimatePresence, code-split)
      shared/                  # design-system primitives used by both surfaces
        Reveal, SectionShell, SectionHeading, StatusChip, Logo/PQMark,
        PQSigil, CountUp, Kbd, Hairline, EmptyState
      landing/                 # marketing site (12 sections + nav/footer)
        LandingPage, LandingNav, Hero, ProblemSection, InsightSection,
        HowItWorks, SecuritySection, BlastRadius, WhyArc, WhyBarkeep,
        ProductFlow, TechnicalSection, FinalCta, LandingFooter, HeroVisual
      visuals/                 # original reusable SVG compositions
        CapabilityFlow, AttackBlocked, ArcVerification, TabLifecycle,
        ExposureMeter
      dashboard/               # the product
        DashboardApp (shell + load gate), OverviewView, TabsView, TabDrawer,
        AgentsView, AgentDrawer, ActivityView, SecurityView, SettingsView,
        CreateTabDialog (5-step stepper), CommandMenu (⌘K),
        shared/{StatCard, TabCard, ActivityRow, ViewSkeleton}
  data/
    types.ts                   # THE production data contract (see below)
    seed/account.ts            # deterministic local dataset
    provider.ts                # DataProvider interface + localProvider
    formatters.ts              # usd / relTime / relFuture / pct …
  hooks/
    use-account-data.ts        # provider-backed initial load (loading/error/retry)
  lib/
    store.ts                   # zustand: dataset + actions, dashboard UI state
```

### Landing page narrative

`01` Hero (original architecture visual) → `02` The Problem → `03` The Core
Insight (separate authority from spending) → `04` How PQTABS Works →
`05` Security Model (attack-blocked animation + interactive blast radius) →
`06` Why Arc (post-quantum verification) → `07` Why Barkeep (composition, not
replacement) → `08` Real Product Flow (lifecycle + product preview) →
`09` Technical Credibility (spec sheet) → `10` Final CTA.

### Dashboard

Overview (treasury / allocated / available / tabs, security posture, exposure
meter, capabilities, recent activity, quick actions) · Tabs (active grid,
ready-to-reclaim, history, detail drawer with the can-do / can-never boundary)
· Agents (roster + drawer, rotate/revoke/create) · Activity (filters, search,
inline expansion, grouped ledger) · Security (posture tiles, root authority,
capability bounds, enforcement model, security events) · Settings (profile,
shortcuts, environment, data reset) · ⌘K command menu · 5-step create-capability
flow with plain-language review and a staged authorization sequence.

---

## The data layer (read this before integrating)

The UI **never** touches seed data or a transport directly. Every screen reads
typed interfaces, and every write flows through one provider seam:

```
UI components
   ↓  hooks + zustand selectors
application data interfaces        ← src/data/types.ts
   ↓  DataProvider
localProvider (today)             ← src/data/provider.ts
productionProvider (Arc / Barkeep / backend, tomorrow)
```

### The contract (`src/data/types.ts`)

`UserAccount`, `Agent`, `Recipient`, `TabPolicy`, `Tab`, `ActivityRecord`,
`SecurityState`, `TreasuryTotals`, `AccountSnapshot`, `NewCapabilityInput`,
and the `DataProvider` interface:

```ts
interface DataProvider {
  loadAccount(): Promise<AccountSnapshot>;
  createCapability(input: NewCapabilityInput): Promise<Tab>;
  closeCapability(tabId: string): Promise<void>;
  reclaimCapability(tabId: string): Promise<void>;
  rotateAgentKey(agentId: string): Promise<void>;
}
```

### Future real-data mapping

| Interface field        | Production source                        |
| ---------------------- | ---------------------------------------- |
| `treasuryTotalUsd`     | USDC balance under the root              |
| `Tab.capUsd/balanceUsd`| Barkeep tab state                        |
| `TabPolicy`            | real tab terms (cap, per-call, recipients, expiry) |
| `Agent` / addresses    | real agent accounts                      |
| `ActivityRecord[]`     | chain events + backend events            |
| `SecurityState`        | contract reads (root scheme, rotation)   |
| Capability lifecycle   | root-signed transactions + receipts      |

To integrate: implement `DataProvider` against Arc reads / the PQTABS backend
and swap the import in `src/data/provider.ts` (and the action calls in
`src/lib/store.ts` if events arrive by subscription). No component changes are
required — that is the point of the seam.

### Local dataset guarantees

- **Deterministic** — identical values on every refresh (no randomness).
- **Internally consistent** — every tab balance equals cap minus the sum of
  its completed payments; every payment respects its tab policy.
- **Relative times** — records store hour offsets (`hoursAgo`,
  `expiresInHours`) rendered through `src/data/formatters.ts`, so displays are
  stable across server and client (no hydration drift).

The dataset models the *Atlas Systems* account: treasury **$24,820.47**,
three agents (Research / Settlement / Infrastructure), three active tabs
(**$500 / $2,000 / $750** caps), one expired tab ready to reclaim
(**$41.20**), one closed tab, and a ~24-record activity ledger including
policy-blocked payment attempts that match the security story on the landing
page. `Settings → Data controls → Reset local data` restores this baseline.

---

## Design system

- **Theme** — single deliberate dark canvas (`#08090b`), surfaces `#0e1013`,
  hairline borders `white/7–10%`. No light mode by design: this is a security
  product; the landing page and dashboard share one identity.
- **Accent** — gold `#e2b53e` for authority and money-in-bounds; teal
  `#5eead4` for agent activity; red `#e5484d` strictly for threats/blocked;
  green `#3dd68c` for success; amber `#f5a524` for settling/expiring.
  No blue, no purple, no gradients except the restrained gold text gradient.
- **Typography** — Space Grotesk (display), Geist (body), Geist Mono
  (technical metadata, tabular numbers via `.tabular`).
- **Motion** — framer-motion with a deliberate scale: micro 100–200 ms,
  interaction 200–400 ms, section reveals 400–800 ms, cinematic ≤ 1.4 s.
  Scroll reveals use the shared `<Reveal>`; SVG diagrams draw in with
  `pathLength`; particles are browser-native SMIL. `prefers-reduced-motion`
  is respected everywhere (static endpoints, no transforms).
- **Iconography** — lucide-react for UI icons; hand-drawn SVG glyphs
  (`PQMark`, `PQSigil`) for product concepts. All hero/section artwork is
  original SVG built for PQTABS — treasury vault, PQ root rings, policy
  gates, tab cards, agent nodes, blocked attack paths.

## Accessibility

Semantic landmarks, keyboard-navigable everything (radio group in the create
flow, ⌘K menu, drawers/dialogs via Radix focus management), aria-labels on
icon buttons, `aria-live` for the blast-radius values, `aria-valuetext` on
sliders, 75×64 px bottom-nav touch targets, focus-visible rings, AA contrast
on the dark canvas.

## Performance

Dashboard is code-split (`next/dynamic`) out of the landing bundle; SVGs are
inline React (no image payloads); animations are transform/opacity only with
SMIL particles off the main thread; deterministic data means zero refetch
storms; lists scroll within `max-h` containers with styled thin scrollbars.

---

## Verification performed

- `bun run lint` — clean · `tsc --noEmit` — zero errors in `src/`.
- End-to-end browser pass: landing narrative (all 10 sections), nav anchors,
  mobile sheet, hero visual integrity, blast-radius slider (keyboard + live
  values), Launch App transition, overview data correctness, tab drawer,
  reclaim ($41.20 → treasury, toast), agent drawer, create-capability flow
  (5 steps + staged confirmation → TAB-A7D7 created and listed), ⌘K command
  menu navigation, activity filters/search/empty state/inline expansion,
  security center, settings reset-to-baseline, landing↔app round-trip with a
  clean console, zero hydration mismatches, no horizontal overflow at
  375 / 768 / 1440 px, and no motion warnings.
