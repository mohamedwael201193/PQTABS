# PQTABS Build Worklog

Shared worklog for all agents building PQTABS. Read before working. Append after finishing.

---

Task ID: 1
Agent: lead (Z.ai Code)
Task: Foundation — design system, data layer, shared primitives, root shell, hero visual, contracts for parallel agents

Work Log: (in progress — this section updated at end of Task 1)

Stage Summary: (pending)

==================================================
ARCHITECTURE CONTRACTS (ALL AGENTS MUST FOLLOW)
==================================================

## Product
PQTABS — a security boundary for money that autonomous agents are allowed to spend.
Post-quantum root (SLH-DSA) → bounded spending capability (tab) → agent → limited USDC spending.
Everything renders on the SINGLE route `/` (src/app/page.tsx). Landing view ↔ App view switch
happens client-side inside `PqtabsRoot` (no other routes exist). NEVER create new route files.

## Design language (MANDATORY — one coherent identity)
- Dark-only premium canvas. Background `#08090b`, surfaces `#0e1013`/`#14171a`, hairline borders `rgba(255,255,255,.07-.10)`.
- PRIMARY ACCENT: gold `#e2b53e` (Tailwind class `text-gold`, `bg-gold` etc. — custom tokens exist).
  Semantic: success `#3dd68c` (`text-success`), danger `#e5484d` (`text-danger`), teal `#5eead4` (`text-teal`), warning `#f5a524` (`text-warning`).
- NO blue, NO indigo, NO purple, NO generic crypto gradients/neon. Restrained glows only.
- Typography: display font = Space Grotesk (`font-display` class), body = Geist (default sans), technical metadata/numbers = Geist Mono (`font-mono`).
  Use `.tabular` utility for tabular numbers in financial data. Oversized editorial headings: `font-display font-semibold tracking-tight`.
- Motion: framer-motion. micro 100–200ms, interaction 200–400ms, section reveals 400–800ms, cinematic ≤1.4s.
  Scroll reveals via the shared `<Reveal>` component. Respect reduced motion (Reveal handles it; keep own animations subtle).
- Status chips: use shared `<StatusChip status={...}/>`. Dots + mono uppercase labels.
- Buttons: shadcn `Button`. Primary CTA on dark: `bg-gold text-[#171204] hover:bg-[#eec95e]`.
  Ghost/secondary: `border-white/10 bg-white/[.03] hover:bg-white/[.06] text-foreground`.
- Cards: `rounded-xl border border-white/[.07] bg-[#0e1013]` family. p-4/p-6 content, gap-4/gap-6. NO glassmorphism spam.
- Section rhythm on landing: generous vertical padding (`py-28 md:py-40`), mono section markers like `01 / HERO`, hairline separators `border-white/[.06]`.
- All numbers in UI: `.tabular` + font-mono where technical.

## Shared primitives (already built — IMPORT, don't rebuild)
From `@/components/pqtabs/shared`:
- `Reveal` — { children, delay?, y?, once?, className? } scroll reveal (fade+rise).
- `SectionShell` — { id?, index, label, children, className? } — landing section wrapper with mono index/label header + hairline.
- `SectionHeading` — { overline?, title: ReactNode, lead?: ReactNode, align?: 'left'|'center', className? }.
- `StatusChip` — { status, className? } for all statuses (ActivityStatus | TabStatus | AgentStatus).
- `Logo` — { withWordmark?, className? } original PQTABS mark + wordmark.
- `PQSigil` — { size?, className? } the root sigil glyph (reusable in SVGs).
- `Kbd` — key cap for ⌘K hints.
- `EmptyState` — { icon?, title, body, action? } dashboard empty states.
- `Hairline` — { className? } vertical/horizontal hairline.
- `CountUp` — { value, format?, duration?, className? } animated number.

## Data layer (MANDATORY — UI never touches raw data files)
- `@/data/types` — all interfaces: UserAccount, Agent, Recipient, TabPolicy, Tab, ActivityRecord, SecurityState, AccountSnapshot, NewCapabilityInput, plus status unions.
- `@/data/seed/account` — deterministic seed dataset (built by `buildSeedDataset()`). Times are RELATIVE OFFSETS in hours (hoursAgo / expiresInHours) — display via formatters, never wall-clock. Deterministic across refreshes.
- `@/data/formatters` — `usd(n)`, `usdCompact(n)`, `relTime(hoursAgo)`, `relFuture(hours)`, `pct(n)`, `shortAddr(a)`, `hoursLabel`.
- `@/lib/store` — zustand stores:
  - `usePqtabsData` — the live dataset + actions (createCapability, closeCapability, reclaimCapability, rotateAgentKey). Selectors: `useAccountSnapshot()`, `useTabs()`, `useAgents()`, `useActivity()`, `useSecurity()`, `useRecipients()`, plus derived selectors `selectTotals`.
  - `useDashboardUi` — { activeView, drawer, createOpen, commandOpen, ... actions }.
    `DashboardView = 'overview' | 'tabs' | 'agents' | 'activity' | 'security' | 'settings'`.
    `drawer: { type: 'tab' | 'agent' | 'activity'; id: string } | null`.
- `@/data/provider` — `DataProvider` interface + `localProvider` (store-backed, ~450ms simulated latency for initial load) — THE swap point for the future Arc/production provider. Use `useAccountData()` hook (in `@/hooks/use-account-data`) for initial load + loading states.

## File ownership (DO NOT write outside your lanes)
- Task 2-a (landing top): `src/components/pqtabs/landing/{LandingPage,LandingNav,Hero,ProblemSection,InsightSection,HowItWorks}.tsx` + `src/components/pqtabs/visuals/CapabilityFlow.tsx`
- Task 2-b (landing bottom): `src/components/pqtabs/landing/{SecuritySection,BlastRadius,WhyArc,WhyBarkeep,ProductFlow,TechnicalSection,FinalCta,LandingFooter}.tsx` + `src/components/pqtabs/visuals/{AttackBlocked,ArcVerification,TabLifecycle}.tsx`
- Task 3-a (dashboard core): `src/components/pqtabs/dashboard/{DashboardApp,OverviewView,TabsView,TabDrawer,AgentsView,AgentDrawer}.tsx` + `dashboard/shared/{StatCard,TabCard,ActivityRow,ViewSkeleton}.tsx` + `src/components/pqtabs/visuals/ExposureMeter.tsx`
- Task 3-b (dashboard flows): `src/components/pqtabs/dashboard/{CreateTabDialog,ActivityView,SecurityView,SettingsView,CommandMenu}.tsx`
- Shared components may be EDITED only by lead (report needed changes in your worklog entry instead).

## Component contracts (exact exports — siblings import these)
- `LandingPage` — default export, props `{ onLaunchApp: () => void }`. Composes (in order):
  LandingNav(onLaunchApp), Hero(onLaunchApp), ProblemSection, InsightSection, HowItWorks,
  SecuritySection, WhyArc, WhyBarkeep, ProductFlow(onLaunchApp), TechnicalSection, FinalCta(onLaunchApp), LandingFooter.
  Section order/ids: hero#top, problem#problem, insight#insight, how#how (nav anchor "How it Works"), security#security (nav "Security"),
  arc#technology (nav "Technology"), barkeep, product#product (nav "Product"), technical, cta.
  NOTE nav order is Product/Security/How it Works/Technology — anchors: #product, #security, #how, #technology.
- `LandingNav` — default export, props `{ onLaunchApp }`. Fixed top, blur bg, hairline bottom border, links to anchors, gold "Launch App" button, mobile sheet menu.
- `Hero` — default export, props `{ onLaunchApp }`. Uses shared `HeroVisual` (lead-built, `@/components/pqtabs/landing/HeroVisual`).
- `ProblemSection`,`InsightSection`,`HowItWorks`,`SecuritySection`,`WhyArc`,`WhyBarkeep`,`TechnicalSection`,`LandingFooter` — default exports, no props.
- `BlastRadius` — default export, no props (interactive slider section inside SecuritySection or standalone).
- `ProductFlow` — default export, props `{ onLaunchApp }`.
- `FinalCta` — default export, props `{ onLaunchApp }`.
- Visuals `CapabilityFlow`,`AttackBlocked`,`ArcVerification`,`TabLifecycle`,`ExposureMeter` — default exports, props `{ className? }` (self-contained responsive SVG compositions; ExposureMeter may take `{ totals }`).
- `DashboardApp` — default export, props `{ onExit: () => void }` (onExit returns to landing). Hosts sidebar/mobile-nav, views, drawers, CreateTabDialog, CommandMenu. Views switched via `useDashboardUi` store.
- `OverviewView`,`TabsView`,`AgentsView`,`ActivityView`,`SecurityView`,`SettingsView` — default exports, no props (read store directly).
- `TabDrawer`,`AgentDrawer` — default exports, no props (read `useDashboardUi().drawer`).
- `CreateTabDialog` — default export, no props (reads `createOpen` from ui store).
- `CommandMenu` — default export, no props (reads `commandOpen`; ⌘K handled inside; actions navigate via `useDashboardUi`).
- `StatCard` — named export, props `{ label, value, sub?, icon?, accent? }`.
- `TabCard` — named export, props `{ tab: Tab, onOpen?: (id) => void }`.
- `ActivityRow` — named export, props `{ record: ActivityRecord, onOpen?: (id) => void }`.
- `ViewSkeleton` — named export, props `{ variant: 'overview' | 'tabs' | 'agents' | 'activity' | 'security' }`.

## Non-negotiables
- NEVER use words: mock, mocked, demo, dummy, fake — in filenames, component names, UI copy, comments (say: local data, seed data, preview, application state).
- NEVER claim "confirmed on Arc", never show tx hashes, block numbers, or fake contract addresses. Agent/tab addresses are application-level identifiers (format `agt_…` / `tab_…` / `rcp_…`).
- Landing must never overflow horizontally; test at 375px.
- Footer (LandingFooter): sticky bottom NOT required on landing (it's a long scroll page, footer at end is fine). Dashboard: full-height layout, no floating gaps.
- 'use client' everywhere interactive. TypeScript strict, no `any` in exported signatures.
- Import shadcn UI from `@/components/ui/*`. Icons: lucide-react. No new dependencies.
- Numbers: `usd()` formatter from `@/data/formatters`.
- A subtle "Preview data" honesty badge lives ONLY in SettingsView (Task 3-b). Don't scatter it elsewhere.

---
Task ID: 1
Agent: lead (Z.ai Code)
Task: Foundation — design system, data layer, shared primitives, root shell, hero visual, contracts

Work Log:
- Read the full PQTABS brief (2131 lines) and extracted every requirement.
- Defined architecture: single route `/`, landing ↔ app switching inside PqtabsRoot (dashboard code-split via next/dynamic).
- Wrote globals.css: dark-only premium tokens, gold accent (#e2b53e), semantic colors, grain/grid-fade/scrollbar/focus utilities, reduced-motion support.
- layout.tsx: Space Grotesk (display) + Geist + Geist Mono, PQTABS metadata, Sonner toaster (dark, bottom-right).
- Data layer: src/data/types.ts (full production contract), src/data/seed/account.ts (deterministic Atlas Systems dataset — balances exactly match activity sums), src/data/formatters.ts, src/data/provider.ts (localProvider, ~500ms latency), src/hooks/use-account-data.ts.
- Store: src/lib/store.ts — usePqtabsData (dataset + createCapability/closeCapability/reclaimCapability/rotateAgentKey/rotateRootKey/resetToSeed) and useDashboardUi (view/drawer/createOpen+createPresetAgentId/commandOpen).
- Shared primitives in src/components/pqtabs/shared/: Reveal, SectionShell+SectionHeading, StatusChip, Logo/PQMark, PQSigil, CountUp, Kbd, Hairline, EmptyState (index.ts re-exports).
- Built HeroVisual (src/components/pqtabs/landing/HeroVisual.tsx): original SVG composition — treasury → PQ root (breathing rings, rotating PQ boundary, arc label) → policy gates → 3 tab cards with real balances → agent nodes; SMIL particles on authorized paths, blocked red attack path with keyPoints stop; pointer parallax; draw-in entrances.
- Root shell (PqtabsRoot) + page.tsx wired.

Stage Summary:
- Foundation complete; only missing-sibling import errors remain (expected until Tasks 2a/2b/3a/3b deliver).
- CONTRACT UPDATES (supersede earlier notes):
  1. Toasts: use `sonner` — `import { toast } from "sonner"` (mounted dark/bottom-right). Do NOT use use-toast.
  2. DrawerTarget is only `{type:'tab'|'agent', id}` — NO activity drawer. Activity rows expand inline (ActivityView) or navigate to the activity view (Overview).
  3. ui store: `setCreateOpen(open, presetAgentId?)`; AgentDrawer "Create capability" uses `setCreateOpen(true, agentId)`.
  4. Data store also has `rotateRootKey()` and `resetToSeed()`.
  5. ExposureMeter lives in src/components/pqtabs/visuals/ExposureMeter.tsx — usable by Overview (3-a) and SecurityView (3-b). Props `{ totals: TreasuryTotals, className? }`.
  6. All seeds: treasury $24,820.47; agents Research/Settlement/Infrastructure; tabs TAB-9F42 ($500/$312.40), TAB-7A15 ($2,000/$1,180), TAB-2C88 ($750/$509.50), TAB-51D0 expired reclaimable $41.20, TAB-38E7 closed.

---
Task ID: 3-a
Agent: full-stack-developer
Task: Dashboard core (shell, overview, tabs + drawer, agents + drawer, ExposureMeter)
Work Log:
- Built the full dashboard core on the lead's data layer + design tokens, following every contract in this worklog (dark canvas, gold accents, mono micro-labels, tabular numerals, no banned vocabulary, no fabricated onchain claims).
- DashboardApp shell: single `useAccountData()` load gate — skeleton shell (sidebar + ViewSkeleton of activeView) while booting, EmptyState + retry on error, then the live shell. Desktop: fixed 248px sidebar (logo → onExit with tooltip, gold "New capability", nav with gold active indicator, treasury mini-card from useTotals, user chip "Atlas Systems / PQ Root · SLH-DSA", settings gear, back-to-site). Mobile: top bar (logo, view title, ⌘ command, settings gear, gold plus) + fixed bottom nav with safe-area padding and dot indicator. Views cross-fade via AnimatePresence mode="wait" (250ms, y:12, reduced-motion aware); scrolls to top on view change. Overlays (TabDrawer, AgentDrawer, CreateTabDialog, CommandMenu) mount once at shell level.
- Shared primitives: StatCard (Reveal entrance, delay stagger, accent tints icon + value), TabCard (whole card is one accessible <button> — no nested interactives; balance, spent-vs-cap bar, 2×2 bounding numbers, "Manage" affordance), ActivityRow (kind→icon map, danger text for policy_blocked/reverted, mobile two-line layout, optional whole-row button), ViewSkeleton (5 layout-stable variants).
- ExposureMeter: original segmented horizontal composition (available / allocated / reclaimable) with inView tween 700ms, 25% tick marks, in-segment percent labels when wide enough, mono legend; graceful at zero treasury; used by Overview and (via 3-b) SecurityView.
- OverviewView: 4 stat cards (CountUp for money, gold treasury / teal tab count), clickable security status strip (gap-px hairline grid), exposure card, active capabilities sorted by soonest expiry, recent activity (6 rows → activity view), quick actions.
- TabsView: "Ready to reclaim" warning-tinted list with real localProvider.reclaimCapability + per-row pending + toasts; active TabCard grid; closed/expired history (max-h-72, scrollbar-thin).
- TabDrawer: 480px right Sheet — reference header, agent row + copy, balance vs cap, 2×2 policy grid, allowed recipients (ScrollArea with category chips + copy), spend history (payments + blocks), can-do/can-never boundary card, sticky footer with AlertDialog-confirmed close (danger ghost), gold reclaim for expired-with-balance, rotate credentials, copy reference. Frozen-content ref keeps the sheet intact during exit animations; auto-closes if the tab disappears.
- AgentsView: whole-row buttons (initials chip, role, address, status, active capability count, authorized sum, last-active) → drawer.
- AgentDrawer: address + copy, role + enrollment timeline, capability summary rows that swap the drawer to the tab view, authorized/exposure totals, 5 recent ledger lines, Collapsible security details (incl. last credential rotation from the ledger), footer: gold "Create capability" (preselects agent via setCreateOpen(true, agentId)), rotate credentials, AlertDialog-confirmed revoke that closes all the agent's active capabilities through store actions then toasts "Agent revoked".
- Verification: `bunx tsc --noEmit` → zero errors in dashboard/** and visuals/ExposureMeter; `bun run lint` → zero findings in my files. Remaining project blockers are other lanes (2-a LandingPage missing; lint errors live in 3-b's CreateTabDialog and lead's CountUp/use-account-data).
Stage Summary:
- Files created (11): dashboard/{DashboardApp,OverviewView,TabsView,TabDrawer,AgentsView,AgentDrawer}.tsx, dashboard/shared/{StatCard,TabCard,ActivityRow,ViewSkeleton}.tsx, visuals/ExposureMeter.tsx.
- Exports match contract exactly (views/drawers/dialog default no-props; shared primitives named; ExposureMeter default + named, props `{ totals, className? }`).
- Task 4 integrator notes: (1) `ViewSkeleton` has no `settings` variant — DashboardApp maps settings→security during boot; (2) drawer freeze-ref pattern keeps Sheet content during exit animation; (3) revoke-agent closes capabilities via `usePqtabsData.getState().closeCapability` per tab — agent `status` field itself is unchanged (no such store action); (4) all money mutations flow through `localProvider` with pending spinners + sonner toasts; (5) 3-b's files (ActivityView/SecurityView/SettingsView/CreateTabDialog/CommandMenu) landed mid-task and resolve cleanly against this shell.

---
Task ID: 2-b
Agent: frontend-styling-expert
Task: Landing bottom half (security, blast radius, why arc, why barkeep, product flow, technical, final CTA, footer)
Work Log:
- Built the bottom half of the landing page as 11 files: 8 section components + 3 original SVG visual compositions, all matching the lead's design language (gold #e2b53e accents, hairlines, mono labels, draw-ins, reduced-motion support, 'use client', strict TS).
- AttackBlocked (visuals/): staged security war-game in SVG (viewBox 960×460). Compromised red agent fires 5 labeled attack vectors (ROOT ISOLATED / CAP LOCKED / RECIPIENTS FIXED / NO ROOT KEY / EXPIRED) at the vertical policy wall with gold gate diamonds; each path draws sequentially (320ms stagger), × pops on impact. Then one gold payment particle (SMIL animateMotion with keyPoints hold + opacity fade, started via beginElement() on scroll-in) flows through the gate to "$47.00 → VERCEL EDGE" with a success check timed to its arrival. Reduced motion renders the final static state. Hero-style legend + title for a11y.
- BlastRadius (landing/): interactive model inside a card — fixed $100,000 treasury (font-display tabular), policy chips (Users/Clock icons), shadcn Slider $100–$5,000 step $50 with aria-label, derived per-call limit (10% of cap), h-16 treasury bar with hatch pattern + animated gold reachable segment (framer tween 300ms, min-width 4px), gold "Maximum reachable" vs green "Protected" 4xl tabular stats, sr-only aria-live="polite" announcements, closing mono thesis line.
- SecuritySection: SectionShell id="security" index="05"; SectionHeading "Assume the agent is compromised." + AttackBlocked + BlastRadius.
- ArcVerification (visuals/): 5-stage chain (PQ sigil w/ rotating dashed ring → SLH-DSA signature document w/ squiggle → Arc hexagon w/ drawn gold check + 12 verification ticks + rotating ring → $500 capability card → teal agent), draw-in connectors with arrowheads, one looping gold particle (SMIL, beginElement on in-view), staged index/name/annotation mono labels.
- WhyArc: SectionShell id="technology" index="06" + ArcVerification + 3 fact tiles (hairline top accent, gold kicker, hover border-gold/25). Copy sticks to the brief — no invented claims.
- WhyBarkeep: inline layers SVG — three front-view planes with skewed top faces (PQTABS gold-bordered / BARKEEP / USDC muted), staggered slide-in + whileHover depth, agent node plugging into the middle layer only (teal dashed connector), red dashed climb rejected at the root layer ("AGENTS NEVER TOUCH THE ROOT"), two attributed statements in a md:grid-cols-2 with hairline divider, centered closer with foreground emphasis.
- TabLifecycle (visuals/): horizontal loop SVG — treasury glyph → 5 stage nodes (plus / $ / gate diamond / clock / return arrow) with solid drawn connectors + arrowheads, dashed gold return path to treasury, "FUNDS RETURN · NOTHING LINGERS" annotation, one gold particle cycling the full loop (SMIL, fade at the seam).
- ProductFlow: SectionShell id="product" index="08" + TabLifecycle + "THE INTERFACE" label + 3 mini dashboard preview cards (agent selection with radio states + agt_… ids, $500 bounds with tiny progress bars, plain-language review quote with gold border and a real "Create capability" button wired to onLaunchApp) + final CTA row (gold "Launch App" → onLaunchApp, ghost anchor → #security).
- TechnicalSection: spec-sheet dl (6 rows: mono gold key md:col-span-2 / display title / precise body, divide-y hairlines) + the three-layer truth (3 full-width rows, mono index, display xl/3xl statement, right-aligned mono annotation; the "WHAT GUARANTEES IT" row turns gold).
- FinalCta: SectionShell index="10", centered cinematic close — breathing PQSigil (88px, gold/45) with blurred gold halo, radial glow + grid-fade (no rectangle edges), 4xl/6xl two-line headline with gold-gradient second line, h-12 gold "Launch App" + ghost "Read the architecture" (#technology).
- LandingFooter: editorial end — Logo + tagline row, 3 columns (Product anchor links #top/#how/#security/#technology; Stack items as non-link mono lines with a "the stack PQTABS composes" note; Protocol notes), hairline bottom row with © 2025 PQTABS and mono tagline. Stacks on mobile.
- All copy uses typographic apostrophes/quotes; never mock/demo/dummy/fake; no external links; lucide icons only at 12–16px; tabular numbers throughout; verified tsc (only expected missing-LandingPage error from PqtabsRoot, Task 2-a's file) and eslint (zero issues in my files — the 4 remaining errors are in lead/3-b files: CountUp, use-account-data, CreateTabDialog).
Stage Summary:
- Files created (all default exports):
  - landing/SecuritySection.tsx (no props)
  - landing/BlastRadius.tsx (no props, interactive)
  - landing/WhyArc.tsx (no props)
  - landing/WhyBarkeep.tsx (no props)
  - landing/ProductFlow.tsx (props { onLaunchApp: () => void })
  - landing/TechnicalSection.tsx (no props)
  - landing/FinalCta.tsx (props { onLaunchApp: () => void })
  - landing/LandingFooter.tsx (no props)
  - visuals/AttackBlocked.tsx (props { className? })
  - visuals/ArcVerification.tsx (props { className? })
  - visuals/TabLifecycle.tsx (props { className? })
- For Task 4 integrator: LandingPage should render in order LandingNav, Hero, ProblemSection, InsightSection, HowItWorks, SecuritySection, WhyArc, WhyBarkeep, ProductFlow(onLaunchApp), TechnicalSection, FinalCta(onLaunchApp), LandingFooter. Section ids already set: security#security, arc#technology, product#product. Anchors used by my buttons/footer: #top, #how, #security, #technology (all defined by 2-a's hero/how sections + my ids). Card 3 "Create capability" in ProductFlow intentionally calls onLaunchApp. SMIL particles use unique ids (ab-pay, arc-flow, lc-loop) with begin="indefinite" + beginElement() — no document-load timing races. All SVGs scale with w-full (no 375px overflow). Dev server 500 on / is solely the missing LandingPage module from Task 2-a.

---
Task ID: 3-b
Agent: full-stack-developer
Task: Dashboard flows (create tab stepper, activity, security center, settings, command menu)
Work Log:
- Read worklog contracts, all foundation files (types, seed, formatters, provider, store, hooks, shared primitives, shadcn components) and 3-a's delivered siblings before coding.
- CreateTabDialog: 5-step stepper (agent → budget → rules → expiry → review) in a premium Radix Dialog (#0e1013, max-w-lg). Step-specific question titles + subs; 5-segment gold stepper with mono AGENT/BUDGET/RULES/EXPIRY/REVIEW labels (mobile shows current only).
  - Step 1: true radiogroup semantics (role=radio, aria-checked, Arrow/Home/End navigation + focus management, roving tabIndex), agent cards with initials chip/role/address, revoked agents filtered, preset agent preselected from createPresetAgentId.
  - Step 2: borderless $-prefixed display-font currency input synced with $50–$5000 step-50 slider; per-payment question + slider (min $1, max = round(cap*0.25), step 1); validations: cap ≥ $50, cap ≤ useTotals().availableUsd with the exact "Only {usd(available)} is available in your treasury." error (aria-live); live mono summary line. per-call is render-clamped (effectivePerCall) so typing a cap never silently destroys the per-call value; clamped value persisted on Next.
  - Step 3: recipients grouped by category with mono headers, checkbox toggle rows (border-gold/40 when approved), "{n} approved recipients" counter, "Payments outside this list are rejected automatically."
  - Step 4: preset chips (12h/24h/3d/7d) + custom hours input (1–720), expiry explainer card, gold "Expires {relFuture(hours)}" chip.
  - Step 5: gold-bordered human sentence ("This gives X access to…"), mono recap grid (AGENT/TOTAL CAP/PER PAYMENT/RECIPIENTS/EXPIRY), recipient name list, required acknowledgment checkbox gating Create.
  - Confirm sequence: staged list (Preparing → Awaiting root authorization (lock) → Opening → Capability active) advancing ~600ms each while localProvider.createCapability's ~500ms latency overlaps; success view has framer-motion gold check (spring, reduced-motion aware), reference chip, summary, "View in Tabs"/"Done". Error panel with retry. Mid-sequence the dialog is close-locked (Esc/overlay/X guarded).
  - Discard confirmation AlertDialog when abandoning step > 1 ("Discard this capability?" / "Your inputs will be lost.").
  - KEY ARCHITECTURE: default export is a thin shell; all flow state lives in inner <CreateFlow /> mounted only while the dialog is open — Radix unmounts closed dialogs, so state resets by remount (no reset effects, lint-clean under react-hooks/set-state-in-effect). Success is DERIVED (phase==="confirming" && stage===3 && createdTab) rather than effect-set.
  - a11y: Enter advances from free-text inputs when valid; dollar aria-valuetext + aria-label synced onto the Radix slider THUMB via a small DOM effect (Radix only special-cases aria-label on Root, not valuetext).
- ActivityView: header + event-count chip; sticky filter bar (bg-[#0e1013]/95 blur, top-16 on mobile to clear 3-a's sticky top bar, md:top-2) with agent/status/type Selects + search input; active-filter count chip + Clear. Records grouped TODAY/YESTERDAY/EARLIER by hoursAgo; rows use 3-a's ActivityRow (display mode — no onOpen) inside my own role=button wrapper with rotating ChevronDown and inline expansion panel (border-l, mono detail grid AGENT/TAB/RECIPIENT/AMOUNT/STATUS). Expansion state = local Set. Empty states distinguish "no matches" (Clear filters action) vs "no activity yet". List scrolls in max-h-[calc(100vh-320px)] scrollbar-thin container. First-mount gate via useAccountData() → ViewSkeleton variant="activity" (~500ms real provider latency each entry), error → EmptyState + retry.
- SecurityView: posture tiles (POST-QUANTUM/BOUNDED/CONTROLLED/ONCHAIN with status dots + one-line details, allocated % computed from totals), ExposureMeter (default import) after tiles, root-authority card (PQSigil watermark, scheme/status-chip/last rotation/interval/next-rotation rows — warning color under 7d, rotate action → AlertDialog → usePqtabsData.getState().rotateRootKey() + sonner toast) beside recovery & custody card; semantic active-capability-bounds table (TAB/AGENT/CAP/PER CALL/RECIPIENTS/EXPIRES, warning when <24h, horizontally scrollable on mobile); enforcement-model statements (WHAT YOU SEE / WATCH / GUARANTEES IT, gold on the guarantee); security events (policy_blocked + key_rotated + capability_expired) via ActivityRow with onOpen → setView("activity").
- SettingsView (max-w-3xl): read-only profile (initials chip, usr_atlas · PQ Root · SLH-DSA, member duration, READ-ONLY chip), keyboard card with real shortcuts via shared Kbd (⌘K/Ctrl K, Esc, Enter, ↑↓), environment card — the single "Preview data" honesty surface (warning-tone badge + production-provider copy + Treasury→USDC balance / Tabs→Barkeep tab state / Activity→chain + backend events / Security→contract reads mapping list), data controls (danger ghost → AlertDialog → resetToSeed() + toast + setView("overview")).
- CommandMenu: shadcn Dialog wrapping cmdk Command (repositioned top-[20%], gold selection accent, mono uppercase group headings). Global ⌘K/Ctrl+K toggle listener reads store via getState (no resubscribe). Groups: Actions (create capability, check exposure, open security center, review activity), Navigate (all six views), Agents (openDrawer), Recipients (copies address to clipboard + "Address copied" toast — no dead commands). CommandEmpty "No results found."
- Verification: bunx tsc --noEmit → zero errors in dashboard/* (also passes against 3-a's real ActivityRow/ViewSkeleton/ExposureMeter). bun run lint → my files clean (2 remaining errors are lead-owned CountUp.tsx + use-account-data.ts). dev.log: no errors referencing my files (current 500 is PqtabsRoot → missing LandingPage from Task 2-a, resolves when 2-a lands).
Stage Summary:
- Created: src/components/pqtabs/dashboard/{CreateTabDialog,ActivityView,SecurityView,SettingsView,CommandMenu}.tsx — all DEFAULT exports, no props (read ui store directly), exactly as DashboardApp imports them (verified 3-a's wiring matches).
- Consumes 3-a: ActivityRow (named), ViewSkeleton (named, variant prop), ExposureMeter (has BOTH named and default export — I use default), plus shared EmptyState/StatusChip/PQSigil/Kbd.
- For Task 4 integrator: createOpen dialog fully self-managing (preset via createPresetAgentId honored on open); ActivityView re-gates through useAccountData on every mount (~500ms skeleton per entry — intentional, production-shaped); sticky filter bar uses top-16 md:top-2 to clear the mobile top bar; expiry semantics: policy.expiresInHours = hours-from-now for active tabs (used consistently in SecurityView bounds table and create flow); rotateRootKey/resetToSeed are store actions called directly (not in DataProvider interface); all sonner toasts, no other toast system; no files outside my five were touched.

---
Task ID: 2-a
Agent: frontend-styling-expert
Task: Landing top half (nav, hero, problem, insight, how-it-works, CapabilityFlow)
Work Log:
- Built the top half of the landing page as 7 files, matching the lead's design language and 2-b's quality bar (gold #e2b53e accents, hairlines, mono micro-labels, draw-ins, reduced-motion paths, 'use client', strict TS, no banned vocabulary).
- LandingNav: fixed header, transparent over the hero, settles into bg-background/80 + backdrop-blur-xl + hairline border past 24px scroll (passive listener). Desktop anchor set (Product/Security/How it Works/Technology, mono 11px uppercase), gold Launch App (h-9), mobile Menu icon → shadyn Sheet from the right with indexed links (01–04) + full-width Launch App; links close the sheet on tap. Logo is an anchor back to #top.
- Hero: eyebrow (gold dot + flanking hairlines) → masked clip-reveal headline (each line in its own overflow-hidden mask, motion span rises with 0.9s / 0.12s stagger / [0.21,0.47,0.32,0.98]) → sub → CTAs (gold primary with ArrowRight nudge, ghost secondary → #how) → status line with gold dot separators → HeroVisual (default import) in mt-10/16. DEVIATION NOTE: masks carry pt-[0.14em]/pb-[0.16em] (+ matching negative margins) so ascender/descender ink survives the leading-[1.02] clip box, and the initial offset is y:130% (110% of the line box is not enough to fully clear the padded mask). Verified with a pixel-diff (masked vs overflow-visible): zero clipped ink.
- ProblemSection (02, #problem): asymmetric 5/7 grid — heading + lead + closing thesis ("Agents need money. / They should not own the treasury.") left; right an original inline SVG "THE TRADITIONAL MODEL" (viewBox 720×300): USER TREASURY ($100,000, gold) → LONG-LIVED AGENT KEY (danger border + key glyph) → AGENT (teal core node) → UNRESTRICTED SPENDING (red box on a pulsing radial danger glow, "$100,000 AT RISK"), connectors draw in with pathLength and arrowheads, red intensity grows to the right. Three annotation rows with red ✕ (lucide X 12px in border-danger/30 circles) below.
- InsightSection (03, #insight): centered oversized statement "Separate authority from spending." (authority = text-gradient-gold, spending = text-teal); two-column split divided by a vertical hairline with a gold diamond at center (horizontal hairline + diamond on mobile). Left: ROOT AUTHORITY + PQSigil(56, text-gold) + body + "USED A FEW TIMES A YEAR"; right: DAY-TO-DAY SPENDING + hand-drawn tab glyph (rounded rect, gold cap notch + balance bar + progress sliver — PQMark/tab-card language) + body + "USED EVERY DAY · BOUNDED".
- HowItWorks (04, #how): SectionHeading + CapabilityFlow + 4 numbered steps (sm:2 / lg:4 grid, gold mono 01–04, hairline above each). Hovering a step sets activeStage; leaving resets to null so the auto-cycle resumes. The per-step hairline turns gold while its stage is active.
- CapabilityFlow (visuals/, viewBox 960×320): four 180×120 stage cards (PQ ROOT mini concentric rings / TAB card glyph / AGENT teal node / PAYMENT USDC chip) with mono titles + sub-labels + stage index; connectors draw in staggered with "creates / constrains / within policy" annotations; gold policy-gate diamond on the agent→payment gap; one gold particle (SMIL animateMotion, 7s) rides the full root→payment channel beneath the cards and through the gate; bottom in-SVG annotation row "UI DISPLAYS POLICY · BACKEND RELAYS ACTIVITY · BLOCKCHAIN ENFORCES POLICY" with gold separators. activeStage drives gold stroke + 1.02 scale + halo ring (300ms transitions); null/undefined ⇒ gentle 2.5s auto-cycle (skipped under reduced motion). onStageSelect mounts 4 invisible grid-aligned buttons with "Stage N: name" aria-labels for keyboard access.
- LandingPage: semantic composition — header nav, <main> with Hero→FinalCta, footer. Added [&_section[id]]:scroll-mt-20 on the root so every anchored section (including 2-b's #security/#technology/#product) lands clear of the fixed nav; no files outside my lane touched.
- Verification: bunx tsc --noEmit → zero errors in landing/** and visuals/** (remaining project errors are all in examples/ + skills/). bun run lint → my 7 files clean (2 remaining project errors are lead-owned CountUp.tsx + use-account-data.ts). Dev server (untouched) now serves / as 200 — the previous 500 (missing LandingPage) is resolved. Headless-browser QA: no horizontal overflow at 375px or 1440px; all anchor ids present (#top/#problem/#insight/#how/#security/#technology/#product); nav scrolled/transparent states, mobile sheet open→link→close→anchor, step hover → stage-2 gold stroke, overlay click → stage-4 gold stroke all exercised; zero page errors. VLM design review of hero/problem/how screenshots: no clipping, no collisions.
Stage Summary:
- Files created (all default exports):
  - landing/LandingPage.tsx (props { onLaunchApp: () => void }) — composes LandingNav, Hero, ProblemSection, InsightSection, HowItWorks, SecuritySection, WhyArc, WhyBarkeep, ProductFlow(onLaunchApp), TechnicalSection, FinalCta(onLaunchApp), LandingFooter; root div relative min-h-screen overflow-x-clip bg-background text-foreground + page-wide section scroll-mt.
  - landing/LandingNav.tsx (props { onLaunchApp }) — fixed, scroll-aware, mobile Sheet.
  - landing/Hero.tsx (props { onLaunchApp }) — id="top".
  - landing/ProblemSection.tsx (no props) — id="problem", SectionShell 02.
  - landing/InsightSection.tsx (no props) — id="insight", SectionShell 03.
  - landing/HowItWorks.tsx (no props) — id="how", SectionShell 04, owns activeStage state.
  - visuals/CapabilityFlow.tsx (props { className?, activeStage?: number | null, onStageSelect?: (i: number) => void }).
- For Task 4 integrator: (1) hero masked lines start at y:130% (not 110%) by design — mask padding + font metrics; don't "fix" back to 110% or the first frame will peek; (2) LandingPage's [&_section[id]]:scroll-mt-20 handles anchor-vs-fixed-nav for the whole page — if sections are ever rendered outside this wrapper, add scroll-mt individually or scroll-padding-top on html; (3) CapabilityFlow auto-cycle resumes from its last position after hover-leave (not from 0); clicking an overlay stage persists the selection until the next step hover-leave; (4) unique SVG ids used: ps-danger-glow (problem), no ids needed in CapabilityFlow (no defs); SMIL particles in CapabilityFlow run from load (ambient loops, no beginElement gating needed); (5) unverified observation for lead/2-b: a VLM pass claimed the "COMPROMISED AGENT" label in AttackBlocked may sit low — model was hallucination-prone in that session, treat as needs-repro, not a defect report; (6) dev server was never restarted; / compiles and renders clean.

---
Task ID: 4-6
Agent: lead (Z.ai Code)
Task: Integration, QA, browser verification, README

Work Log:
- Fixed lint errors in foundation files (CountUp rAF pattern, use-account-data retry from event handler).
- Fixed hydration mismatch: floating-point SVG tick coordinates differed between Node and browser — added deterministic r2() rounding in HeroVisual, ArcVerification, CapabilityFlow, PQSigil.
- Diagnosed stale CSS chunk (postcss daemon cache): full dev server restart with fresh .next/dev cache restored the compiled design tokens (gold utilities had been missing from the served stylesheet).
- Fixed framer-motion "animate opacity from undefined" warnings: CapabilityFlow active-halo rect lacked initial={false}.
- Browser-verified (agent-browser + VLM screenshot review): hero + hero visual integrity, all landing sections, blast-radius slider (keyboard-driven, aria-valuetext, live derived values), Launch App transition, dashboard overview data ($24,820.47 / $3,250.00 / $21,529.27 / 3 tabs, 13.1% exposure), Tabs view + drawer (can-do/never-do sections), reclaim flow ($41.20 toast + section removal), Agents + drawer, create-capability 5-step flow end-to-end (TAB-A7D7 created, listed in Tabs, shown in security bounds table), ⌘K command menu, activity filters/search/empty state/inline expansion, Security view, Settings reset-to-baseline, mobile 375px (no overflow, 32px bottom-nav clearance, 75x64px tap targets), landing footer, landing↔app round-trip with clean console.
- Final checks: bun run lint clean, tsc --noEmit zero src errors, dev.log all 200s, zero page errors, zero hydration warnings, zero motion warnings.
- Wrote README.md (architecture, data layer contract, real-data mapping, design system, run/build/test, verification log).

Stage Summary:
- Project complete and browser-verified end to end. All tasks 1, 2-a, 2-b, 3-a, 3-b, 4, 5, 6 done.
- 40 components/foundation files across landing (15), dashboard (16), visuals (5), shared (9), data layer (4), root shell.
- The provider seam (src/data/types.ts + src/data/provider.ts) is the single swap point for Arc/Barkeep/backend integration.

---
Task ID: P-0
Agent: lead (Z.ai Code)
Task: Premium polish pass — 3D icon assets, motion CSS kit, shared primitives, contracts for parallel polish agents

Work Log:
- Analyzed user's reference image (VLM) + webthreeconsulting.com: deep-black canvas, ONE accent used sparingly, massive tight-tracked display type, dot-matrix particle elements, subtle grain, ghost buttons, restrained glows.
- Generated 12 consistent 3D gold icons (z-ai image, 1024px, gold-on-black; regenerated robot+hex for material consistency — VLM-verified set is uniform solid gold).
- scripts/process-icons.py: border-median black-floor estimation → luminance→alpha cutout, bbox trim, center square, 512px (vault 640px), soft alpha edge → shipped /public/icons3d/*.webp (60–188KB each, 1.3MB total). Raw + PNG intermediates deleted.
- globals.css motion kit (all transform/opacity, reduced-motion auto-disabled): .animate-marquee(+hover-pause), .animate-float, .animate-twinkle, .animate-spin-slow(-reverse), .animate-pulse-soft, .text-shimmer, .mask-fade-x(-soft), .line-shimmer, .glow-gold, .border-beam (@property --beam-angle conic ring).
- Shared primitives (exported from @/components/pqtabs/shared): Icon3D {name,size,glow,float,decorative,priority} + Icon3DName type; SpotlightCard {children,className,radius,as}; ScrollProgress {className?}.

Stage Summary:
- 3D ICONS (webp, transparent): key card robot coin lock vault hourglass hex shield check gauge quantum — use ONLY via <Icon3D> from @/components/pqtabs/shared.
- POLISH CONTRACTS (supersede earlier notes for the files below):
  1. Task P-a OWNS: landing/{LandingPage,LandingNav,Hero,ProblemSection,InsightSection,HowItWorks}.tsx + NEW landing/{StackMarquee,BentoFeatures,HeroParticles}.tsx.
  2. Task P-b OWNS: landing/{SecuritySection,BlastRadius,WhyArc,WhyBarkeep,ProductFlow,TechnicalSection,FinalCta,LandingFooter}.tsx.
  3. NEITHER touches: shared/**, globals.css, data layer, dashboard/**, root shell, HeroVisual.tsx (lead-owned; do not edit).
  4. BentoFeatures is a second act INSIDE the #how section (no new SectionShell index — page numbering 01–10 unchanged). StackMarquee renders between Hero and ProblemSection, index-less.
  5. Keep all existing copy/semantics — this is a visual/motion polish pass, not a rewrite. Never banned words (mock/demo/dummy/fake); no new npm deps; next/image only for icon assets; transform/opacity animations only.
  6. Design north star: webthreeconsulting-grade restraint — gold ≤ ~10% of any viewport, huge tight display type, generous negative space, hairlines, grain stays.

---
Task ID: P-a
Agent: frontend-styling-expert
Task: Premium polish of the landing top half (hero atmosphere + particles, stack marquee, nav micro-interactions, problem danger atmosphere, 3D icon twins, step icons, guarantee bento)

Work Log:
- Read the full worklog + P-0 contracts, all six owned landing files, shared primitives (Icon3D/SpotlightCard/ScrollProgress/Reveal/SectionShell), the motion kit in globals.css, and HeroVisual (read-only) before editing.
- HeroParticles (NEW): 62 gold dots in 3 concentric rings (r 118/186/262 in a 640 viewBox), positions/jitter/twinkle clocks from a fixed-seed mulberry32 PRNG at module scope (r2-rounded like HeroVisual — SSR/client parity). Ring groups rotate via animate-spin-slow / -reverse (66/74/88s, transform-box: view-box, origin center); dots twinkle (3–7s duration, 0–4s delay, min=0.35×base, max=base). Static circle opacity = the dim value so reduced motion lands on the subdued state. Radial mask dims the core (architecture area) and dissolves the outer edge. Mounted behind HeroVisual (absolute, centered, -z-10, w-[min(600px,92vw)] — negative z paints it above the page canvas but below all in-flow text and the positioned HeroVisual; page overflow-x-clip keeps 375px safe).
- Hero: atmosphere stack now horizon + grid-fade + breathing gold orb (380px, bg-gold/[.06], blur-3xl, animate-pulse-soft 12s, upper-right) + bottom vignette (h-36/48 gradient to background/70, painted under the visual's transparent canvas for depth); headline up to lg:text-[5.5rem] with masks untouched (y:130% + pt/pb); "Never give them" swapped text-gradient-gold → text-shimmer; primary CTA gained relative+overflow-hidden, a skewed white/gold light slash sweeping across on group-hover (transform-only), and hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)] (Button base is transition-all, so it eases); two restrained Icon3D accents — coin 40px inline at the end of the status line, shield 44px absolute top-right (xl-only, right-[6%] top-[220px], clear of the 896px headline column) — both float decorative opacity-90.
- StackMarquee (NEW, between Hero and ProblemSection): index-less section (no scroll-mt side effects), border-y hairline, py-5/6; 7 protocol items in mono 11px tracking-[0.28em] with 3px gold/60 rotated-square separators; track renders the row twice (second aria-hidden) inside flex w-max + animate-marquee (46s) + marquee-hover-pause + mask-fade-x; identical halves ⇒ seamless -50% loop; items lift to foreground on hover while the strip pauses.
- LandingNav: desktop anchors got a 1px gold underline that scales in from the left (origin-left, 200ms, -bottom-1); Launch App got the same soft gold hover shadow as the hero CTA. Scroll behavior, sheet, anchors untouched.
- LandingPage: <ScrollProgress /> added as first child of the root div (z-80, above nav); <StackMarquee /> inserted between Hero and ProblemSection; composition order otherwise unchanged.
- ProblemSection: breathing danger glow behind the right column (340px, bg-danger/[.06], blur-3xl, animate-pulse-soft 11s, -z-10 so it glows through the SVG's transparent background rather than hazing the linework); the 3 annotation rows are now bordered (border-danger/25, rounded-lg, px-4 py-3.5) with transition-colors hover:border-danger/40 hover:bg-danger/[.04]; Icon3D lock 44px float decorative beside the closing thesis (right of the two-line statement, opacity-90).
- InsightSection: hand-drawn TabGlyph SVG replaced by Icon3D card 88px float decorative (the golden card IS the tab); left column stages Icon3D key 88px (tilted -12°, -mr-10, sigil z-10 on top) so the 3D key reads as the physical twin of the PQSigil; all copy/captions preserved.
- HowItWorks: each of the 4 steps now carries its Icon3D (key/card/robot/shield, 56px, float, name-seeded delays) in a row with the step number; icons get scale-105 + brightness-110 while their stage is active (origin-bottom-left, 300ms) — existing hover→activeStage wiring, gold hairline behavior, and CapabilityFlow untouched.
- BentoFeatures (NEW, mounted from HowItWorks after the steps grid, mt-20 md:mt-28, still inside the #how SectionShell — no new id/index): SectionHeading "THE GUARANTEES / Every tab is a vault with an allowance." (vault gold) + one-line lead; featured SpotlightCard (border-beam, lg 2×2) with vault Icon3D 140px (scaled .6/.9/1 by breakpoint so 375px never crowds), "ASSUME BREACH" kicker, "Nothing leaves without a signature.", $0 in text-6xl/7xl text-gradient-gold tabular with "REACHABLE BEYOND THE CAP" label, FIPS 204 / SLH-DSA / ARC chip row; 4 guarantee singles (lock/hourglass/robot/gauge, 52px float + kicker + title + 2-line body); 5th card (check, "Every attempt recorded") closes the grid FULL-WIDTH on lg (sm:col-span-2 lg:col-span-4, horizontal layout) — featured 4 cells + 4 singles + 4-cell strip = 12 cells = exact 3-row fill, no orphan gaps at any breakpoint. All cards SpotlightCard-wrapped; Reveal stagger 0–300ms.
- Verification: bunx tsc --noEmit → zero errors in src/** (remaining: examples/ + skills/ only); bun run lint → exit 0, zero findings; dev.log → clean compiles + GET / 200s, no errors referencing my files (only a stale EADDRINUSE from an old duplicate-start attempt). No browser QA run (parallel P-b lane active — lead to verify).

Stage Summary:
- Files created: landing/{HeroParticles,StackMarquee,BentoFeatures}.tsx (all default exports; HeroParticles/StackMarquee take optional className/none, BentoFeatures no props).
- Files edited: landing/{LandingPage,LandingNav,Hero,ProblemSection,InsightSection,HowItWorks}.tsx. No shared/**, globals.css, HeroVisual, dashboard, data, root, or P-b files touched.
- Integration notes for the lead / P-final:
  1. LandingPage now renders ScrollProgress (first child) + StackMarquee (Hero → StackMarquee → ProblemSection). Section ids/anchors and nav behavior unchanged; StackMarquee is index-less so page numbering 01–10 is intact.
  2. Hero headline masks still use y:130% + pt/pb padding (worklog note respected); headline is now lg:text-[5.5rem] — verify the lg line breaks (expect 2 visual lines per mask) during browser QA.
  3. HeroParticles is deterministic (fixed PRNG seed 0x50512b at module scope) — hydration-safe; if the constellation density is ever tuned, change RING_SPECS/seed together, never Math.random.
  4. Icon3D usage: 14 renders across the top half (hero 2, insight 2, steps 4, bento 6) — all decorative, none priority; per-viewport gold stays well under 10%.
  5. BentoFeatures' 5th card spans full-width on lg by design (grid math in the component comment); if a 6th card is ever added it can slot as a plain single and the ledger card stays the closer.
  6. New Tailwind arbitrary-property classes in use ([--marquee-duration:46s], [--pulse-duration:11s/12s]) — if the postcss cache ever serves stale CSS (seen in Task 4-6), these are the newest utilities to spot-check.
  7. Browser QA still owed on: marquee seam/hover-pause, particle layering behind HeroVisual (incl. 375px), nav underline + button glow, bento grid balance at sm/lg, problem-section glow behind the diagram, insight key/sigil overlap.

---
Task ID: P-b
Agent: frontend-styling-expert
Task: Premium polish pass on the landing bottom half (sections 05–10 + footer) — 3D icon staging, SpotlightCard washes, cinematic FinalCta centerpiece, shimmer details
Work Log:
- Followed the P-0 polish contracts: gold-only restraint, Icon3D via shared (never raw <img>), SpotlightCard presentation wrappers, CSS motion kit only (transform/opacity), all existing copy/semantics/anchors/SectionShell indices (05–10) kept exactly.
- SecuritySection: wrapped heading in a flex row staging <Icon3D name="lock" size=72 float decorative> in the right negative space (hidden below md, pt-6 so it sits at title height); added a soft danger atmosphere behind AttackBlocked — 340px bg-[#e5484d]/[.05] blur-3xl radial, centered via left/top calc(50%±170px) (avoids translate-vs-scale collision with animate-pulse-soft), --pulse-duration 8s.
- BlastRadius: the interactive model card div is now a SpotlightCard (rounded-2xl border bg p-6 md:p-10 unchanged) + transition-colors duration-300 hover:border-gold/25; all Slider logic, aria-live, values, and the two big tabular stats untouched (tabular was already present).
- WhyArc: mirrored the lock staging with <Icon3D name="hex" size=72 float decorative> beside the SectionHeading; the 3 fact tiles are now SpotlightCards keeping their hairline-top accent, rounded-xl border bg p-6 and hover:border-gold/25 (no double borders — border lives on the SpotlightCard itself).
- WhyBarkeep: one light accent only — <Icon3D name="quantum" size=56 float decorative> centered above the closing statement (kept the layers SVG, copy, statements untouched).
- ProductFlow: the 3 mini dashboard previews are SpotlightCards (h-full, hover:-translate-y-0.5 + hover:border-gold/20 kept); an inner flex h-full flex-col preserves card 3's bottom-pinned Create capability button inside SpotlightCard's block content wrapper; each card header gained a 40px non-floating Icon3D (robot / card / check) with the label truncating and the index retained; final CTA gold button gained hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)].
- TechnicalSection: <Icon3D name="gauge" size=64 float decorative> staged beside the SectionHeading; spec-sheet dl rows gained transition-colors duration-300 hover:bg-white/[.02]; the gold WHAT GUARANTEES IT row untouched as the focal point.
- FinalCta (the premium moment): centerpiece rebuilt around the breathing PQSigil —
  - vault Icon3D 200px mobile / 300px md+ (two instances with md:hidden / hidden md:inline-block, identical deterministic float) centered above the headline;
  - 380px bg-gold/[.10] blur-3xl glow underneath with animate-pulse-soft 7s, centered via calc(50%±190px) (no translate classes — immune to pulse-soft's scale keyframes);
  - orbit: 264px (md:400px) ring — dotted gold circle + one 30° brighter arc in a single SVG with animate-spin-slow --spin-duration 60s (uniform dashes alone are rotation-invisible, so the traveling arc carries the motion); 8 sentinel dots at fixed angles (22.5°+k·45°, precomputed percents, no Math.random) with animate-twinkle and per-index --twinkle-delay/duration;
  - PQSigil 56px breathing (framer scale) anchored on the vault's lower edge in front (static translate on an outer div, motion scale on an inner div — no transform collision);
  - headline second line text-gradient-gold → text-shimmer; primary button gained overflow-hidden + skewed white gradient light-sweep span (translate transition 700ms, transition-transform covers v4's standalone translate property) + hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)]; skipped the optional extra line-shimmer (one shimmer moment per composition — restraint).
- LandingFooter: top border-t replaced by a full-width 1px line-shimmer div (bg-white/[.06] base, --sweep-duration 7s); bottom row gained a third element — gold size-1.5 dot with animate-pulse-soft (2.6s, .35→1) + ALL SYSTEMS OPERATIONAL in mono 10px uppercase tracking-[0.2em]; © 2025 PQTABS + tagline kept.
- Verification: bunx tsc --noEmit → zero errors in src/** (remaining are pre-existing examples/ + skills/ only); bun run lint → zero findings (project-wide clean); dev.log all 200s, no runtime errors. Verified against the running server WITHOUT restarting it: SSR HTML confirms 7 SpotlightCards, all 8 icon names (vault ×2 instances), 8 twinkle dots, orbit arc, shimmer headline, sigil, footer status line, and anchors #security/#technology/#product; compiled CSS confirms every new utility (calc positions normalized to `calc(50% - 170px)`, md:w-[400px], -skew-x-[18deg], group-hover translate, text-shimmer, line-shimmer, pulse/twinkle/spin-slow).
Stage Summary:
- Files edited (8, no files created; exports/props unchanged — all default exports, SecuritySection/WhyArc/WhyBarkeep/TechnicalSection/LandingFooter no props, BlastRadius no props, ProductFlow/FinalCta { onLaunchApp }):
  - landing/SecuritySection.tsx, landing/BlastRadius.tsx, landing/WhyArc.tsx, landing/WhyBarkeep.tsx, landing/ProductFlow.tsx, landing/TechnicalSection.tsx, landing/FinalCta.tsx, landing/LandingFooter.tsx
- No shared/, globals.css, dashboard/, data/, root, HeroVisual, or P-a files touched. No new dependencies. All animations are the lead's CSS kit (reduced-motion auto-disabled globally) or framer Reveal/scale on the sigil.
- Integration notes for the lead: (1) FinalCta renders two vault Icon3D instances (same /icons3d/vault.webp URL — one fetch); both share identical float timing. (2) The FinalCta glow/ring are centered with calc() offsets instead of -translate-x-1/2 because animate-pulse-soft/scale keyframes would fight a transform-based translate — keep that pattern if you touch these. (3) ProductFlow preview cards use an inner flex div inside SpotlightCard (SpotlightCard wraps children in a block span, so flex distribution must live on the inner wrapper — card 3's button is bottom-pinned via it). (4) Footer status dot pulses via animate-pulse-soft with custom --pulse-min/max opacity vars. (5) No browser QA run per instructions — headless verification deferred to the lead after both lanes land.

---
Task ID: P-final
Agent: lead (Z.ai Code)
Task: Integration QA for the premium polish pass — motion verification, root-cause fixes, browser + VLM verification, performance check

Work Log:
- Full compile gates: bunx tsc --noEmit → 0 src errors; bun run lint → clean; dev.log all 200s.
- Browser QA (agent-browser): no horizontal overflow at 1440px or 375px; all 21 optimized icon images load (the one "incomplete" vault img is the hidden mobile variant inside display:none — lazy-load never triggers, by design, not a defect).
- Interaction QA: Launch App → dashboard round-trip (sidebar + treasury $24,820.47 render, exit returns to landing); nav anchor #security lands exactly 80px below the 65px fixed nav; BlastRadius slider keyboard-driven $500→$900 with aria-live updates.
- Root cause #1 — framer-motion "animate opacity from undefined to 1" warnings: pre-existing pattern (motion.g/path SVG pop/fade helpers with whileInView). Fixed by converting the fade/pop choreography to CSS transitions keyed to each component's existing useInView state (deterministic, no keyframe-origin resolution): AttackBlocked (7 fades + initial={false} on the pulsing ring) and ArcVerification (5 pops + 6 fades, incl. closing tags). Identical visual timing; VLM-verified both diagrams fully render with complete staged entrances. Full-page aggressive scroll: 0 warnings.
- Root cause #2 — tailwind-merge stripped the `.border-beam` class (parsed as a border-color conflict against border-white/[.08]). Renamed utility to `.card-beam` in globals.css + BentoFeatures.
- Root cause #3 — stale postcss chunk: served CSS was missing ALL new motion utilities (animations silently dead). Full dev server restart with fresh .next (after also clearing node_modules/.cache to clear a next/font cold-start 500). Verified in-DOM: marquee/twinkle/float-y/pulse-soft/spin-slow/beam-spin animations all live; text-shimmer background-clip active; 1 card-beam element; 13 spotlight cards.
- Performance: DOMContentLoaded 181ms, loadEvent 681ms, JS heap 23MB, 47 requests; icons served through next/image optimizer (tiny transfer). All animations transform/opacity only.
- VLM design review (10-section contact sheet + zoomed re-checks): "95% premium and clean" → verified the flagged items were thumbnail artifacts (insight columns aligned, vault renders seamless, no background boxes). FinalCta vault centerpiece: "elegant, minimal, premium". Hero: "9/10, rivals or exceeds webthreeconsulting.com".
- Mobile 375px: marquee/bento/CTA/footer verified, no overflow, tap targets ≥44px.

Stage Summary:
- Polish pass complete and browser-verified end to end. Zero console errors, zero hydration issues, zero motion warnings, zero type/lint findings.
- New assets: /public/icons3d/*.webp (12 gold 3D icons, transparent, 1.3MB total) via scripts/gen-icons.sh + scripts/process-icons.py (luminance cutout).
- New CSS motion kit in globals.css (marquee/float/twinkle/spin/pulse-soft/text-shimmer/mask-fade-x/line-shimmer/glow-gold/card-beam).
- New shared primitives: Icon3D, SpotlightCard, ScrollProgress.
- New landing sections: StackMarquee (protocol strip), BentoFeatures (guarantees bento, second act of #how), HeroParticles (gold dot rings).
- Engineering notes for the future: (1) never name a custom class with a twMerge-conflicting prefix (border-*, text-*); (2) SVG motion pop/fade on this framer version should use the CSS-transition pattern (see AttackBlocked/ArcVerification) — motion whileInView opacity on SVG <g> can resolve an undefined origin; (3) after editing globals.css, if new utilities don't appear in the served chunk, restart dev with fresh .next AND node_modules/.cache.
