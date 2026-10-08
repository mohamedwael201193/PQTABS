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
import { decisionRecord, settledDecision, type DecisionFacts, type QuotedDecision } from "@/data/decision-record";
import { saveDecision } from "@/data/decision-store";
import { arcClock, describeReturn, decideServicePrice, loadSnapshot, prepareClose, productionProvider, requestServicePrice, SERVICE_URL, settleService, submitPrepared, type PreparedAction, type ServiceDecision } from "@/data/production";
import { agentAddress, authorizationBlob, recallAgentKey } from "@/data/spend";
import { agentCanSign, chainExpirySeconds, paymentDeadline, serviceTimeoutSeconds } from "@/data/x402-pay";
import { backupMatchesRoot, backupRefusal } from "@/data/pq-key-match";
import { lockRoot, rootUnlocked, signRootDigest, unlockBackup, verifyingKey } from "@/data/pq-vault";
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
  const [task, setTask] = useState("Reply with one word: pong");
  const [closingSig, setClosingSig] = useState(false);
  const [closePass, setClosePass] = useState("");
  const [closeBackup, setCloseBackup] = useState<ArrayBuffer | null>(null);
  const [closeReady, setCloseReady] = useState(() => rootUnlocked(usePqtabsData.getState().registrar));
  const [paying, setPaying] = useState(false);
  const [payLog, setPayLog] = useState<string[]>([]);
  const payLock = useRef(false);

  function unlockClose(bytes: ArrayBuffer, secret: string) {
    if (secret.length < 8) {
      setCloseReady(false);
      toast.error("Enter the backup passphrase (at least 8 characters). The file can be chosen first.");
      return;
    }
    void unlockBackup(usePqtabsData.getState().registrar, bytes, secret)
      .then(() => {
        const live = usePqtabsData.getState();
        const verdict = backupMatchesRoot(verifyingKey(live.registrar), live.snapshot.account.pqVk);
        if (verdict !== "match") {
          lockRoot();
          setCloseReady(false);
          toast.error(backupRefusal(verdict));
          return;
        }
        setCloseReady(true);
      })
      .catch((reason: unknown) => {
        setCloseReady(false);
        toast.error(reason instanceof Error ? reason.message : "Could not unlock the security key.");
      });
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
    "Touch the root treasury",
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
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Agent payment</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            The service sets the price and the recipient. This device signs only if the capability allows that price. The service settles the payment. A refusal is not a payment.
          </p>
          <input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="Task for the paid service"
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
                    return saveDecision(decisionRecord(facts, new Date().toISOString())).then(() => {
                      usePqtabsData.getState().noteDecision();
                      block(decision.reason[0] ?? "The capability refused this price. Nothing was signed.");
                    });
                  }
                  if (!isAddress(decision.payee)) {
                    block("The service price had no recipient. Nothing was signed.");
                  }
                  setPayLog((lines) => [...lines, "Payee verified"]);
                  if (!agentCanSign(agentAddress(key), decision.agent)) {
                    facts = { ...facts, decision: "REFUSE", reason: ["wrong_agent"] };
                    return saveDecision(decisionRecord(facts, new Date().toISOString())).then(() => {
                      usePqtabsData.getState().noteDecision();
                      block("This device key is not the agent on this capability. Nothing was signed.");
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
                      await saveDecision(settledDecision(facts, { txHash: transaction, receipt, result, charge }, new Date().toISOString()));
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
                  if (facts?.decision === "ALLOW") {
                    try {
                      await saveDecision(decisionRecord(facts, new Date().toISOString()));
                      usePqtabsData.getState().noteDecision();
                    } catch {
                      toast.message("The decision was not saved on this device.");
                    }
                  }
                  const message = error instanceof Error ? error.message : "The payment was rejected.";
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
            {paying ? <Loader2 className="size-4 animate-spin" /> : "Pay the service price"}
          </Button>
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
                {!closeReady && (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={closePass}
                      aria-label="Security key passphrase"
                      placeholder="Passphrase for your backup"
                      className="h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm outline-none"
                      onChange={(event) => setClosePass(event.target.value)}
                      onBlur={() => {
                        if (closeBackup) unlockClose(closeBackup, closePass);
                      }}
                    />
                    <input
                      type="file"
                      aria-label="Security key backup"
                      className="block w-full text-xs text-muted-foreground"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        void file.arrayBuffer().then((bytes) => {
                          setCloseBackup(bytes);
                          unlockClose(bytes, closePass);
                        });
                      }}
                    />
                  </div>
                )}
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
