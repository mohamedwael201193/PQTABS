"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip } from "@/components/pqtabs/shared";
import { relFuture, usd } from "@/data/formatters";
import { isAddress } from "@/data/actions";
import { decisionRecord, paymentReasonSentence, settledDecision, type DecisionFacts, type DecisionRecord, type QuotedDecision } from "@/data/decision-record";
import { saveDecision } from "@/data/decision-store";
import { arcClock, BACKEND_URL, describeReturn, decideServicePrice, loadSnapshot, prepareClose, productionProvider, requestServicePrice, SERVICE_URL, settleService, submitPrepared, type PreparedAction, type ServiceDecision } from "@/data/production";
import { probeAmount, probePayment, probeRefusal, replayRefusal, spentAuthorization, UNAVAILABLE_SERVICE_URL, unavailableServiceRefusal, type ProbeName } from "@/data/refusal-probe";
import { agentAddress, authorizationBlob, recallAgentKey, USDC } from "@/data/spend";
import { arcClient } from "@/data/wallet";
import { generatePrivateKey } from "viem/accounts";
import { agentCanSign, chainExpirySeconds, paymentDeadline, serviceTimeoutSeconds } from "@/data/x402-pay";
import { backupMatchesRoot, backupRefusal } from "@/data/pq-key-match";
import { lockRoot, rootUnlocked, signRootDigest, verifyingKey } from "@/data/pq-vault";
import { SecurityKeyUnlock } from "@/components/pqtabs/dashboard/SecurityKeyUnlock";
import { PaymentDecision } from "@/components/pqtabs/dashboard/PaymentDecision";
import type { Tab } from "@/data/types";
import { useActivity, useAgents, useDashboardUi, usePqtabsData, useRecipients, useTabs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ActivityRow } from "./shared/ActivityRow";

const SHEET_CLASS =
  "w-full gap-0 border-l border-white/[.08] bg-[#0a0b0d] p-0 sm:w-[480px] sm:max-w-[480px]";

function quotedDecision(value: string): QuotedDecision {
  if (value === "ALLOW" || value === "REFUSE" || value === "NO_PAYMENT") return value;
  return "REFUSE";
}

function decisionFacts(task: string, registrar: string, decision: ServiceDecision): DecisionFacts {
  return {
    task,
    service: SERVICE_URL,
    resource: decision.resource,
    price: decision.price,
    asset: decision.asset,
    network: decision.network,
    payee: decision.payee,
    agent: decision.agent,
    capability: decision.capability,
    remaining_capability_balance: decision.remaining_capability_balance,
    maxPerCall: decision.maxPerCall,
    root_exposure: decision.root_exposure,
    maxOpenExposure: decision.maxOpenExposure,
    expiry: decision.expiry,
    decision: quotedDecision(decision.decision),
    reason: decision.reason,
    registrar,
  };
}

/**
 * TabDrawer — the full anatomy of one capability: holder, balance against
 * cap, the four bounding policy numbers, who it may pay, its ledger, and
 * the explicit can / can-never boundary. Close and reclaim are real
 * provider mutations with confirmations.
 */
export default function TabDrawer() {
  const drawer = useDashboardUi((s) => s.drawer);
  const closeDrawer = useDashboardUi((s) => s.closeDrawer);
  const tabs = useTabs();

  const open = drawer?.type === "tab";
  const liveTab = drawer?.type === "tab" ? tabs.find((t) => t.id === drawer.id) ?? null : null;

  // Freeze the last capability so the sheet keeps its content while it
  // animates out after a close or drawer switch.
  const frozenRef = useRef<Tab | null>(null);
  if (liveTab) frozenRef.current = liveTab;
  const tab = liveTab ?? (open ? null : frozenRef.current);

  const [closing, setClosing] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);

  const liveId = liveTab?.id ?? null;
  useEffect(() => {
    setClosing(false);
    setReclaiming(false);
  }, [liveId]);

  // If the capability disappears while its drawer is open, close gracefully.
  useEffect(() => {
    if (open && !liveTab) closeDrawer();
  }, [open, liveTab, closeDrawer]);

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  async function handleClose(prepared: PreparedAction, signature: string) {
    if (!liveTab) return;
    setClosing(true);
    try {
      const registrar = usePqtabsData.getState().registrar;
      const { snapshot } = await submitPrepared(registrar, prepared, signature);
      const now = usePqtabsData.getState();
      if (now.registrar.toLowerCase() !== registrar.toLowerCase()) {
        throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
      }
      const row = snapshot.tabs.find((item) => item.id.toLowerCase() === liveTab.id.toLowerCase());
      if (!row || row.status !== "closed") {
        throw new Error("Arc did not show this capability as closed.");
      }
      now.acceptPortfolio(snapshot);
      if (row.needsSweep || row.balanceUsd > 0) {
        toast.message("The capability is closed. USDC is still on it until Return funds succeeds.");
      } else {
        toast.success("Close confirmed on Arc. The remaining USDC is back in the treasury.");
      }
      closeDrawer();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't close this capability.");
    } finally {
      setClosing(false);
    }
  }

  async function handleReclaim() {
    if (!liveTab) return;
    setReclaiming(true);
    try {
      const store = usePqtabsData.getState();
      const root = store.snapshot.account.rootAddress;
      if (!root || !store.registrar) throw new Error("The wallet changed. Nothing was submitted.");
      await productionProvider.reclaimCapability(root, liveTab.id);
      if (usePqtabsData.getState().registrar.toLowerCase() !== store.registrar.toLowerCase()) {
        throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
      }
      const snapshot = await loadSnapshot(store.registrar);
      const row = snapshot.tabs.find((item) => item.id.toLowerCase() === liveTab.id.toLowerCase());
      const outcome = describeReturn("reclaim", row, liveTab.balanceUsd);
      if (usePqtabsData.getState().registrar.toLowerCase() !== store.registrar.toLowerCase()) {
        throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
      }
      if (!outcome.settled) throw new Error(outcome.message);
      usePqtabsData.getState().acceptPortfolio(snapshot);
      if (outcome.leftover) toast.message(outcome.message);
      else toast.success(outcome.message);
      closeDrawer();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't reclaim this capability.");
    } finally {
      setReclaiming(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeDrawer()}>
      <SheetContent side="right" className={SHEET_CLASS}>
        {tab ? (
          <TabDrawerBody
            tab={tab}
            closing={closing}
            reclaiming={reclaiming}
            onClose={handleClose}
            onReclaim={handleReclaim}
            onCopy={copyText}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TabDrawerBody({
  tab,
  closing,
  reclaiming,
  onClose,
  onReclaim,
  onCopy,
}: {
  tab: Tab;
  closing: boolean;
  reclaiming: boolean;
  onClose: (prepared: PreparedAction, signature: string) => void;
  onReclaim: () => void;
  onCopy: (text: string, message: string) => void;
}) {
  const agents = useAgents();
  const recipients = useRecipients();
  const activity = useActivity();
  const [closePrep, setClosePrep] = useState<PreparedAction | null>(null);
  const [task, setTask] = useState("Summarize what Arc mainnet settlement means for an agent payment.");
  const [closingSig, setClosingSig] = useState(false);
  const [closeReady, setCloseReady] = useState(() => rootUnlocked(usePqtabsData.getState().registrar));
  const [paying, setPaying] = useState(false);
  const [payLog, setPayLog] = useState<string[]>([]);
  const [shownDecision, setShownDecision] = useState<DecisionRecord | null>(null);
  const payLock = useRef(false);

  async function runBlockedCheck(name: ProbeName | "malformed_signature") {
    if (!tab || payLock.current) return;
    const registrar = usePqtabsData.getState().registrar;
    const payee = tab.policy.allowedRecipients.find((item) => isAddress(item));
    const max = tab.maxPerCallRaw ?? "";
    const balance = tab.balanceRaw ?? "";
    if (!registrar || !payee) {
      toast.error("The capability could not be read. Nothing was signed.");
      return;
    }
    const labels: Record<ProbeName | "malformed_signature", string> = {
      wrong_payee: "Check: wrong recipient",
      above_per_payment: "Check: price above the per-payment limit",
      above_balance: "Check: price above the remaining balance",
      wrong_network: "Check: wrong network",
      malformed_signature: "Check: malformed signature",
    };
    const amount = name === "malformed_signature" ? "1" : probeAmount(name, max, balance);
    if (!amount) {
      toast.error("The remaining balance is not below the per-payment limit, so that case is not separate. Nothing was signed.");
      return;
    }
    payLock.current = true;
    setPaying(true);
    setPayLog([labels[name]]);
    try {
      const response = name === "malformed_signature"
        ? await fetch(`${BACKEND_URL}/v1/relay/spend`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tab: tab.id,
              to: payee,
              value: "1",
              validAfter: "0",
              validBefore: "1",
              nonce: `0x${"00".repeat(32)}`,
              signature: "0x11",
            }),
          })
        : await fetch(`${BACKEND_URL}/v1/x402/decide`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tab: tab.id, paymentRequired: probePayment(name, payee, amount) }),
          });
      const payload = (await response.json().catch(() => null)) as (ServiceDecision & { hash?: string; error?: string; detail?: string }) | null;
      if (response.status === 429 || payload?.error === "rate_limited") {
        throw new Error("Network reads are busy. Nothing was signed. Nothing was broadcast.");
      }
      const outcome = probeRefusal(response.status, payload);
      if (!outcome || !payload) {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      const text = (value: unknown, fallback: string) => (typeof value === "string" && value ? value : fallback);
      const facts: DecisionFacts = {
        task: labels[name],
        service: "Policy check",
        resource: text(payload.resource, ""),
        price: text(payload.price, amount),
        asset: text(payload.asset, "0x3600000000000000000000000000000000000000"),
        network: text(payload.network, name === "wrong_network" ? "eip155:1" : "eip155:5042"),
        payee: text(payload.payee, name === "wrong_payee" ? "0x0000000000000000000000000000000000000001" : payee),
        agent: text(payload.agent, tab.agentId),
        capability: text(payload.capability, tab.id),
        remaining_capability_balance: text(payload.remaining_capability_balance, balance),
        maxPerCall: text(payload.maxPerCall, max),
        root_exposure: text(payload.root_exposure, ""),
        maxOpenExposure: text(payload.maxOpenExposure, ""),
        expiry: text(payload.expiry, tab.expiryUnix ? String(tab.expiryUnix) : ""),
        decision: outcome.decision,
        reason: outcome.reason,
        registrar,
      };
      const saved = decisionRecord(facts, new Date().toISOString());
      if (saved.txHash || saved.decision === "NOT_SETTLED" || saved.decision === "ALLOW") {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      await saveDecision(saved);
      usePqtabsData.getState().noteDecision();
      setShownDecision(saved);
      const sentence = paymentReasonSentence(outcome.reason[0] ?? "");
      setPayLog([labels[name], `Payment blocked. ${sentence} Nothing was signed. Nothing was broadcast.`]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "This check was not a refusal. Nothing was signed. Nothing was broadcast.";
      setPayLog((lines) => [...lines, message]);
      toast.error(message);
    } finally {
      payLock.current = false;
      setPaying(false);
    }
  }

  async function runUnavailableService() {
    if (!tab || payLock.current) return;
    const registrar = usePqtabsData.getState().registrar;
    if (!registrar) {
      toast.error("The capability could not be read. Nothing was signed.");
      return;
    }
    payLock.current = true;
    setPaying(true);
    setPayLog(["Check: unavailable service"]);
    try {
      let status: number | null = null;
      try {
        const response = await fetch(UNAVAILABLE_SERVICE_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
        });
        status = response.status;
      } catch {
        status = null;
      }
      const outcome = unavailableServiceRefusal(status);
      if (!outcome) {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      const facts: DecisionFacts = {
        task: "Check: unavailable service",
        service: UNAVAILABLE_SERVICE_URL,
        resource: UNAVAILABLE_SERVICE_URL,
        price: "",
        asset: "",
        network: "",
        payee: "",
        agent: tab.agentId,
        capability: tab.id,
        remaining_capability_balance: tab.balanceRaw ?? "",
        maxPerCall: tab.maxPerCallRaw ?? "",
        root_exposure: "",
        maxOpenExposure: "",
        expiry: tab.expiryUnix ? String(tab.expiryUnix) : "",
        decision: outcome.decision,
        reason: [...outcome.reason],
        registrar,
      };
      const saved = decisionRecord(facts, new Date().toISOString());
      if (saved.txHash || saved.decision !== "NO_PAYMENT") {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      await saveDecision(saved);
      usePqtabsData.getState().noteDecision();
      setShownDecision(saved);
      setPayLog(["Check: unavailable service", "Payment blocked. The service was unavailable. Nothing was signed. Nothing was broadcast."]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "This check was not a refusal. Nothing was signed. Nothing was broadcast.";
      setPayLog((lines) => [...lines, message]);
      toast.error(message);
    } finally {
      payLock.current = false;
      setPaying(false);
    }
  }

  async function runWrongAgent() {
    if (!tab || payLock.current) return;
    const registrar = usePqtabsData.getState().registrar;
    const payee = tab.policy.allowedRecipients.find((item) => isAddress(item));
    if (!registrar || !payee) {
      toast.error("The capability could not be read. Nothing was signed.");
      return;
    }
    payLock.current = true;
    setPaying(true);
    setPayLog(["Check: wrong agent"]);
    try {
      const stranger = generatePrivateKey();
      const signed = await authorizationBlob(stranger, tab.id, payee, BigInt(1), BigInt(1));
      const response = await fetch(`${BACKEND_URL}/v1/relay/spend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tab: tab.id,
          to: payee,
          value: "1",
          validAfter: "0",
          validBefore: "1",
          nonce: signed.nonce,
          signature: signed.blob,
          paymentRequired: probePayment("above_per_payment", payee, "1"),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { hash?: string; error?: string; detail?: string } | null;
      if (response.status === 429 || payload?.error === "rate_limited") {
        throw new Error("Network reads are busy. Nothing was signed. Nothing was broadcast.");
      }
      const outcome = probeRefusal(response.status, payload);
      if (!outcome || outcome.reason[0] !== "wrong_agent" || !payload) {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      const facts: DecisionFacts = {
        task: "Check: wrong agent",
        service: "Policy check",
        resource: "",
        price: "1",
        asset: USDC,
        network: "eip155:5042",
        payee,
        agent: tab.agentId,
        capability: tab.id,
        remaining_capability_balance: tab.balanceRaw ?? "",
        maxPerCall: tab.maxPerCallRaw ?? "",
        root_exposure: "",
        maxOpenExposure: "",
        expiry: tab.expiryUnix ? String(tab.expiryUnix) : "",
        decision: outcome.decision,
        reason: [...outcome.reason],
        registrar,
      };
      const saved = decisionRecord(facts, new Date().toISOString());
      if (saved.txHash || saved.decision !== "REFUSE") {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      await saveDecision(saved);
      usePqtabsData.getState().noteDecision();
      setShownDecision(saved);
      setPayLog(["Check: wrong agent", "Payment blocked. This device key is not the agent on this capability. Nothing was signed. Nothing was broadcast."]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "This check was not a refusal. Nothing was signed. Nothing was broadcast.";
      setPayLog((lines) => [...lines, message]);
      toast.error(message);
    } finally {
      payLock.current = false;
      setPaying(false);
    }
  }

  async function runReplayCheck() {
    if (!tab || payLock.current) return;
    const registrar = usePqtabsData.getState().registrar;
    const payment = activity.find((item) => item.tabId === tab.id && item.kind === "payment" && item.status === "completed" && typeof item.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(item.txHash));
    if (!registrar || !payment?.txHash) {
      toast.error("No settled payment is on this capability. Nothing was signed.");
      return;
    }
    payLock.current = true;
    setPaying(true);
    setPayLog(["Check: replay"]);
    try {
      const tx = await arcClient().getTransaction({ hash: payment.txHash as `0x${string}` });
      const spent = spentAuthorization(tx.input);
      if (!spent || spent.from !== tab.id.toLowerCase()) {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      const used = await arcClient().readContract({
        address: USDC,
        abi: [{
          type: "function",
          name: "authorizationState",
          stateMutability: "view",
          inputs: [
            { name: "authorizer", type: "address" },
            { name: "nonce", type: "bytes32" },
          ],
          outputs: [{ type: "bool" }],
        }],
        functionName: "authorizationState",
        args: [tab.id as `0x${string}`, spent.nonce as `0x${string}`],
      });
      const outcome = replayRefusal(used === true);
      if (!outcome) {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      const facts: DecisionFacts = {
        task: "Check: replay",
        service: "Arc USDC authorization",
        resource: payment.txHash,
        price: spent.value,
        asset: USDC,
        network: "eip155:5042",
        payee: spent.to,
        agent: tab.agentId,
        capability: tab.id,
        remaining_capability_balance: tab.balanceRaw ?? "",
        maxPerCall: tab.maxPerCallRaw ?? "",
        root_exposure: "",
        maxOpenExposure: "",
        expiry: tab.expiryUnix ? String(tab.expiryUnix) : "",
        decision: outcome.decision,
        reason: [...outcome.reason],
        registrar,
      };
      const saved = decisionRecord(facts, new Date().toISOString());
      if (saved.txHash || saved.decision !== "REFUSE") {
        throw new Error("This check was not a refusal. Nothing was signed. Nothing was broadcast.");
      }
      await saveDecision(saved);
      usePqtabsData.getState().noteDecision();
      setShownDecision(saved);
      setPayLog(["Check: replay", "Payment blocked. This payment authorization was already used. Nothing was signed. Nothing was broadcast."]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "This check was not a refusal. Nothing was signed. Nothing was broadcast.";
      setPayLog((lines) => [...lines, message]);
      toast.error(message);
    } finally {
      payLock.current = false;
      setPaying(false);
    }
  }

  const agent = agents.find((a) => a.id === tab.agentId);
  const vaultEpoch = usePqtabsData((state) => state.agentVaultEpoch);
  const canPay = vaultEpoch >= 0 && Boolean(recallAgentKey(tab.agentId));
  const allowed = recipients.filter((r) => tab.policy.allowedRecipients.includes(r.id));
  const spendHistory = activity.filter(
    (a) => a.tabId === tab.id && (a.kind === "payment" || a.kind === "policy_blocked")
  );
  const spent = Math.max(0, tab.capUsd - tab.balanceUsd);
  const spentPct = tab.capUsd > 0 ? Math.min(100, (spent / tab.capUsd) * 100) : 0;
  const expiringSoon = tab.status === "active" && tab.policy.expiresInHours < 24;
  const statusSentence =
    tab.status === "active"
      ? "Within policy"
      : tab.status === "expired"
        ? tab.balanceUsd > 0
          ? "Expired — reclaim ready"
          : "Expired"
        : "Closed";

  const canDo = [
    `Pay the ${allowed.length} approved recipients`,
    `Spend up to ${usd(tab.policy.maxPerCallUsd)} per payment`,
    `Draw down to the ${usd(tab.capUsd)} cap`,
  ];
  const canNever = [
    "Touch root cash or the wallet",
    "Raise its own limits",
    "Add recipients or extend expiry",
    "Spend after expiry",
  ];

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-white/[.06] px-5 pb-4 pr-12 pt-5 md:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <SheetTitle className="font-mono text-sm font-medium tracking-[0.06em] text-foreground">
            {tab.reference}
          </SheetTitle>
          <StatusChip status={tab.status} pulse={tab.status === "active"} />
        </div>
        <SheetDescription className="sr-only">
          Capability {tab.reference} — balance, policy, recipients and spend history.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-6 px-5 py-5 md:px-6">
          {/* Holder */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-white/[.02] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {agent?.name ?? "Unknown agent"}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {agent?.address ?? tab.agentId}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy agent address"
              onClick={() => agent && onCopy(agent.address, "Address copied")}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" strokeWidth={1.75} />
            </Button>
          </div>

          {/* Balance against cap */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Available
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-3xl font-semibold leading-none tabular text-gold">
                {tab.balanceKnown === false ? "—" : usd(tab.balanceUsd)}
              </span>
              <span className="font-mono text-xs tabular text-muted-foreground">
                of {usd(tab.capUsd)} cap
              </span>
            </div>
            <div
              className="mt-3 h-[5px] w-full overflow-hidden rounded-full bg-white/[.08]"
              role="progressbar"
              aria-label={`${usd(spent)} spent of ${usd(tab.capUsd)} cap`}
              aria-valuenow={Math.round(spentPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-gold/85" style={{ width: `${spentPct}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] tabular text-muted-foreground">
              {usd(spent)} spent of {usd(tab.capUsd)}
            </p>
          </div>

          {/* Policy grid */}
          <div className="grid grid-cols-2 gap-3">
            <PolicyCell label="Max per payment" value={usd(tab.policy.maxPerCallUsd)} />
            <PolicyCell
              label="Expires"
              value={relFuture(tab.policy.expiresInHours)}
              warn={expiringSoon}
            />
            <PolicyCell label="Recipients" value={`${allowed.length} approved`} />
            <PolicyCell label="Status" value={statusSentence} />
          </div>

          {/* Allowed recipients */}
          <section aria-label="Allowed recipients" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Allowed recipients
              </p>
              <span className="font-mono text-[10px] tabular text-muted-foreground">
                {allowed.length} of {recipients.length} known
              </span>
            </div>
            <ScrollArea className="max-h-40 rounded-lg border border-white/[.06]">
              <ul className="divide-y divide-white/[.05]">
                {allowed.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm text-foreground">{r.name}</p>
                        <span className="shrink-0 rounded-full border border-white/[.08] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                          {r.category}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                        {r.address}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${r.name} address`}
                      onClick={() => onCopy(r.address, "Address copied")}
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="size-3" strokeWidth={1.75} />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </section>

          {/* Spend history */}
          <section aria-label="Spend history" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Spend history
              </p>
              <span className="font-mono text-[10px] tabular text-muted-foreground">
                {spendHistory.length} records
              </span>
            </div>
            {spendHistory.length > 0 ? (
              <div className="max-h-64 overflow-y-auto scrollbar-thin rounded-lg border border-white/[.06]">
                <ul className="divide-y divide-white/[.05]">
                  {spendHistory.map((record) => (
                    <li key={record.id}>
                      <ActivityRow record={record} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-white/[.09] px-4 py-5 text-center text-xs text-muted-foreground">
                No payments recorded yet.
              </p>
            )}
          </section>

          {/* The boundary, stated plainly */}
          <section
            aria-label="Security boundary"
            className="grid gap-5 rounded-xl border border-white/[.07] bg-white/[.02] p-4 sm:grid-cols-2"
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                What this agent can do
              </p>
              <ul className="mt-3 space-y-2">
                {canDo.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-xs text-foreground/85">
                    <Check
                      className="mt-0.5 h-3 w-3 shrink-0 text-success"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                What it can never do
              </p>
              <ul className="mt-3 space-y-2">
                {canNever.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-xs text-foreground/85">
                    <X
                      className="mt-0.5 h-3 w-3 shrink-0 text-danger"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>

      {tab.status === "active" && tab.expiryUnix && (
        <div className="border-t border-white/[.06] px-5 py-4 md:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Research agent</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Pays for external inference when the requested service fits this capability. Enter a question. Run task asks the service for its price and pays only if the capability allows it.
          </p>
          <input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="Research question"
            placeholder="Enter a research question"
            className="mt-3 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
          />
          {!canPay && (
            <p className="mt-2 text-xs text-muted-foreground">
              This browser does not hold this agent's encrypted key, so it cannot sign a payment until you restore the backup.
            </p>
          )}
          <Button
            disabled={paying || !canPay || task.trim().length === 0}
            onClick={() => {
              if (payLock.current) return;
              const key = (recallAgentKey(tab.agentId) || "") as `0x${string}`;
              const registrar = usePqtabsData.getState().registrar;
              if (!key.startsWith("0x") || !tab.expiryUnix || !registrar) {
                toast.error("This device must already hold the agent. Nothing was signed.");
                return;
              }
              payLock.current = true;
              setPaying(true);
              setPayLog(["Agent requested a paid service"]);
              const asked = task.trim();
              let facts: DecisionFacts | null = null;
              const block = (reason: string) => {
                setPayLog((lines) => [...lines, `Payment blocked. ${reason}`]);
                throw new Error(`Payment blocked. ${reason}`);
              };
              void requestServicePrice(asked)
                .then((paymentRequired) => {
                  setPayLog((lines) => [...lines, "Price verified"]);
                  return decideServicePrice(tab.id, paymentRequired).then((decision) => ({ paymentRequired, decision }));
                })
                .then(async ({ paymentRequired, decision }) => {
                  facts = decisionFacts(asked, registrar, decision);
                  if (decision.decision !== "ALLOW") {
                    const saved = decisionRecord(facts, new Date().toISOString());
                    return saveDecision(saved).then(() => {
                      usePqtabsData.getState().noteDecision();
                      setShownDecision(saved);
                      const sentence = paymentReasonSentence(decision.reason[0] ?? "capability_inactive");
                      block(`${sentence} Nothing was signed. Nothing was broadcast.`);
                    });
                  }
                  if (!isAddress(decision.payee)) {
                    block("The service price had no recipient. Nothing was signed.");
                  }
                  setPayLog((lines) => [...lines, "Payee verified"]);
                  if (!agentCanSign(agentAddress(key), decision.agent)) {
                    facts = { ...facts, decision: "REFUSE", reason: ["wrong_agent"] };
                    const saved = decisionRecord(facts, new Date().toISOString());
                    return saveDecision(saved).then(() => {
                      usePqtabsData.getState().noteDecision();
                      setShownDecision(saved);
                      block("This device key is not the agent on this capability. Nothing was signed. Nothing was broadcast.");
                    });
                  }
                  const now = await arcClock();
                  const deadline = paymentDeadline(now, chainExpirySeconds(decision.expiry), serviceTimeoutSeconds(paymentRequired));
                  setPayLog((lines) => [...lines, "Policy approved"]);
                  return authorizationBlob(key, tab.id, decision.payee, BigInt(decision.price), BigInt(deadline)).then((signed) => ({
                    paymentRequired,
                    decision,
                    signed,
                    deadline,
                  }));
                })
                .then(({ paymentRequired, decision, signed, deadline }) => {
                  if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) {
                    throw new Error("The wallet changed. The payment was not submitted.");
                  }
                  return settleService(asked, paymentRequired, {
                    from: tab.id,
                    to: decision.payee,
                    value: decision.price,
                    validAfter: "0",
                    validBefore: String(deadline),
                    nonce: signed.nonce,
                  }, signed.blob);
                })
                .then(async ({ transaction, result, receipt, charge }) => {
                  if (facts) {
                    try {
                      const saved = settledDecision(facts, { txHash: transaction, receipt, result, charge }, new Date().toISOString());
                      await saveDecision(saved);
                      setShownDecision(saved);
                      usePqtabsData.getState().noteDecision();
                    } catch {
                      toast.message("The receipt was not saved on this device.");
                    }
                  }
                  if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) {
                    toast.message("The wallet changed. The receipt belongs to the previous wallet.");
                    return;
                  }
                  setPayLog((lines) => [...lines, "Arc payment confirmed"]);
                  if (!result) {
                    setPayLog((lines) => [...lines, "Payment blocked. The service result was not usable. No further payment was sent."]);
                    toast.error(`Arc included ${transaction.slice(0, 10)}… The service result was not usable. No further payment was sent.`);
                    return;
                  }
                  setPayLog((lines) => [...lines, "Service response received"]);
                  toast.success(result);
                })
                .catch(async (error: unknown) => {
                  const message = error instanceof Error ? error.message : "The payment was rejected.";
                  if (facts?.decision === "ALLOW") {
                    try {
                      const reason = message.includes("invalid_exact_evm_signature")
                        ? [...facts.reason, "facilitator_rejected"]
                        : facts.reason;
                      const saved = decisionRecord({ ...facts, reason }, new Date().toISOString());
                      await saveDecision(saved);
                      setShownDecision(saved);
                      usePqtabsData.getState().noteDecision();
                    } catch {
                      toast.message("The decision was not saved on this device.");
                    }
                  }
                  if (!message.startsWith("Payment blocked")) {
                    setPayLog((lines) => [...lines, `Payment blocked. ${message}`]);
                  }
                  toast.error(message);
                })
                .finally(() => {
                  payLock.current = false;
                  setPaying(false);
                });
            }}
            className="mt-3 h-9 bg-gold text-[#171204] hover:bg-[#eec95e]"
          >
            {paying ? <Loader2 className="size-4 animate-spin" /> : "Run task"}
          </Button>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["wrong_payee", "Wrong recipient"],
                ["above_per_payment", "Price above limit"],
                ["above_balance", "Price above balance"],
                ["wrong_network", "Wrong network"],
                ["malformed_signature", "Malformed signature"],
              ] as const
            ).map(([name, label]) => (
              <Button
                key={name}
                type="button"
                disabled={paying}
                onClick={() => void runBlockedCheck(name)}
                className="h-8 border border-white/10 bg-transparent px-2 text-xs text-foreground shadow-none hover:bg-white/[.04]"
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              disabled={paying}
              onClick={() => void runUnavailableService()}
              className="h-8 border border-white/10 bg-transparent px-2 text-xs text-foreground shadow-none hover:bg-white/[.04]"
            >
              Unavailable service
            </Button>
            <Button
              type="button"
              disabled={paying}
              onClick={() => void runWrongAgent()}
              className="h-8 border border-white/10 bg-transparent px-2 text-xs text-foreground shadow-none hover:bg-white/[.04]"
            >
              Wrong agent
            </Button>
            <Button
              type="button"
              disabled={paying}
              onClick={() => void runReplayCheck()}
              className="h-8 border border-white/10 bg-transparent px-2 text-xs text-foreground shadow-none hover:bg-white/[.04]"
            >
              Replay
            </Button>
          </div>
          {shownDecision ? <div className="mt-3"><PaymentDecision record={shownDecision} /></div> : null}
          {payLog.length > 0 && (
            <ul className="mt-3 space-y-1" aria-live="polite">
              {payLog.map((line) => (
                <li key={line} className="text-xs text-muted-foreground">{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="shrink-0 border-t border-white/[.06] bg-[#0a0b0d]/95 px-5 py-4 backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {tab.status === "active" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={closing}
                  onClick={() => {
                    const root = usePqtabsData.getState().snapshot.account.rootAddress;
                    if (!root) return;
                    void prepareClose(root, tab.id).then(setClosePrep).catch((error: unknown) => {
                      toast.error(error instanceof Error ? error.message : "Could not prepare the close.");
                    });
                  }}
                  className="h-9 min-w-[160px] flex-1 border border-danger/30 bg-transparent text-danger shadow-none hover:bg-danger/10 hover:text-danger"
                >
                  {closing ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <X className="size-4" strokeWidth={2} />
                  )}
                  Close capability
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-white/[.08] bg-[#0e1013]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display tracking-tight">
                    Close this capability?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Closing asks Arc to return the remaining USDC to your treasury. If that transfer does not finish, the capability stays closed and Return funds can send it without another signature.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {closePrep ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Technical details</summary>
                    <p className="mt-2 break-all font-mono text-[10px] leading-relaxed">{closePrep.digest}</p>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">Preparing the close from the current nonce.</p>
                )}
                <SecurityKeyUnlock onReady={setCloseReady} />
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-white/10 bg-white/[.03] text-foreground shadow-none hover:bg-white/[.06] hover:text-foreground">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={closingSig || !closePrep || !closeReady}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!closePrep) return;
                      const live = usePqtabsData.getState();
                      if (!live.snapshot.account.rootAddress || live.snapshot.account.rootAddress.toLowerCase() !== closePrep.root.toLowerCase()) {
                        toast.error("The wallet changed. Nothing was signed.");
                        return;
                      }
                      const verdict = backupMatchesRoot(verifyingKey(live.registrar), live.snapshot.account.pqVk);
                      if (verdict !== "match") {
                        lockRoot();
                        setCloseReady(false);
                        toast.error(backupRefusal(verdict));
                        return;
                      }
                      setClosingSig(true);
                      void signRootDigest(live.registrar, closePrep.digest)
                        .then((signed) => onClose(closePrep, signed))
                        .catch((reason: unknown) => {
                          toast.error(reason instanceof Error ? reason.message : "Unlock your security key first.");
                        })
                        .finally(() => setClosingSig(false));
                    }}
                    className="bg-danger text-white hover:bg-danger/90"
                  >
                    {closeReady ? "Close capability" : "Unlock your security key first"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {tab.status === "expired" && (
            <Button
              onClick={onReclaim}
              disabled={reclaiming}
              className="h-9 min-w-[160px] flex-1 bg-gold text-[#171204] hover:bg-[#eec95e]"
            >
              {reclaiming ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                <RotateCcw className="size-4" strokeWidth={2} />
              )}
              {tab.balanceUsd > 0 ? `Reclaim ${usd(tab.balanceUsd)}` : "Release limit"}
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            aria-label="Copy reference"
            onClick={() => onCopy(tab.reference, "Reference copied")}
            className="h-9 w-9 border-white/10 bg-white/[.03] shadow-none hover:bg-white/[.06] hover:text-foreground"
          >
            <Copy className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    </>
  );
}

function PolicyCell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[.06] bg-white/[.02] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-xs tabular",
          warn ? "text-warning" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
