import Link from "next/link";
import { Logo, Reveal, SectionShell } from "@/components/pqtabs/shared";
import { Button } from "@/components/ui/button";
import { CopyBlock } from "./CopyBlock";
import { OnboardingSteps } from "./OnboardingSteps";

/**
 * /developers: how to use the published PQTABS SDK and MCP server.
 * Every command, package name, env name, and config shape here is taken from the published packages (sdk 0.1.1, mcp 0.1.2)
 * and from each host's documentation. Nothing on this page moves money; the page only describes the tools.
 */

const SDK_VERSION = "0.1.1";
const MCP_VERSION = "0.1.2";

const INSTALL_SDK = "npm install pqtabs-sdk";
const INSTALL_MCP = "npm install -g pqtabs-mcp";

const EXAMPLE_TS = `import { PqtabsClient } from "pqtabs-sdk";

// Read-only: no keys, no money. Uses the public backend and Arc mainnet (chain 5042).
const pqtabs = new PqtabsClient();

const config = await pqtabs.read.config();     // refuses unless the backend is Arc mainnet
const chainId = await pqtabs.read.rpcChainId(); // read from the Arc RPC, never assumed
const portfolio = await pqtabs.read.portfolio("<your root address>");

console.log(config.chainId, chainId, portfolio.tabs.filter((tab) => tab.open).length);`;

const EXAMPLE_PAID = `import { PqtabsClient, externalSigner } from "pqtabs-sdk";

// Spends USDC. Only for a capability your root has already opened.
// signTypedData calls YOUR signer (hardware wallet, KMS, enclave, or local signer) and returns the 65-byte signature.
// The agent key never enters this process.
const signer = externalSigner({
  address: "<agent address the root opened>",
  signTypedData: (typedData) => mySigner.signTypedData(typedData),
});

const outcome = await new PqtabsClient().spend.research({
  tab: "<open capability address>",
  signer,
  maxPriceRaw: "1000",               // the most this run may pay: 0.001 USDC
  task: "What is the Arc USDC gas token?",
});

// outcome.status: "complete" | "result_pending" | "settlement_pending"`;

const MCP_DESKTOP = `{
  "mcpServers": {
    "pqtabs": {
      "command": "npx",
      "args": ["-y", "pqtabs-mcp"]
    }
  }
}`;

const MCP_CURSOR = `{
  "mcpServers": {
    "pqtabs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "pqtabs-mcp"]
    }
  }
}`;

const MCP_CLAUDE_CODE = `claude mcp add --transport stdio pqtabs -- npx -y pqtabs-mcp`;

const SETUP_PROMPT = `You are configuring the PQTABS MCP server on this machine. PQTABS is a post-quantum spending boundary on Arc mainnet (chain 5042). Work through these steps in order and report each result.

1. Detect which MCP host you run in (Claude Desktop, Cursor, Claude Code, or another). If you cannot tell, ask me which host to configure.
2. Check that Node.js 20.19 or later is installed: run "node --version".
3. Add one MCP server entry named "pqtabs" to the host's own configuration file, using the host's documented format. Use command "npx" and args ["-y", "pqtabs-mcp"]. Do not add any environment variables.
4. If the host needs a restart or an approval for a new server, tell me exactly what to do, then wait for me to confirm.
5. Call pqtabs_status. It must report backendOk true, sdkRpcChainId 5042, and onArc true.
6. List the advertised tools. Expect seven read tools and no pqtabs_run_paid_research.
7. Run read-only smoke tests: call pqtabs_get_portfolio, then pqtabs_list_capabilities, for a root address I give you.

Rules you must follow:
- Never ask me for a root backup phrase, a post-quantum private key, or any private key in this chat.
- Do not create or open a capability, close one, change a cap, limit, or payee, rotate a root, fund a wallet, or broadcast a transaction.
- Do not set PQTABS_AGENT_PRIVATE_KEY, PQTABS_SIGNER_CLI, or PQTABS_SIGNER_AGENT unless I explicitly ask you to enable paid research and point you to my secret store or signer. Never print a key or a signer secret.
- Do not call a paid tool or spend USDC during setup.
- If a check fails, report the error code and stop. Do not work around it by changing limits, keys, or the payee.`;

const TOOLS = [
  { name: "pqtabs_status", kind: "read-only", effect: "Checks the backend and Arc RPC chain. Moves nothing." },
  { name: "pqtabs_get_portfolio", kind: "read-only", effect: "Reads one root and its capabilities from Arc." },
  { name: "pqtabs_list_capabilities", kind: "read-only", effect: "Caps, per-payment limits, live balances, expiry, and payees." },
  { name: "pqtabs_get_receipt", kind: "read-only", effect: "Checks one Arc transaction against one expected payment." },
  { name: "pqtabs_create_research_quote", kind: "quote only", effect: "Prices a question and creates a quote record. Signs nothing." },
  { name: "pqtabs_check_spend_policy", kind: "quote only", effect: "Returns ALLOW or REFUSE with reasons. Creates a quote record. Signs nothing." },
  { name: "pqtabs_recover_result", kind: "no payment", effect: "Fetches the answer for a quote that already settled. Never relays, signs, or charges." },
  { name: "pqtabs_run_paid_research", kind: "spends USDC", effect: "Pays one capability inside its limits. Listed only when a signer is configured. Requires confirmSpend true and maxPriceRaw." },
] as const;

const ENV_VARS = [
  { name: "PQTABS_BACKEND_URL", def: "https://pqtabs.onrender.com", note: "Backend. Plain http is allowed only for localhost." },
  { name: "PQTABS_RPC_URL", def: "https://rpc.mainnet.arc.io", note: "Arc RPC for chain checks and receipts." },
  { name: "PQTABS_STATE_DIR", def: "~/.pqtabs", note: "Stores spend attempts so a retry never signs twice." },
  { name: "PQTABS_SIGNER_CLI", def: "unset", note: "Repository build. Path to the pqtabs-signer CLI. The MCP asks it for one signature per approved payment and never holds the key." },
  { name: "PQTABS_SIGNER_AGENT", def: "unset", note: "Repository build. The public agent address. It must match the address the signer stores." },
  { name: "PQTABS_AGENT_PRIVATE_KEY", def: "unset", note: "Legacy, pqtabs-mcp 0.1.1 and earlier. The raw key sits in the server process. Prefer a local signer. Unset it to run read-only." },
] as const;

const STATUSES = [
  { state: "complete", meaning: "The receipt matched exactly one USDC transfer from the capability to the payee, and the answer is ready." },
  { state: "result_pending", meaning: "The receipt matched, but the answer is not ready. Call pqtabs_recover_result later. It never charges again." },
  { state: "settlement_pending", meaning: "Submitted to Arc, but the receipt is not confirmed yet. Retry with the same quote id. It never signs or relays again." },
] as const;

const REFUSALS = [
  ["capability_inactive", "The capability is closed or not yet open."],
  ["expired", "The capability has passed its expiry."],
  ["wrong_payee", "The quote pays an address the capability does not approve."],
  ["balance", "The capability does not hold enough USDC for this payment."],
  ["exposure", "The root's open exposure ceiling would be exceeded."],
  ["max_per_call", "The payment is above the capability's per-payment limit."],
  ["wrong_agent", "The signer is not the capability's agent."],
] as const;

const TROUBLESHOOTING = [
  {
    problem: "The host does not list any PQTABS tools",
    fix: "Restart the host completely. Check that the JSON is valid. If the host asks you to approve a new server, approve it. Then open the host's MCP log for the pqtabs entry.",
  },
  {
    problem: "npx cannot be found on Windows",
    fix: "Install Node.js 20.19 or later from nodejs.org, then run npm install -g pqtabs-mcp and set command to pqtabs-mcp. A host started from a different PATH may need the full path to npx.cmd.",
  },
  {
    problem: "onArc is false, or chain_mismatch",
    fix: "The backend or the RPC is not reporting Arc mainnet (5042). Unset PQTABS_BACKEND_URL and PQTABS_RPC_URL, or set PQTABS_RPC_URL to https://rpc.mainnet.arc.io. Do not point at testnet.",
  },
  {
    problem: "backend_unavailable, timeout, or HTTP 5xx",
    fix: "The public backend is not answering. Wait a short while and retry. Reads move no money. If this happens during a paid run, the outcome may be unknown, so use the same quote id with pqtabs_recover_result or the SDK resume call. That call never charges twice.",
  },
  {
    problem: "rate_limited (HTTP 429)",
    fix: "The public backend allows 240 reads and 8 relays per minute per client. Wait for the retryAfterSeconds value, then retry. The SDK retries relays with the same authorization, so it never charges twice.",
  },
  {
    problem: "policy_refused, with reasons",
    fix: "Nothing was signed or broadcast. Read the reasons in the table above. Fix the capability through the PQTABS app under your root, not through the MCP server.",
  },
  {
    problem: "receipt_mismatch",
    fix: "The Arc transaction is not the exact payment for this quote, so no result is produced. Do not pay again. Inspect the transaction with pqtabs_get_receipt and the explorer.",
  },
  {
    problem: "settlement_pending or result_pending",
    fix: "The payment is either not yet confirmed or confirmed without an answer yet. Retry pqtabs_recover_result (or the SDK resume call) later with the same quote id. Retrying never charges again.",
  },
  {
    problem: "The server exits: PQTABS_AGENT_PRIVATE_KEY is not a 32-byte hex key",
    fix: "The value is malformed. The server prints no key. Fix the value in your secret store, or unset the variable to run read-only.",
  },
  {
    problem: "signer_unavailable or signer_mismatch",
    fix: "The local signer did not sign for this agent. Run pqtabs-signer status --agent with the address, and check that PQTABS_SIGNER_AGENT is the address the root opened. Nothing was broadcast.",
  },
  {
    problem: "plain http is refused for a remote backend",
    fix: "Use an https backend URL. Plain http is allowed only for localhost during development.",
  },
] as const;

const SECTION_LINKS = [
  { label: "Onboarding", href: "#onboarding" },
  { label: "Packages", href: "#packages" },
  { label: "SDK", href: "#sdk" },
  { label: "MCP", href: "#mcp" },
  { label: "Setup prompt", href: "#agent-prompt" },
  { label: "Troubleshooting", href: "#troubleshooting" },
] as const;

export default function DevelopersPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[.06] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="focus-ring rounded-lg" aria-label="PQTABS home">
            <Logo />
          </Link>
          <nav aria-label="Developer sections" className="hidden items-center gap-7 md:flex">
            {SECTION_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="focus-ring rounded-sm font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Button asChild className="h-9 rounded-lg bg-gold px-4 text-sm font-medium text-[#171204] hover:bg-[#eec95e]">
            <Link href="/">Open the app</Link>
          </Button>
        </div>
      </header>

      <main id="top" className="pt-24">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-10 md:px-8 md:pb-20 md:pt-16">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold">Developers</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Let an agent spend inside a limit you set. Keep the treasury out of reach.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              The PQTABS SDK and MCP server connect your agent to a post-quantum root&apos;s capability on Arc mainnet.
              Read a capability, price a question, and pay for research only inside the cap, expiry, and payee the root
              approved. The MCP server runs locally over stdio. It cannot create a root, raise a limit, or add a payee.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Arc mainnet 5042", "pqtabs-barkeep", "Read-only first", "Local stdio MCP", "MIT"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/[.08] bg-white/[.02] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          </Reveal>
        </section>

        {/* 01 Onboarding */}
        <SectionShell id="onboarding" index="01" label="Onboarding">
          <div className="space-y-8">
            <div className="max-w-3xl space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Connect an agent, step by step</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Each step is a check you can run yourself. The root authorizes the agent, the local signer holds the agent key, and
                the MCP server asks the signer for one signature per approved payment. Nothing on this page signs or spends.
              </p>
            </div>
            <OnboardingSteps />
          </div>
        </SectionShell>

        {/* 02 Packages */}
        <SectionShell id="packages" index="02" label="Packages">
          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">TypeScript SDK</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">pqtabs-sdk {SDK_VERSION}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Typed reads, quote and policy checks, receipt verification, and paid research. Read, research, and spend are
                separate namespaces, so a read never moves money.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.14em]">
                <a className="focus-ring rounded-sm text-gold hover:underline" href="https://www.npmjs.com/package/pqtabs-sdk">npm</a>
                <a className="focus-ring rounded-sm text-gold hover:underline" href="https://github.com/mohamedwael201193/PQTABS/tree/main/packages/pqtabs-sdk">Source</a>
              </div>
            </article>
            <article className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">MCP server</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">pqtabs-mcp {MCP_VERSION}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A local stdio server for MCP hosts. Seven read and quote tools are always available. A paid tool is offered
                only when a signer is configured for an already-authorized capability.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.14em]">
                <a className="focus-ring rounded-sm text-gold hover:underline" href="https://www.npmjs.com/package/pqtabs-mcp">npm</a>
                <a className="focus-ring rounded-sm text-gold hover:underline" href="https://github.com/mohamedwael201193/PQTABS/tree/main/packages/pqtabs-mcp">Source</a>
              </div>
            </article>
          </div>
        </SectionShell>

        {/* 02 Install and example */}
        <SectionShell id="sdk" index="03" label="SDK">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Install and read in one minute</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Node.js 20.19 or later, ESM. The read example needs no keys and talks to the public backend and the Arc
                RPC.
              </p>
            </div>
            <div className="space-y-4">
              <CopyBlock label="Install" code={INSTALL_SDK} wrap />
              <CopyBlock label="TypeScript, read-only" code={EXAMPLE_TS} />
            </div>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="font-display text-2xl font-semibold tracking-tight">Paying for research</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Paid calls need a local signer and a capability your root already opened. The SDK checks the quote against the
                cap, per-payment limit, expiry, payee, balance, and chain before it signs. If a check fails, nothing is signed.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>The agent key stays inside the signer. It is never sent to the backend.</li>
                <li>A quote is signed at most once. Retries send the same authorization.</li>
                <li>Use an external signer (hardware wallet, KMS, or enclave) when you can.</li>
              </ul>
            </div>
            <CopyBlock label="TypeScript, paid (spends USDC)" code={EXAMPLE_PAID} />
          </div>
        </SectionShell>

        {/* 03 MCP */}
        <SectionShell id="mcp" index="04" label="MCP hosts">
          <div className="space-y-6">
            <div className="max-w-3xl space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Connect an MCP host</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Three hosts are documented here, using their own configuration formats. Each one starts the server with the
                same command. Setup is not zero-click: you must add the entry, restart or approve the server in the host, and
                then confirm that tools appear. A host that is not listed uses the same stdio command.
              </p>
            </div>
            <div className="max-w-xl">
              <CopyBlock label="Optional: install globally" code={INSTALL_MCP} wrap />
              <p className="mt-2 text-xs text-muted-foreground">
                The configs below use npx, so a global install is optional. Use it if your host cannot run npx.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">Claude Desktop</p>
                <CopyBlock label="claude_desktop_config.json" code={MCP_DESKTOP} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  On Windows the file is <code className="font-mono">%APPDATA%\Claude\claude_desktop_config.json</code>. Quit
                  and restart Claude Desktop after saving.
                </p>
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">Cursor</p>
                <CopyBlock label=".cursor/mcp.json" code={MCP_CURSOR} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Put it in <code className="font-mono">.cursor/mcp.json</code> for one project, or{" "}
                  <code className="font-mono">~/.cursor/mcp.json</code> for every project. Enable the server in Cursor&apos;s
                  MCP settings, then check the MCP logs if it stays off.
                </p>
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">Claude Code</p>
                <CopyBlock label="terminal" code={MCP_CLAUDE_CODE} wrap />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The command adds the server to local scope. Add <code className="font-mono">--scope user</code> to use it in
                  every project.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5 text-sm leading-relaxed text-muted-foreground">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">Before you configure paid research</p>
              <p className="mt-2">
                The entries above are read-only. Paid research needs a signer for an agent your root has already authorized. The
                repository build uses <code className="font-mono">PQTABS_SIGNER_CLI</code> and{" "}
                <code className="font-mono">PQTABS_SIGNER_AGENT</code>, so the MCP process never holds the key. The published 0.1.2
                package also reads <code className="font-mono">PQTABS_AGENT_PRIVATE_KEY</code> for older setups. That is a legacy path, because
                the key sits in the server process. Do not paste a root backup phrase or a root private key into any configuration.
              </p>
            </div>
          </div>
        </SectionShell>

        {/* 04 Tools */}
        <SectionShell id="tools" index="05" label="Tools">
          <div className="space-y-8">
            <div className="max-w-3xl space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Read-only tools and paid tools</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Only one tool can move USDC, and it is listed only when a signer is configured. Every tool reads the live backend or Arc. None
                returns a mock balance or a success the chain did not confirm.
              </p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/[.08]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/[.08] bg-white/[.02] font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-normal">Tool</th>
                    <th scope="col" className="px-4 py-3 font-normal">Effect class</th>
                    <th scope="col" className="px-4 py-3 font-normal">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {TOOLS.map((tool) => (
                    <tr key={tool.name} className="border-b border-white/[.05] last:border-b-0">
                      <td className="px-4 py-3 font-mono text-[12px] text-foreground">{tool.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            tool.kind === "spends USDC"
                              ? "rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gold"
                              : "rounded-full border border-white/[.08] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                          }
                        >
                          {tool.kind}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{tool.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-display text-xl font-semibold">Refusals and their reasons</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A refusal means nothing was signed or broadcast. The reasons come from the backend&apos;s policy check.
                </p>
                <ul className="mt-4 space-y-2">
                  {REFUSALS.map(([code, text]) => (
                    <li key={code} className="text-sm text-muted-foreground">
                      <code className="font-mono text-[12px] text-foreground">{code}</code>: {text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold">Results and receipts</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A result is returned only after an Arc receipt succeeds and contains exactly one USDC transfer from the
                  capability to the payee for the stated amount. A reverted receipt never produces a result.
                </p>
                <ul className="mt-4 space-y-3">
                  {STATUSES.map((status) => (
                    <li key={status.state} className="text-sm text-muted-foreground">
                      <code className="font-mono text-[12px] text-foreground">{status.state}</code>: {status.meaning}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </SectionShell>

        {/* 05 Boundary and config */}
        <SectionShell id="boundary" index="06" label="Boundary and configuration">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">The signing boundary</h2>
              <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <li>The root is the only authority. Creating a root, opening or closing a capability, changing a cap, a limit, or a payee, and rotating root authority happen in the PQTABS app, never through MCP or the SDK.</li>
                <li>The agent key authorizes one payment at a time, inside an already open capability. The SDK and MCP server never send that key anywhere except the signer.</li>
                <li>Backend and RPC must both report Arc mainnet (5042). The USDC is the 6-decimal ERC-20 at 0x3600000000000000000000000000000000000000.</li>
                <li>The protocol is named pqtabs-barkeep. It is not standard x402 exact, and it has no ArcRouter PAYMENT-RESPONSE.</li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-display text-xl font-semibold">Environment variables</h3>
              <div className="overflow-x-auto rounded-2xl border border-white/[.08]">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-white/[.08] bg-white/[.02] font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-normal">Name</th>
                      <th scope="col" className="px-4 py-3 font-normal">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENV_VARS.map((item) => (
                      <tr key={item.name} className="border-b border-white/[.05] align-top last:border-b-0">
                        <td className="px-4 py-3">
                          <code className="font-mono text-[12px] text-foreground">{item.name}</code>
                          <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{item.def}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                Chain 5042 · RPC https://rpc.mainnet.arc.io · Explorer https://explorer.arc.io
              </p>
            </div>
          </div>
        </SectionShell>

        {/* 06 Agent setup prompt */}
        <SectionShell id="agent-prompt" index="07" label="Setup prompt for an agent">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Ask your agent to set it up</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Give this prompt to a capable AI agent that can edit its own MCP configuration. It installs the published
                package, adds a read-only entry, restarts or asks you to approve, and runs read-only checks. It never asks for
                a backup phrase or a private key, and it never spends.
              </p>
              <p className="text-sm text-muted-foreground">
                Setup stops at read-only. Paid research is a separate step you take on purpose, with your own key in your secret
                store.
              </p>
            </div>
            <CopyBlock label="Copy and give to your agent" code={SETUP_PROMPT} />
          </div>
        </SectionShell>

        {/* 07 Troubleshooting */}
        <SectionShell id="troubleshooting" index="08" label="Troubleshooting">
          <div className="space-y-8">
            <div className="max-w-3xl space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">When something does not connect</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Start with <code className="font-mono text-[13px]">pqtabs_status</code>. It shows whether the backend and the
                Arc RPC answer and which chain each reports. Most problems below show up there first.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {TROUBLESHOOTING.map((item) => (
                <div key={item.problem} className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
                  <p className="font-mono text-[12px] text-foreground">{item.problem}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.fix}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionShell>

        {/* 08 Verify without spending */}
        <SectionShell id="verify" index="09" label="Verify without spending">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Check the connection first</h2>
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Install the SDK in a scratch project and run the read example above. It must print chain 5042.</li>
                <li>Configure the MCP server without a key, restart the host, and call <code className="font-mono text-[12px]">pqtabs_status</code>. Expect <code className="font-mono text-[12px]">onArc: true</code>.</li>
                <li>Call <code className="font-mono text-[12px]">pqtabs_get_receipt</code> with the settled example receipt to confirm receipt checks work end to end.</li>
              </ol>
              <p className="text-sm text-muted-foreground">
                None of these steps sends a transaction. Paid research is a separate step, and it needs an open capability and a
                key you control.
              </p>
            </div>
            <CopyBlock label="Example receipt (settled, read-only)" code={`tx        0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15
tab       0x7D627201477f192DBB3dC5E7e993aeF6701F302d
payee     0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
amountRaw 360`} />
          </div>
        </SectionShell>

        {/* Links */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-24 md:px-8">
          <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-white/[.06] pt-8 font-mono text-[11px] uppercase tracking-[0.16em]">
            <a className="focus-ring rounded-sm text-gold hover:underline" href="https://www.npmjs.com/package/pqtabs-sdk">pqtabs-sdk on npm</a>
            <a className="focus-ring rounded-sm text-gold hover:underline" href="https://www.npmjs.com/package/pqtabs-mcp">pqtabs-mcp on npm</a>
            <a className="focus-ring rounded-sm text-gold hover:underline" href="https://github.com/mohamedwael201193/PQTABS">Repository</a>
            <a className="focus-ring rounded-sm text-gold hover:underline" href="https://github.com/mohamedwael201193/PQTABS/issues">Issues</a>
            <a className="focus-ring rounded-sm text-muted-foreground hover:text-foreground" href="https://explorer.arc.io">Arc explorer</a>
            <Link className="focus-ring rounded-sm text-muted-foreground hover:text-foreground" href="/">Back to PQTABS</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
