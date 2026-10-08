"use client";

import { useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/pqtabs/shared";
import { parseUsdcRaw } from "@/data/actions";
import { rememberRoot } from "@/data/production";
import { createRootKey, rootUnlocked, verifyingKey } from "@/data/pq-vault";
import { arc, createSecurityDomain, existingAccount, waitForRoot, walletClient } from "@/data/wallet";
import { usePqtabsData } from "@/lib/store";
import { keccak256, toHex, type Hex } from "viem";

function downloadBackup(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pqtabs-security-key.pqtabs";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function DomainSetup({ onExit, onReady }: { onExit: () => void; onReady: () => void }) {
  const registrar = usePqtabsData((state) => state.registrar);
  const [passphrase, setPassphrase] = useState("");
  const [ceiling, setCeiling] = useState("0.2");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => rootUnlocked(usePqtabsData.getState().registrar));
  const [kept, setKept] = useState(false);
  const [sent, setSent] = useState(false);
  const lock = useRef(false);
  const pendingHash = useRef<Hex | null>(null);

  async function sameWallet() {
    if (!registrar) throw new Error("Connect a wallet before creating a security domain.");
    const chainId = await walletClient().getChainId();
    if (chainId !== arc.id) throw new Error("Switch to Arc before creating a security domain.");
    const live = await existingAccount();
    if (!live || live.toLowerCase() !== registrar.toLowerCase()) {
      throw new Error("The wallet changed. The security domain was not created.");
    }
  }

  async function downloadKey() {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setBusy("Creating your security key");
    try {
      if (passphrase.length < 8) throw new Error("Choose a passphrase of at least 8 characters.");
      await sameWallet();
      const created = await createRootKey(registrar, passphrase);
      downloadBackup(created.backup);
      setSaved(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "The security key was not created.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  async function protect() {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setBusy("Confirm in your wallet");
    try {
      const maxOpenExposure = parseUsdcRaw(ceiling);
      if (maxOpenExposure <= BigInt(0)) throw new Error("Set an exposure ceiling above zero.");
      if (!kept) throw new Error("Save the backup file before creating the security domain.");
      await sameWallet();
      const vk = verifyingKey(registrar);
      if (!vk) throw new Error("Download the backup file before creating the security domain.");
      let hash = pendingHash.current;
      if (!hash) {
        const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
        hash = await createSecurityDomain(vk as `0x${string}`, maxOpenExposure, salt, registrar as `0x${string}`);
        pendingHash.current = hash;
        setSent(true);
      }
      setBusy("Waiting for Arc");
      let root: string;
      try {
        root = await waitForRoot(hash);
      } catch (reason: unknown) {
        const message = reason instanceof Error ? reason.message : "";
        if (message.includes("rejected")) {
          pendingHash.current = null;
          setSent(false);
        }
        throw reason;
      }
      const live = await existingAccount();
      if (!live || live.toLowerCase() !== registrar.toLowerCase()) {
        throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
      }
      rememberRoot(root);
      pendingHash.current = null;
      onReady();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "The security domain was not created.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />}
          title="Protect your treasury"
          body="This wallet has no security domain yet. Your wallet identifies you. A separate security key authorizes what agents can spend. It is not saved in the browser. After this, you create an agent and give it a capability. The agent never holds this key."
          action={
            <form
              autoComplete="off"
              className="flex w-full flex-col gap-3 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                if (saved) void protect();
                else void downloadKey();
              }}
            >
              <p className="text-center font-mono text-[11px] text-foreground">
                Wallet {registrar.slice(0, 6)}…{registrar.slice(-4)}
              </p>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                This security domain will belong to this wallet only.
              </p>
              <label className="text-xs text-muted-foreground">
                Exposure ceiling in USDC
                <input
                  value={ceiling}
                  onChange={(event) => setCeiling(event.target.value)}
                  aria-label="Exposure ceiling in USDC"
                  name="pqtabs-exposure-ceiling"
                  autoComplete="off"
                  inputMode="decimal"
                  className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
                />
              </label>
              {!saved && (
                <label className="text-xs text-muted-foreground">
                  Passphrase for the backup file
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    aria-label="Passphrase for the backup file"
                    name="pqtabs-backup-passphrase"
                    autoComplete="new-password"
                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
                  />
                </label>
              )}
              {saved ? (
                <div className="rounded-lg border border-white/10 px-3 py-3">
                  <p className="text-sm text-foreground">Security-key backup created</p>
                  <p className="mt-2 text-xs text-muted-foreground">Filename</p>
                  <p className="font-mono text-xs text-foreground">pqtabs-security-key.pqtabs</p>
                  <p className="mt-2 text-xs text-muted-foreground">Saved by you</p>
                  <p className="text-xs text-foreground">Downloads / your chosen secure location</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Stay on this page until the wallet confirms. This session matches the file you just downloaded. PQTABS does not keep another copy.
                  </p>
                </div>
              ) : null}
              {saved ? (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={kept}
                    onChange={(event) => setKept(event.target.checked)}
                    aria-label="I saved my backup"
                    className="mt-0.5"
                  />
                  I saved my backup
                </label>
              ) : null}
              <Button
                type="submit"
                disabled={busy !== null || (saved && !kept)}
                className="bg-gold text-[#171204] hover:bg-[#eec95e]"
              >
                {busy ?? (saved ? (sent ? "Check Arc again" : "Confirm in your wallet") : "Download backup")}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Download backup only saves the file. Confirm in your wallet is the separate Arc transaction that creates the treasury.
              </p>
              <button type="button" onClick={onExit} className="text-center text-xs text-muted-foreground hover:text-foreground">
                Back to site
              </button>
            </form>
          }
          className="w-full"
        />
        {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
