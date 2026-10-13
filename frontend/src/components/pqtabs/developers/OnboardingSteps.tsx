"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { isAddress } from "viem";
import { CopyBlock } from "./CopyBlock";

/**
 * Developer onboarding. This component never creates a capability, never signs, and never asks for a key.
 * It accepts only a public agent address (the one `pqtabs-signer status` prints), and it refuses anything that
 * looks like a private key. Opening a capability is a root action in the PQTABS app, with the root's signature.
 */

const PRIVATE_KEY_LIKE = /^(0x)?[0-9a-fA-F]{64}$/;

type AddressState =
  | { kind: "empty" }
  | { kind: "key" }
  | { kind: "invalid" }
  | { kind: "valid"; address: string };

export function classifyAgentInput(value: string): AddressState {
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "empty" };
  if (PRIVATE_KEY_LIKE.test(trimmed)) return { kind: "key" };
  if (isAddress(trimmed)) return { kind: "valid", address: trimmed };
  return { kind: "invalid" };
}

const SIGNER_PLACEHOLDER = "<path to packages/pqtabs-signer/dist/src/cli.js>";

export function mcpConfigFor(address: string | null): string {
  return JSON.stringify(
    {
      mcpServers: {
        pqtabs: {
          command: "node",
          args: ["<path to packages/pqtabs-mcp/dist/src/cli.js>"],
          env: {
            PQTABS_SIGNER_CLI: SIGNER_PLACEHOLDER,
            PQTABS_SIGNER_AGENT: address ?? "0x<agent address from pqtabs-signer status>",
          },
        },
      },
    },
    null,
    2,
  );
}

export const ERROR_GUIDE: { code: string; meaning: string; next: string }[] = [
  { code: "signer_unavailable", meaning: "The local signer did not return a signature. The signer may be locked, missing, or refused the request.", next: "Run pqtabs-signer status --agent <address>. Fix what it reports. Nothing was broadcast." },
  { code: "signer_mismatch", meaning: "The signature does not recover to this capability's agent.", next: "Check PQTABS_SIGNER_AGENT. It must be the agent the root opened. Nothing was broadcast." },
  { code: "policy_refused", meaning: "The capability refused the payment: cap, per-call limit, expiry, or payee.", next: "Read the reason in the PQTABS app. Nothing was signed." },
  { code: "exceeds_max_price", meaning: "The quote costs more than maxPriceRaw.", next: "Raise maxPriceRaw only if you accept the quoted price. Nothing was signed." },
  { code: "quote_expired", meaning: "The quote expired before it was paid.", next: "Ask for a new quote. Nothing was signed." },
  { code: "rate_limited", meaning: "The backend is limiting requests.", next: "Wait for retry-after, then try again. The same authorization is resent, never re-signed." },
  { code: "rpc_rate_limited", meaning: "Arc is limiting reads. The read proves nothing about the payment.", next: "Retry shortly. Nothing was decided from this read." },
  { code: "rpc_unavailable", meaning: "Arc's RPC node is catching up to the head.", next: "Retry in a few seconds." },
  { code: "settlement_unknown", meaning: "A payment may have settled, but the receipt is not confirmed yet.", next: "Open the transaction in the explorer before you retry. Do not pay again." },
  { code: "chain_mismatch", meaning: "The backend and the RPC do not both report Arc mainnet (5042).", next: "Fix PQTABS_BACKEND_URL or PQTABS_RPC_URL. Nothing was started." },
];

function StepCard({ index, title, status, children }: { index: string; title: string; status: string; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-xl font-semibold tracking-tight">
          <span className="mr-2 font-mono text-[11px] text-gold">{index}</span>
          {title}
        </h3>
        <span className="rounded-full border border-white/[.08] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </article>
  );
}

export function OnboardingSteps() {
  const [draft, setDraft] = useState("");
  const [confirmedRoot, setConfirmedRoot] = useState(false);
  const state = classifyAgentInput(draft);
  const address = state.kind === "valid" ? state.address : null;

  return (
    <div className="grid gap-5">
      <StepCard index="1" title="Circle Agent Wallet" status="Optional. Not connected here">
        <p>
          Circle&apos;s agent wallet from the CLI is a smart contract account. Barkeep&apos;s capability accepts only an ECDSA
          signature from an externally owned account, so the CLI wallet cannot be the agent. This is proven on-chain. A
          Circle developer-controlled EOA on ARC is a separate option. It needs your Circle API key and entity secret on your
          own server. This page never asks for them.
        </p>
      </StepCard>

      <StepCard index="2" title="Use a local signer" status={address ? "Address accepted" : "Paste the public address"}>
        <p>
          Run <code className="font-mono text-[12px] text-foreground">pqtabs-signer status --agent 0x…</code> on your machine. Paste only
          the public address it prints. The key stays in the operating system credential store and never reaches this page or
          the MCP process.
        </p>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em]">Agent address (public)</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            aria-describedby="agent-address-help"
            className="mt-2 w-full rounded-lg border border-white/[.1] bg-background px-3 py-2 font-mono text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          />
        </label>
        <p id="agent-address-help" role="status" className="text-xs">
          {state.kind === "empty" && "Enter the address of the agent your root opened. Nothing is sent anywhere."}
          {state.kind === "key" && (
            <span className="text-destructive">
              This looks like a private key. Do not paste keys here. Paste only the public address that pqtabs-signer status prints.
            </span>
          )}
          {state.kind === "invalid" && <span className="text-destructive">Enter a public address: 0x followed by 40 hex characters.</span>}
          {state.kind === "valid" && <span className="text-foreground">Public address accepted. It is used only to build the config below.</span>}
        </p>
      </StepCard>

      <StepCard index="3" title="Authorize the agent" status="Root action. Not done here">
        <p>
          Only the root can open a capability. Open the PQTABS app and create a capability for the address above. Review the
          cap, the per-call limit, the approved payees, and the expiry. Then sign with the root security key. Nothing on this
          page creates, signs, or changes a capability.
        </p>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={confirmedRoot}
            onChange={(event) => setConfirmedRoot(event.target.checked)}
            className="mt-1 size-4"
          />
          <span>I understand that the root signs the capability, and I will review its limits before I sign.</span>
        </label>
        <Link href="/" className={`focus-ring inline-flex rounded-lg border px-4 py-2 text-sm ${confirmedRoot ? "border-gold text-gold" : "pointer-events-none border-white/[.08] opacity-50"}`} aria-disabled={!confirmedRoot}>
          Open the PQTABS app
        </Link>
      </StepCard>

      <StepCard index="4" title="Connect the MCP server" status={address ? "Config ready" : "Needs the address"}>
        <p>
          Put the signer path and the public agent address in the MCP environment. The MCP holds no key. It asks the local
          signer for one signature per payment. The published <code className="font-mono text-[12px] text-foreground">pqtabs-mcp</code> 0.1.1 does not yet
          read these variables. Use the repository build until the next npm release.
        </p>
        <CopyBlock label="MCP configuration (no key)" code={mcpConfigFor(address)} />
      </StepCard>

      <StepCard index="5" title="Test safely" status="Read-only first">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Call <code className="font-mono text-[12px] text-foreground">pqtabs_status</code>. It reads the backend and Arc, and spends nothing.
          </li>
          <li>
            Call <code className="font-mono text-[12px] text-foreground">pqtabs_check_spend_policy</code> for the capability and a
            task. It checks the quote against the capability and signs nothing.
          </li>
          <li>
            Only after you approve one specific payment, call <code className="font-mono text-[12px] text-foreground">pqtabs_run_paid_research</code>
            with <code className="font-mono text-[12px] text-foreground">confirmSpend</code> true and a{" "}
            <code className="font-mono text-[12px] text-foreground">maxPriceRaw</code>. It is never run automatically.
          </li>
        </ol>
      </StepCard>

      <StepCard index="6" title="Manage access" status="In the PQTABS app">
        <p>Each capability carries these limits. Change or close it in the app. Closing returns unspent USDC to the root.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            ["Scope", "What the agent may buy. Today: pqtabs-barkeep research only."],
            ["Expiry", "After this time the capability refuses every payment."],
            ["Cap", "The most the capability may spend in total."],
            ["Per-call limit", "The most it may pay in one payment."],
            ["Payee", "Only the approved recipients. Others are refused."],
            ["Balance", "The USDC left in the capability right now."],
            ["Revoke", "Close the capability. The agent can no longer spend."],
          ].map(([name, text]) => (
            <li key={name} className="rounded-lg border border-white/[.06] p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">{name}</p>
              <p className="mt-1 text-xs">{text}</p>
            </li>
          ))}
        </ul>
      </StepCard>

      <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6">
        <h3 className="font-display text-xl font-semibold tracking-tight">When a call is refused</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Each message says whether anything was signed or broadcast. A refusal before signing never moves money.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[.08]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-white/[.08] bg-white/[.02] font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Code</th>
                <th scope="col" className="px-4 py-3 font-normal">What it means</th>
                <th scope="col" className="px-4 py-3 font-normal">What to do</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_GUIDE.map((row) => (
                <tr key={row.code} className="border-b border-white/[.05] align-top last:border-b-0">
                  <td className="px-4 py-3 font-mono text-[12px] text-foreground">{row.code}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.meaning}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The backend&apos;s developer-session API is read-only. A session never authorizes a signature, a capability, or a
        payment. This page has no developer-session screen yet. Pairing a device is not implemented.
      </p>
    </div>
  );
}
