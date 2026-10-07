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
import { keccak256, toHex } from "viem";

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
  const lock = useRef(false);

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
      const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
      const hash = await createSecurityDomain(vk as `0x${string}`, maxOpenExposure, salt);
      setBusy("Waiting for Arc");
      const root = await waitForRoot(hash);
      rememberRoot(root);
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
            <div className="flex w-full flex-col gap-3 text-left">
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
                    aria-label="Security key passphrase"
                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
                  />
                </label>
              )}
              {saved ? (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={kept}
                    onChange={(event) => setKept(event.target.checked)}
                    aria-label="I saved the backup file"
                    className="mt-0.5"
                  />
                  I saved the backup file. The wallet confirmation comes after this.
                </label>
              ) : null}
              <Button
                onClick={saved ? protect : downloadKey}
                disabled={busy !== null || (saved && !kept)}
                className="bg-gold text-[#171204] hover:bg-[#eec95e]"
              >
                {busy ?? (saved ? "Create security domain" : "Download backup")}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                The backup file is the only copy of this key. Your wallet cannot recreate it. There is no operator recovery. Save the file before the wallet confirmation.
              </p>
              <button type="button" onClick={onExit} className="text-center text-xs text-muted-foreground hover:text-foreground">
                Back to site
              </button>
            </div>
          }
          className="w-full"
        />
        {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
