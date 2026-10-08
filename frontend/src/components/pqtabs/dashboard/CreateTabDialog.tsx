"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { isAddress, parseUsdcRaw } from "@/data/actions";
import { tabForReceipt } from "@/data/opened-tab";
import { lockRoot, rootUnlocked, signRootDigest, verifyingKey } from "@/data/pq-vault";
import { SecurityKeyUnlock } from "@/components/pqtabs/dashboard/SecurityKeyUnlock";
import { initials, relFuture, usd } from "@/data/formatters";
import { confirmRootSignature, loadSnapshot, prepareOpen, requestServicePrice, submitPrepared, type PreparedAction } from "@/data/production";
import { payeeLabel } from "@/data/x402-pay";
import { servicePayee } from "@/data/x402-pay";
import { browserHoldsAgentKey, createAgentKey } from "@/data/spend";
import type { Recipient, Tab } from "@/data/types";
import { useAgents, useDashboardUi, usePqtabsData, useRecipients, useTotals } from "@/lib/store";

/**
 * CreateTabDialog — the create-capability flow.
 *
 * A five-step stepper (agent → budget → rules → expiry → review) that ends in
 * a staged authorization sequence and a human-readable security summary. The
 * whole flow reads like a security decision, because it is one.
 *
 * The flow state lives in <CreateFlow />, which is mounted inside the dialog
 * content — Radix unmounts closed dialogs, so every open starts from a clean,
 * preset-aware baseline without reset effects.
 */

const MICRO = "font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground";
const BTN_GOLD = "bg-gold text-[#171204] shadow-none hover:bg-[#eec95e]";
const BTN_GHOST = "border border-white/10 bg-white/[.03] text-foreground shadow-none hover:bg-white/[.06]";

const STEP_META = [
  { label: "AGENT", title: "Who may spend?", sub: "Pick the agent that will hold this spending capability." },
  { label: "BUDGET", title: "How much may it spend?", sub: "Set a hard ceiling, then the most it can move in one payment." },
  { label: "RULES", title: "Where may it pay?", sub: "Approve the recipients this capability may pay. Everything else is rejected." },
  { label: "EXPIRY", title: "When does authority end?", sub: "Choose how long the agent keeps spending authority." },
  { label: "REVIEW", title: "What exactly are you approving?", sub: "Read the capability back before you open it." },
] as const;

const CAP_MIN = 0.01;
const CAP_SLIDER_MAX = 1;
const HOURS_MIN = 1;

function isSigningKey(value: string): boolean {
  const body = value.slice(0, 2).toLowerCase() === "0x" ? value.slice(2) : value;
  return /^[0-9a-fA-F]{64}$/.test(body);
}
const HOURS_MAX = 720;

const EXPIRY_PRESETS = [
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
] as const;

const CATEGORY_ORDER: Recipient["category"][] = [
  "Data",
  "Service",
  "Infrastructure",
  "Compute",
  "Monitoring",
  "Communications",
];

const CONFIRM_STAGES = [
  "Preparing capability",
  "Awaiting root authorization",
  "Opening capability",
  "Capability active",
] as const;

type Phase = "wizard" | "authorize" | "confirming" | "error";

/** Syncs a dollar-formatted value text onto the Radix slider thumb. */
function useSliderAnnouncement(
  ref: React.RefObject<HTMLDivElement | null>,
  label: string,
  valueText: string
) {
  useEffect(() => {
    const thumb = ref.current?.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) return;
    thumb.setAttribute("aria-label", label);
    thumb.setAttribute("aria-valuetext", valueText);
  }, [ref, label, valueText]);
}

export default function CreateTabDialog() {
  const createOpen = useDashboardUi((s) => s.createOpen);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);

  return (
    <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
      {/* Mounted only while the dialog is open — state resets between runs. */}
      {createOpen && <CreateFlow />}
    </Dialog>
  );
}

function CreateFlow() {
  const createPresetAgentId = useDashboardUi((s) => s.createPresetAgentId);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const setView = useDashboardUi((s) => s.setView);
  const agents = useAgents();
  const vaultEpoch = usePqtabsData((state) => state.agentVaultEpoch);
  const recipients = useRecipients();
  const totals = useTotals();
  const rootBalance = usePqtabsData((state) => state.snapshot.account.treasuryTotalUsd);
  const treasuryKey = usePqtabsData((state) => state.snapshot.account.pqVk);
  const portfolioReady = usePqtabsData((state) => state.portfolioReady);
  const available = Math.min(rootBalance, totals.availableUsd);

  const reduceMotion = useReducedMotion();

  // ----- flow state (fresh on every mount) -----------------------------------
  const [step, setStep] = useState(1);
  const [agentId, setAgentId] = useState<string | null>(createPresetAgentId);
  const [capInput, setCapInput] = useState("0.01");
  const [perCall, setPerCall] = useState(0.01);
  const [agentDraft, setAgentDraft] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentKeyError, setAgentKeyError] = useState("");
  const [agentNote, setAgentNote] = useState<string | null>(null);
  const [payeeDraft, setPayeeDraft] = useState("");
  const [payeeNote, setPayeeNote] = useState<string | null>(null);
  const [readingService, setReadingService] = useState(false);
  const [extraRecipients, setExtraRecipients] = useState<Recipient[]>([]);
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [keyReady, setKeyReady] = useState(() => rootUnlocked(usePqtabsData.getState().registrar));
  const [failure, setFailure] = useState("The capability was not opened.");
  const [recipientIds, setRecipientIds] = useState<Set<string>>(() => new Set());
  const [hours, setHours] = useState(24);
  const [customInput, setCustomInput] = useState("");
  const [ack, setAck] = useState(false);

  const [phase, setPhase] = useState<Phase>("wizard");
  const [stage, setStage] = useState(0);
  const [createdTab, setCreatedTab] = useState<Tab | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const agentRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const budgetSliderRef = useRef<HTMLDivElement | null>(null);
  const perCallSliderRef = useRef<HTMLDivElement | null>(null);

  // ----- derived --------------------------------------------------------------
  const eligibleAgents = useMemo(() => {
    void vaultEpoch;
    return agents.filter(
      (agent) => agent.status !== "revoked" && browserHoldsAgentKey(agent.id),
    );
  }, [agents, vaultEpoch]);
  const directory = useMemo(() => [...recipients, ...extraRecipients], [recipients, extraRecipients]);
  const typedAgent = isAddress(agentDraft) && browserHoldsAgentKey(agentDraft) ? agentDraft : null;
  const pastedWithoutKey = isAddress(agentDraft) && !browserHoldsAgentKey(agentDraft);
  const selectedAgent = typedAgent
    ? {
        id: typedAgent,
        name: `${typedAgent.slice(0, 6)}…${typedAgent.slice(-4)}`,
        address: typedAgent,
        status: "active" as const,
        role: "Entered for this capability",
        addedHoursAgo: 0,
        lastActiveHoursAgo: null,
      }
    : eligibleAgents.find((a) => a.id === agentId) ?? null;

  const cap = Number.parseFloat(capInput) || 0;
  const maxPerCall = Math.max(CAP_MIN, cap);
  const effectivePerCall = Math.min(perCall, maxPerCall);

  const capTooLow = cap < CAP_MIN;
  const capTooHigh = cap > available;
  const step2Valid = !capTooLow && !capTooHigh;

  const customActive = customInput.trim() !== "";
  const activePresetHours = customActive ? null : hours;
  const hoursValid = hours >= HOURS_MIN && hours <= HOURS_MAX;

  const succeeded = phase === "confirming" && stage >= CONFIRM_STAGES.length - 1 && createdTab !== null;

  const selectedRecipientNames = useMemo(
    () => directory.filter((r) => recipientIds.has(r.id)).map((r) => r.name),
    [directory, recipientIds]
  );

  const canProceed =
    phase !== "wizard"
      ? false
      : step === 1
        ? selectedAgent !== null
        : step === 2
          ? step2Valid
          : step === 3
            ? recipientIds.size > 0
            : step === 4
              ? hoursValid
              : ack;

  const hint =
    step === 1
      ? "Select an agent to continue"
      : step === 2
        ? capTooHigh
          ? "Not enough available funds"
          : "Enter a cap of at least 0.01 USDC"
        : step === 3
          ? "Approve at least one recipient"
          : step === 4
            ? "Set an expiry to continue"
            : "Confirm the acknowledgment";

  useSliderAnnouncement(
    budgetSliderRef,
    "Capability budget",
    usd(Math.min(Math.max(cap, CAP_MIN), CAP_SLIDER_MAX))
  );
  useSliderAnnouncement(perCallSliderRef, "Maximum per payment", usd(effectivePerCall));

  // ----- handlers ---------------------------------------------------------------
  const finishClose = () => setCreateOpen(false);

  const requestClose = () => {
    if (phase === "confirming" && !succeeded) return;
    if (phase === "wizard" && step > 1) {
      setDiscardOpen(true);
      return;
    }
    finishClose();
  };

  const guardClose = (e: { preventDefault: () => void }) => {
    if (phase === "confirming" && !succeeded) {
      e.preventDefault();
      return;
    }
    if (discardOpen) {
      e.preventDefault();
      return;
    }
    if (phase === "wizard" && step > 1) {
      e.preventDefault();
      setDiscardOpen(true);
    }
  };

  const goNext = () => {
    if (!canProceed) return;
    if (step === 2) setPerCall(effectivePerCall);
    if (step === 5) return;
    setStep((s) => Math.min(5, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const startCreation = () => {
    if (!selectedAgent || !step2Valid || recipientIds.size === 0 || !hoursValid) return;
    const live = usePqtabsData.getState();
    const root = live.snapshot.account.rootAddress;
    if (!live.registrar || !root) {
      setFailure("This registrar has no root on the factory, so there is nothing to authorize.");
      setPhase("error");
      return;
    }
    const payees = directory.filter((item) => recipientIds.has(item.id)).map((item) => item.address);
    setPhase("authorize");
    setPrepared(null);
    setCreatedTab(null);
    prepareOpen({
      root,
      agent: selectedAgent.address,
      payees,
      capRaw: parseUsdcRaw(capInput),
      maxPerCallRaw: parseUsdcRaw(effectivePerCall.toFixed(6)),
      hours,
    })
      .then(setPrepared)
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : "The action could not be prepared.");
        setPhase("error");
      });
  };

  const submitCreation = (signed: string) => {
    if (!prepared || !selectedAgent) return;
    setPhase("confirming");
    setStage(2);
    const registrar = usePqtabsData.getState().registrar;
    submitPrepared(registrar, prepared, signed)
      .then(async ({ hash, snapshot }) => {
        if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) {
          throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
        }
        let current = snapshot;
        let tab = tabForReceipt(current.tabs, hash);
        for (let attempt = 0; attempt < 4 && !tab; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) {
            throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
          }
          current = await loadSnapshot(registrar);
          tab = tabForReceipt(current.tabs, hash);
        }
        if (!tab) {
          throw new Error(`Arc included ${hash}. The portfolio has not listed that capability yet. Refresh before opening another one.`);
        }
        usePqtabsData.getState().acceptPortfolio(current);
        setCreatedTab(tab);
        setStage(4);
      })
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : "The chain rejected this capability.");
        setPhase("error");
      });
  };

  const handleCapInput = (raw: string) => {
    let v = raw.replace(/[^0-9.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) {
      const frac = v.slice(dot + 1).replace(/\./g, "").slice(0, 6);
      v = v.slice(0, dot + 1) + frac;
    }
    setCapInput(v);
  };

  const handleCustomHours = (raw: string) => {
    const v = raw.replace(/[^0-9]/g, "").slice(0, 4);
    setCustomInput(v);
    const parsed = Number.parseInt(v, 10);
    if (!Number.isNaN(parsed) && parsed > 0) setHours(parsed);
  };

  const toggleRecipient = (id: string, on: boolean) => {
    setRecipientIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAgent = (id: string, index: number) => {
    setAgentId(id);
    agentRefs.current[index]?.focus();
  };

  const handleAgentGroupKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const count = eligibleAgents.length;
    if (count === 0) return;
    const current = eligibleAgents.findIndex((a) => a.id === agentId);
    let next: number;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = current < 0 ? 0 : (current + 1) % count;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = current < 0 ? count - 1 : (current - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    selectAgent(eligibleAgents[next].id, next);
  };

  /** Enter advances the flow when typed into a free-text input. */
  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (phase !== "wizard" || e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    e.preventDefault();
    if (step < 5 && canProceed) goNext();
    else if (step === 5 && ack) startCreation();
  };

  // ----- per-phase header text ---------------------------------------------------
  const inWizard = phase === "wizard";
  // During an error the stepper still reflects the wizard position.
  const stepperLive = phase === "wizard" || phase === "error";
  const title = succeeded
    ? "Capability active"
    : phase === "authorize"
      ? "Authorize capability"
      : phase === "confirming"
        ? "Submitting to Arc"
        : phase === "error"
          ? failure.includes("Arc accepted")
            ? "Arc accepted the signature"
            : "Couldn’t create this capability"
          : STEP_META[step - 1].title;
  const description = succeeded
    ? "Arc accepted the signature and the capability is in this root's portfolio."
    : phase === "authorize"
      ? "Use the security-key backup you downloaded when you created this treasury."
      : phase === "confirming"
        ? "Waiting for the transaction receipt."
        : phase === "error"
          ? failure.includes("Arc accepted")
            ? "The receipt is on Arc. Refresh the portfolio before opening another capability."
            : "This page did not mark the capability open."
          : STEP_META[step - 1].sub;

  return (
    <>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={guardClose}
        onInteractOutside={guardClose}
        className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-xl border-white/[.08] bg-[#0e1013] p-0 sm:max-w-lg"
      >
        {/* Header */}
        <div className="relative shrink-0 px-6 pt-6 pb-4">
          <p className={cn(MICRO, "text-gold")}>New capability</p>
          <DialogTitle className="mt-1.5 pr-10 font-display text-xl font-semibold tracking-tight text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
          {!(phase === "confirming" && !succeeded) && (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Stepper */}
        <div className="shrink-0 px-6 pb-4" aria-hidden="true">
          <div className="flex gap-1.5">
            {STEP_META.map((s, i) => {
              const done = !stepperLive || i < step - 1;
              const current = stepperLive && i === step - 1;
              return (
                <div
                  key={s.label}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-200",
                    done ? "bg-gold" : current ? "animate-pulse bg-gold/60" : "bg-white/10"
                  )}
                />
              );
            })}
          </div>
          <div className="mt-2 hidden grid-cols-5 gap-1.5 sm:grid">
            {STEP_META.map((s, i) => (
              <span
                key={s.label}
                className={cn(
                  "text-center font-mono text-[9px] uppercase tracking-[0.14em]",
                  stepperLive && i === step - 1 ? "text-gold" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            ))}
          </div>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-gold sm:hidden">
            {stepperLive ? STEP_META[step - 1].label : "Complete"}
          </p>
        </div>

        {/* Body */}
        <div
          onKeyDown={handleBodyKeyDown}
          className="min-h-[240px] flex-1 overflow-y-auto scrollbar-thin px-6 py-2"
        >
          {inWizard && step === 1 && (
            <div
              key="step-1"
              role="radiogroup"
              aria-label="Choose agent"
              onKeyDown={handleAgentGroupKeyDown}
              className="animate-in fade-in slide-in-from-bottom-1 space-y-2 duration-200"
            >
              <div className="rounded-xl border border-white/[.07] bg-white/[.015] p-3">
                <p className={MICRO}>Create an agent</p>
                <Input
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                  placeholder="Research Agent"
                  aria-label="Agent name"
                  className="mt-2 border-white/10 bg-transparent text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(BTN_GHOST, "mt-2 h-8")}
                  disabled={!agentName.trim()}
                  onClick={() => {
                    const name = agentName.trim();
                    if (!name) return;
                    setAgentKeyError("");
                    void createAgentKey()
                      .then((created) => {
                      usePqtabsData.getState().addLocalAgent({
                        id: created.address,
                        name,
                        address: created.address,
                        status: "active",
                        role: "This browser holds the encrypted signing key. No treasury access until you give it a capability.",
                        addedHoursAgo: 0,
                        lastActiveHoursAgo: null,
                      });
                      setAgentId(created.address);
                      setAgentDraft("");
                      setAgentName("");
                      })
                      .catch((error: unknown) => {
                        setAgentKeyError(error instanceof Error ? error.message : "This browser could not store the agent key.");
                      });
                  }}
                >
                  Create agent
                </Button>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  The signing key is encrypted in this browser and is not shown. This agent can pay after a reload. It cannot pay from another device unless you export an encrypted backup.
                </p>
                {agentKeyError ? <p className="mt-2 text-xs text-danger">{agentKeyError}</p> : null}
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Use an agent already on this device</summary>
                  <Input
                    value={agentDraft}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      if (isSigningKey(value)) {
                        setAgentDraft("");
                        setAgentId(null);
                        setAgentNote("Paste the agent address. This screen does not take a signing key.");
                        return;
                      }
                      setAgentNote(null);
                      setAgentDraft(value);
                      setAgentId(null);
                    }}
                    placeholder="0x…"
                    spellCheck={false}
                    aria-label="Existing agent address"
                    className="mt-2 border-white/10 bg-transparent font-mono text-xs"
                  />
                  {agentNote && <p className="mt-2 text-xs text-danger">{agentNote}</p>}
                  {pastedWithoutKey && (
                    <p className="mt-2 text-xs text-danger">
                      This browser does not hold that agent&apos;s encrypted key. Create one here, or restore its backup, before opening a capability.
                    </p>
                  )}
                </details>
              </div>
              {eligibleAgents.map((a, idx) => {
                const selected = a.id === agentId;
                return (
                  <button
                    key={a.id}
                    ref={(el) => {
                      agentRefs.current[idx] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : !agentId && idx === 0 ? 0 : -1}
                    onClick={() => {
                      setAgentId(a.id);
                      setAgentDraft("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-gold/50 bg-gold/[.06]"
                        : "border-white/[.07] bg-white/[.015] hover:bg-white/[.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-display text-sm font-semibold",
                        selected
                          ? "border-gold/40 bg-gold/[.08] text-gold"
                          : "border-white/[.08] bg-white/[.03] text-foreground"
                      )}
                    >
                      {initials(a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {a.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.role}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                        {a.address}
                      </span>
                    </span>
                    {selected && <Check className="size-4 shrink-0 text-gold" />}
                  </button>
                );
              })}
              {eligibleAgents.length === 0 && (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  No agent is enrolled yet. Name one above. It has no treasury access until this capability is authorized.
                </p>
              )}
            </div>
          )}

          {inWizard && step === 2 && (
            <div key="step-2" className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-lg font-semibold tracking-tight text-muted-foreground">
                  USDC
                </span>
                <input
                  value={capInput}
                  onChange={(e) => handleCapInput(e.target.value)}
                  inputMode="decimal"
                  aria-label="Capability budget in USDC"
                  placeholder="0"
                  className="w-full min-w-0 bg-transparent font-display text-4xl font-semibold tracking-tight text-foreground tabular outline-none placeholder:text-white/20"
                />
              </div>
              <div
                ref={budgetSliderRef}
                className="mt-6 [&_[data-slot=slider-track]]:bg-white/[.07]"
              >
                <Slider
                  value={[Math.min(Math.max(cap, CAP_MIN), CAP_SLIDER_MAX)]}
                  min={CAP_MIN}
                  max={CAP_SLIDER_MAX}
                  step={0.01}
                  aria-label="Capability budget"
                  onValueChange={([v]) => setCapInput(v.toFixed(2))}
                />
              </div>
              {capTooHigh && (
                <p aria-live="polite" className="mt-3 text-xs text-danger">
                  Only {usd(available)} is root cash.
                </p>
              )}
              {!capTooHigh && capTooLow && (
                <p aria-live="polite" className="mt-3 text-xs text-danger">
                  Set a cap of at least 0.01 USDC.
                </p>
              )}

              <div className="mt-9">
                <p className={MICRO}>Max per payment</p>
                <div className="mt-3 flex items-baseline justify-between gap-4">
                  <p className="text-sm text-foreground">How much in one payment?</p>
                  <p className="font-mono text-sm tabular text-gold">{usd(effectivePerCall)}</p>
                </div>
                <div
                  ref={perCallSliderRef}
                  className="mt-4 [&_[data-slot=slider-track]]:bg-white/[.07]"
                >
                  <Slider
                    value={[effectivePerCall]}
                    min={CAP_MIN}
                    max={Math.max(CAP_MIN, cap || CAP_MIN)}
                    step={0.01}
                    aria-label="Maximum per payment"
                    onValueChange={([v]) => setPerCall(v)}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The most this agent can move in a single payment. It cannot exceed the cap.
                </p>
              </div>

              {step2Valid && selectedAgent && (
                <p className="mt-6 font-mono text-xs leading-relaxed text-muted-foreground">
                  {selectedAgent.name} can spend up to{" "}
                  <span className="tabular text-foreground">{usd(cap)}</span> total,{" "}
                  <span className="tabular text-foreground">{usd(effectivePerCall)}</span> at a
                  time.
                </p>
              )}
            </div>
          )}

          {inWizard && step === 3 && (
            <div key="step-3" className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="flex items-center justify-between gap-3">
                <p className={MICRO}>Approved recipients</p>
                <p
                  className={cn(
                    "font-mono text-xs tabular",
                    recipientIds.size > 0 ? "text-gold" : "text-muted-foreground"
                  )}
                >
                  {recipientIds.size} approved {recipientIds.size === 1 ? "recipient" : "recipients"}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  value={payeeDraft}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    if (isSigningKey(value)) {
                      setPayeeDraft("");
                      setPayeeNote("Paste a recipient address. This screen does not take a signing key.");
                      return;
                    }
                    setPayeeNote(null);
                    setPayeeDraft(value);
                  }}
                  placeholder="Recipient address"
                  spellCheck={false}
                  aria-label="Recipient address"
                  className="border-white/10 bg-transparent font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={BTN_GHOST}
                  disabled={!isAddress(payeeDraft)}
                  onClick={() => {
                    const address = payeeDraft;
                    const recipient: Recipient = {
                      id: address,
                      name: `${address.slice(0, 6)}…${address.slice(-4)}`,
                      address,
                      category: "Infrastructure",
                    };
                    setExtraRecipients((current) =>
                      current.some((item) => item.id.toLowerCase() === address.toLowerCase())
                        ? current
                        : [...current, recipient],
                    );
                    setRecipientIds((current) => new Set(current).add(address));
                    setPayeeDraft("");
                  }}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={BTN_GHOST}
                  disabled={readingService}
                  onClick={() => {
                    setReadingService(true);
                    setPayeeNote(null);
                    void requestServicePrice("Summarize what Arc mainnet settlement means for an agent payment.")
                      .then((payload) => {
                        const address = servicePayee(payload);
                        if (!address) throw new Error("The service did not name an Arc recipient. Nothing was added.");
                        const label = payeeLabel(address);
                        const recipient: Recipient = {
                          id: address,
                          name: label.category === "Service" ? label.name : "Paid service",
                          address,
                          category: label.category,
                        };
                        setExtraRecipients((current) =>
                          current.some((item) => item.id.toLowerCase() === address.toLowerCase()) ? current : [...current, recipient],
                        );
                        setRecipientIds((current) => new Set(current).add(address));
                      })
                      .catch((error: unknown) => {
                        setPayeeNote(error instanceof Error ? error.message : "The service recipient was not read.");
                      })
                      .finally(() => setReadingService(false));
                  }}
                >
                  {readingService ? <Loader2 className="size-4 animate-spin" /> : "Use the service recipient"}
                </Button>
              </div>
              {payeeNote && <p className="mt-2 text-xs text-danger">{payeeNote}</p>}
              <div className="mt-4 space-y-5">
                {CATEGORY_ORDER.map((category) => {
                  const group = directory.filter((r) => r.category === category);
                  if (group.length === 0) return null;
                  return (
                    <div key={category}>
                      <p className={cn(MICRO, "tracking-[0.16em]")}>{category}</p>
                      <div className="mt-2 space-y-1.5">
                        {group.map((r) => {
                          const selected = recipientIds.has(r.id);
                          return (
                            <label
                              key={r.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                                selected
                                  ? "border-gold/40 bg-gold/[.04]"
                                  : "border-white/[.06] bg-white/[.015] hover:bg-white/[.04]"
                              )}
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(c) => toggleRecipient(r.id, c === true)}
                                aria-label={`Approve ${r.name}`}
                                className={selected ? "border-gold/50" : undefined}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-foreground">
                                  {r.name}
                                </span>
                                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                                  {r.address}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                Payments outside this list are rejected automatically.
              </p>
            </div>
          )}

          {inWizard && step === 4 && (
            <div key="step-4" className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="flex flex-wrap gap-2">
                {EXPIRY_PRESETS.map((p) => {
                  const active = activePresetHours === p.hours;
                  return (
                    <button
                      key={p.hours}
                      type="button"
                      onClick={() => {
                        setHours(p.hours);
                        setCustomInput("");
                      }}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-gold/60 bg-gold/[.07] text-gold"
                          : "border-white/[.08] bg-white/[.015] text-muted-foreground hover:bg-white/[.05] hover:text-foreground"
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                <label
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3.5 py-2 transition-colors",
                    customActive ? "border-gold/60 bg-gold/[.07]" : "border-white/[.08] bg-white/[.015]"
                  )}
                >
                  <span className={cn(MICRO, "tracking-[0.14em]")}>Custom</span>
                  <input
                    value={customInput}
                    onChange={(e) => handleCustomHours(e.target.value)}
                    inputMode="numeric"
                    aria-label="Custom expiry in hours"
                    placeholder="—"
                    className="w-14 border-0 bg-transparent p-0 text-center font-mono text-sm tabular text-foreground outline-none placeholder:text-white/20 focus-visible:outline-none"
                  />
                  <span className="text-xs text-muted-foreground">hours</span>
                </label>
              </div>

              {customActive && !hoursValid && (
                <p aria-live="polite" className="mt-4 text-xs text-danger">
                  Choose an expiry between 1 and 720 hours.
                </p>
              )}

              <div className="mt-6 rounded-lg border border-white/[.06] bg-white/[.015] p-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  When it expires, the agent can no longer spend. The remaining USDC stays in the
                  capability until someone reclaims it to root cash. That reclaim does not need
                  your security key. A close before expiry does.
                </p>
              </div>

              {hoursValid && (
                <p className="mt-5">
                  <span className="inline-flex items-center rounded-full border border-gold/25 bg-gold/[.06] px-3 py-1 font-mono text-xs text-gold">
                    Lasts {hours} {hours === 1 ? "hour" : "hours"} after Arc includes it
                  </span>
                </p>
              )}
            </div>
          )}

          {inWizard && step === 5 && selectedAgent && (
            <div key="step-5" className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              <blockquote className="border-l-2 border-gold/70 pl-4 font-display text-lg leading-relaxed text-foreground">
                “This capability allows {selectedAgent.name} to spend up to{" "}
                <span className="tabular text-gold">{usd(cap)}</span>, with no payment above{" "}
                <span className="tabular text-gold">{usd(effectivePerCall)}</span>, to{" "}
                {recipientIds.size === 1 ? "this recipient" : "these recipients"}, for{" "}
                {hours} {hours === 1 ? "hour" : "hours"} after Arc includes it.”
              </blockquote>

              <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
                <div>
                  <dt className={MICRO}>Agent</dt>
                  <dd className="mt-1.5 text-sm text-foreground">{selectedAgent.name}</dd>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <dt className={MICRO}>Agent address</dt>
                  <dd className="mt-1.5 break-all font-mono text-[10px] text-foreground">{selectedAgent.address}</dd>
                </div>
                <div>
                  <dt className={MICRO}>Total cap</dt>
                  <dd className="mt-1.5 font-display text-sm tabular text-foreground">
                    {usd(cap)}
                  </dd>
                </div>
                <div>
                  <dt className={MICRO}>Max per payment</dt>
                  <dd className="mt-1.5 font-display text-sm tabular text-foreground">
                    {usd(effectivePerCall)}
                  </dd>
                </div>
                <div>
                  <dt className={MICRO}>Allowed recipient</dt>
                  <dd className="mt-1.5 text-sm text-foreground">
                    {recipientIds.size === 1 ? selectedRecipientNames[0] : `${recipientIds.size} approved`}
                  </dd>
                </div>
                <div>
                  <dt className={MICRO}>Expiry</dt>
                  <dd className="mt-1.5 font-mono text-xs text-gold">
                    {hours} {hours === 1 ? "hour" : "hours"} after Arc includes it
                  </dd>
                </div>
              </dl>
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {selectedRecipientNames.join(" · ")}
              </p>

              <dl className="mt-6 divide-y divide-white/[.06] rounded-lg border border-white/[.06] bg-white/[.015]">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Root cash</dt>
                  <dd className="font-mono text-sm tabular text-foreground">{usd(rootBalance)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Capability balance</dt>
                  <dd className="font-mono text-sm tabular text-gold">{usd(cap)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Root cash after open</dt>
                  <dd className="font-mono text-sm tabular text-foreground">{usd(Math.max(0, rootBalance - cap))}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Open exposure after this</dt>
                  <dd className="font-mono text-sm tabular text-foreground">{usd(totals.allocatedUsd + cap)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Exposure room left</dt>
                  <dd className="font-mono text-sm tabular text-foreground">{usd(Math.max(0, totals.availableUsd - cap))}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {portfolioReady
                  ? `Agents can already reach ${usd(totals.exposureUsd)}. This grant adds ${usd(cap)}.`
                  : `Existing agent reach is not loaded yet. This grant adds ${usd(cap)}.`}
              </p>

              <div className="mt-5 rounded-lg border border-white/[.06] bg-white/[.015] p-4">
                <p className={MICRO}>What the agent cannot reach</p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <li>Your agent cannot access the rest of your wallet or root cash.</li>
                  <li>Every spend remains inside this capability&apos;s rules.</li>
                  <li>Root authority remains protected by PQ authorization.</li>
                </ul>
              </div>

              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-white/[.06] bg-white/[.015] p-3.5 transition-colors hover:bg-white/[.03]">
                <Checkbox
                  checked={ack}
                  onCheckedChange={(c) => setAck(c === true)}
                  aria-label="Acknowledge spending authority"
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed text-muted-foreground">
                  I understand this agent can spend up to{" "}
                  <span className="text-foreground">{usd(cap)}</span> without further approvals.
                </span>
              </label>
            </div>
          )}

          {phase === "authorize" && (
            <div className="space-y-3 py-2">
              {prepared ? (
                <>
                  <SecurityKeyUnlock onReady={setKeyReady} />
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Technical details</summary>
                    <p className="mt-2 font-mono text-[10px]">chainId 5042</p>
                    <p className="mt-2 font-mono text-[10px]">nonce {prepared.nonce}</p>
                    <p className="mt-2 font-mono text-[10px]">precompile 0x1800000000000000000000000000000000000004</p>
                    {treasuryKey && <p className="mt-2 break-all font-mono text-[10px]">verifying key {treasuryKey}</p>}
                    <p className="mt-2 break-all font-mono text-[10px]">digest {prepared.digest}</p>
                  </details>
                </>
              ) : (
                <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Preparing the exact action from the current nonce.
                </p>
              )}
            </div>
          )}

          {phase === "confirming" && !succeeded && (
            <ul key="confirming" role="status" aria-live="polite" className="space-y-4 py-6">
              {CONFIRM_STAGES.map((label, i) => {
                const done = i < stage;
                const active = i === stage;
                return (
                  <li key={label} className="flex items-center gap-3">
                    {done ? (
                      <Check className="size-4 shrink-0 text-gold" />
                    ) : active ? (
                      i === CONFIRM_STAGES.length - 1 ? (
                        <Check className="size-4 shrink-0 text-gold" />
                      ) : i === 1 ? (
                        <Lock className="size-4 shrink-0 text-gold" />
                      ) : (
                        <Loader2 className="size-4 shrink-0 animate-spin text-gold" />
                      )
                    ) : (
                      <span className="block size-4 shrink-0 rounded-full border border-white/[.14]" />
                    )}
                    <span
                      className={cn(
                        "font-mono text-xs uppercase tracking-[0.14em]",
                        done || active ? "text-foreground" : "text-muted-foreground/60"
                      )}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {succeeded && createdTab && selectedAgent && (
            <div key="success" className="flex flex-col items-center py-6 text-center">
              <motion.div
                initial={reduceMotion ? undefined : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 22 }
                }
                className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold"
              >
                <Check className="size-8" strokeWidth={2.5} />
              </motion.div>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-foreground">
                Capability {createdTab.reference} is active
              </h3>
              <p className="mt-2.5">
                <span className="inline-flex items-center rounded-full border border-gold/25 bg-gold/[.06] px-3 py-1 font-mono text-xs text-gold">
                  {createdTab.reference}
                </span>
              </p>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {selectedAgent.name} can spend up to {usd(cap)} —{" "}
                {createdTab.policy.expiresInHours > 0
                  ? `expires ${relFuture(createdTab.policy.expiresInHours)} on Arc's clock.`
                  : `lasts ${hours} ${hours === 1 ? "hour" : "hours"} after Arc included it.`}
              </p>
            </div>
          )}

          {phase === "error" && (
            <div key="error" className="flex flex-col items-center py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-danger/25 bg-danger/10 text-danger">
                <CircleAlert className="size-6" />
              </div>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">{failure}</p>
              <div className="mt-6 flex items-center gap-2">
                <Button variant="ghost" className={BTN_GHOST} onClick={finishClose}>
                  Cancel
                </Button>
                {!failure.includes("Arc included") && (
                  <Button className={BTN_GOLD} onClick={startCreation}>
                    Try again
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {inWizard && (
          <div className="shrink-0 border-t border-white/[.06] bg-[#0e1013] px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              {step > 1 ? (
                <Button variant="ghost" className={BTN_GHOST} onClick={goBack}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
              ) : (
                <Button variant="ghost" className={BTN_GHOST} onClick={requestClose}>
                  Cancel
                </Button>
              )}
              <div className="flex items-center gap-3">
                {!canProceed && (
                  <span className="hidden max-w-[190px] truncate text-xs text-muted-foreground sm:block">
                    {hint}
                  </span>
                )}
                {step < 5 ? (
                  <Button className={BTN_GOLD} disabled={!canProceed} onClick={goNext}>
                    Next <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button className={BTN_GOLD} disabled={!ack} onClick={startCreation}>
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === "authorize" && (
          <div className="shrink-0 border-t border-white/[.06] bg-[#0e1013] px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" className={BTN_GHOST} onClick={() => setPhase("wizard")}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button
                className={BTN_GOLD}
                disabled={!prepared || authorizing || !keyReady}
                onClick={() => {
                  if (!prepared) return;
                  const live = usePqtabsData.getState();
                  if (!live.snapshot.account.rootAddress || live.snapshot.account.rootAddress.toLowerCase() !== prepared.root.toLowerCase()) {
                    setFailure("The wallet changed. Nothing was signed.");
                    setPhase("error");
                    return;
                  }
                  setAuthorizing(true);
                  void confirmRootSignature(prepared, verifyingKey(live.registrar))
                    .then(() => signRootDigest(live.registrar, prepared.digest))
                    .then((signed) => submitCreation(signed))
                    .catch((reason: unknown) => {
                      const message = reason instanceof Error ? reason.message : "The security key could not authorize this.";
                      if (message.includes("older security key")) {
                        lockRoot();
                        setKeyReady(false);
                      }
                      setFailure(message);
                      setPhase("error");
                    })
                    .finally(() => setAuthorizing(false));
                }}
              >
                {authorizing ? "Authorizing" : "Authorize capability"}
              </Button>
            </div>
          </div>
        )}

        {phase === "confirming" && !succeeded && (
          <div className="shrink-0 border-t border-white/[.06] px-6 py-4">
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Waiting for the Arc receipt
            </p>
          </div>
        )}

        {succeeded && (
          <div className="shrink-0 border-t border-white/[.06] bg-[#0e1013] px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" className={BTN_GHOST} onClick={finishClose}>
                Done
              </Button>
              <Button
                className={BTN_GOLD}
                onClick={() => {
                  setView("tabs");
                  finishClose();
                }}
              >
                View capabilities <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Discard confirmation */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="rounded-xl border-white/[.08] bg-[#0e1013]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-tight">
              Discard this capability?
            </AlertDialogTitle>
            <AlertDialogDescription>Your inputs will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_GHOST}>Keep editing</AlertDialogCancel>
            <AlertDialogAction className={BTN_GOLD} onClick={finishClose}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
