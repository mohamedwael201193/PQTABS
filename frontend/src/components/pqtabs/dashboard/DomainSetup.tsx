"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/pqtabs/shared";
import { parseUsdcRaw } from "@/data/actions";
import { rememberRoot } from "@/data/production";
import { createRootKey, rootUnlocked, verifyingKey } from "@/data/pq-vault";
import { createSecurityDomain, existingAccount, waitForRoot } from "@/data/wallet";
import { usePqtabsData } from "@/lib/store";
import { keccak256, toHex } from "viem";

function downloadBackup(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pqtabs-security-key.pqtabs";
  link.click();
  URL.revokeObjectURL(url);
}

export function DomainSetup({ onExit, onReady }: { onExit: () => void; onReady: () => void }) {
  const registrar = usePqtabsData((state) => state.registrar);
  const [passphrase, setPassphrase] = useState("");
  const [ceiling, setCeiling] = useState("0.2");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => rootUnlocked(usePqtabsData.getState().registrar));

  async function protect() {
    setError(null);
    try {
      const maxOpenExposure = parseUsdcRaw(ceiling);
      if (maxOpenExposure <= BigInt(0)) throw new Error("Set an exposure ceiling above zero.");
      if (!registrar) throw new Error("Connect a wallet before creating a security domain.");
      const live = await existingAccount();
      if (!live || live.toLowerCase() !== registrar.toLowerCase()) {
        throw new Error("The wallet changed. The security domain was not created.");
      }
      let vk = verifyingKey(registrar);
      if (!vk) {
        if (passphrase.length < 8) throw new Error("Choose a passphrase of at least 8 characters.");
        setBusy("Creating your security key");
        const created = await createRootKey(registrar, passphrase);
        downloadBackup(created.backup);
        vk = created.verifyingKey;
        setSaved(true);
      }
      setBusy("Confirm in your wallet");
      const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
      const hash = await createSecurityDomain(vk as `0x${string}`, maxOpenExposure, salt);
      setBusy("Waiting for Arc");
      const root = await waitForRoot(hash);
      rememberRoot(root);
      onReady();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "The security domain was not created.");
    } finally {
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
              <Button onClick={protect} disabled={busy !== null} className="bg-gold text-[#171204] hover:bg-[#eec95e]">
                {busy ?? "Create security domain"}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                The backup file is the only copy of this key. Your wallet cannot recreate it. There is no operator recovery.
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
