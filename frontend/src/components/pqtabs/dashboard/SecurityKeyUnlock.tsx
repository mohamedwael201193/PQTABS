"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { backupMatchesRoot, backupRefusal } from "@/data/pq-key-match";
import { lockRoot, rootSession, rootUnlocked, subscribeRootSession, unlockBackup, verifyingKey, type RootSessionState } from "@/data/pq-vault";
import { hasRootBackup, loadRootBackup, saveRootBackup } from "@/data/root-backup";
import { usePqtabsData } from "@/lib/store";

function unlockError(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  if (raw === "not a pqtabs backup") return "This file is not a security-key backup. Nothing was signed.";
  if (raw === "decrypt failed") return "That passphrase did not open this backup. Nothing was signed.";
  if (raw && raw !== "[object Object]") return raw;
  return "Could not unlock the security key. Nothing was signed.";
}

export function SecurityKeyUnlock({ onReady }: { onReady: (ready: boolean) => void }) {
  const registrar = usePqtabsData((state) => state.registrar);
  const [passphrase, setPassphrase] = useState("");
  const [fileMode, setFileMode] = useState(false);
  const [local, setLocal] = useState<boolean | null>(null);
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<RootSessionState>(rootSession());

  useEffect(() => {
    onReady(rootUnlocked(registrar));
    return subscribeRootSession(() => {
      setSession(rootSession());
      onReady(rootUnlocked(registrar));
    });
  }, [onReady, registrar]);

  useEffect(() => {
    let cancelled = false;
    void hasRootBackup(registrar).then((yes) => {
      if (!cancelled) setLocal(yes);
    }).catch(() => {
      if (!cancelled) setLocal(false);
    });
    return () => {
      cancelled = true;
    };
  }, [registrar]);

  async function accept(bytes: ArrayBuffer, persist: boolean) {
    if (passphrase.length < 8) {
      onReady(false);
      setError("Enter the backup passphrase (at least 8 characters).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await unlockBackup(registrar, bytes, passphrase);
      const verdict = backupMatchesRoot(verifyingKey(registrar), usePqtabsData.getState().snapshot.account.pqVk);
      if (verdict !== "match") {
        lockRoot();
        onReady(false);
        setError(backupRefusal(verdict));
        return;
      }
      if (persist) await saveRootBackup(registrar, bytes, usePqtabsData.getState().snapshot.account.rootAddress ?? null);
      onReady(true);
    } catch (reason: unknown) {
      onReady(false);
      setError(unlockError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (rootUnlocked(registrar) && session === "UNLOCKED") {
    return <p className="text-sm text-foreground">Security key unlocked for this session.</p>;
  }

  const showFile = fileMode || local === false;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-foreground">Unlock security key</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {local
            ? "Your security key is saved securely on this device as an encrypted backup."
            : "Choose the security-key backup for this root. After it matches, this device keeps that encrypted file."}
        </p>
      </div>
      {session === "EXPIRED" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">This session expired after 30 minutes without use. Enter the passphrase again.</p>
      ) : null}
      <label className="block text-xs text-muted-foreground" htmlFor="security-key-passphrase">
        Backup passphrase
        <input
          id="security-key-passphrase"
          type="password"
          value={passphrase}
          aria-label="Backup passphrase"
          placeholder="Backup passphrase"
          autoComplete="current-password"
          className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </label>
      {showFile ? (
        <label className="block text-xs text-muted-foreground" htmlFor="security-key-backup">
          Security-key backup
          <input
            id="security-key-backup"
            type="file"
            aria-label={local ? "Use another backup file" : "Choose backup file"}
            className="mt-1 block w-full text-xs text-muted-foreground"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.arrayBuffer().then((bytes) => setFileBytes(bytes));
            }}
          />
        </label>
      ) : null}
      <Button
        type="button"
        disabled={busy || local === null || (showFile && !fileBytes)}
        onClick={() => {
          if (showFile) {
            if (fileBytes) void accept(fileBytes, true);
            return;
          }
          void loadRootBackup(registrar).then((bytes) => {
            if (!bytes) {
              setLocal(false);
              setError("No encrypted backup is on this device.");
              return;
            }
            void accept(bytes, false);
          }).catch(() => {
            setLocal(false);
            setError("No encrypted backup is on this device.");
          });
        }}
        className="bg-gold text-[#171204] hover:bg-[#eec95e]"
      >
        {busy ? "Unlocking" : "Unlock security key"}
      </Button>
      {local ? (
        <button
          type="button"
          className="block text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setFileMode((value) => !value);
            setFileBytes(null);
            setError("");
          }}
        >
          {showFile ? "Use the backup on this device" : "Use another backup file"}
        </button>
      ) : null}
      {error ? (
        <p className="text-xs leading-relaxed text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
