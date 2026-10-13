"use client";

import { type Address } from "viem";
import { useState } from "react";
import { BACKEND_URL } from "@/data/production";
import { connectWallet, walletClient } from "@/data/wallet";
import { CopyBlock } from "./CopyBlock";
import {
  checkDeveloperSession,
  type DeveloperSession,
  DeveloperSessionError,
  revokeDeveloperSession,
  signInDeveloperSession,
  tokenPreview,
} from "./developer-session";
import { usePageOrigin } from "./PairingPanel";

/** Codes that mean this token will never work again, so the screen forgets it. */
const TOKEN_GONE = new Set(["unknown_session", "session_revoked", "session_expired", "missing_token"]);

/**
 * Read-only developer session. The wallet signs one sign-in message from the server. The token it returns can read
 * portfolio data through the API. It cannot sign a payment, open or close a capability, or change a limit or payee.
 * The token lives only in this page's memory. Reloading the page ends the screen's view of it, so revoke it when done.
 */
export function SessionPanel() {
  const origin = usePageOrigin();
  const [session, setSession] = useState<DeveloperSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setNotice(null);
    try {
      const { address } = await connectWallet();
      const wallet = address as Address;
      const next = await signInDeveloperSession({
        backendUrl: BACKEND_URL,
        wallet,
        origin: window.location.origin,
        signMessage: (message) => walletClient().signMessage({ account: wallet, message }),
      });
      setSession(next);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "The sign-in did not finish. No payment was signed.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      const status = await checkDeveloperSession({ backendUrl: BACKEND_URL, token: session.token });
      setSession({ ...session, scopes: status.scopes, expiresAt: status.expiresAt });
      setNotice("The session is active and read-only.");
    } catch (error: unknown) {
      if (error instanceof DeveloperSessionError && TOKEN_GONE.has(error.code)) setSession(null);
      setNotice(error instanceof Error ? error.message : "The session could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      await revokeDeveloperSession({ backendUrl: BACKEND_URL, token: session.token });
      setSession(null);
      setNotice("Revoked. The token no longer works.");
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "The session could not be revoked. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const expiry = session ? new Date(session.expiresAt * 1000).toLocaleString() : "";
  const example = `curl -H "Authorization: Bearer $PQTABS_TOKEN" "${BACKEND_URL}/v1/dev/roots/<root address>/portfolio"`;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        A session reads portfolio data for your roots through the API. It cannot sign a payment, open or close a capability,
        or change a limit or payee. Your wallet signs one sign-in message, and nothing else.
      </p>
      {!session && (
        <button
          type="button"
          onClick={signIn}
          disabled={busy || !origin}
          className="focus-ring rounded-lg border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50"
        >
          {busy ? "Waiting for the wallet" : "Sign in for read-only API access"}
        </button>
      )}
      {session && (
        <>
          <p role="status" className="text-sm text-foreground">
            Active until {expiry}. Scope: {session.scopes.join(", ")}. Token {tokenPreview(session.token)}.
          </p>
          <CopyBlock label="Session token (keep it secret; shown only here)" code={session.token} />
          <CopyBlock label="Example: read one root's portfolio" code={example} />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={check} disabled={busy} className="focus-ring rounded-lg border border-white/[.12] px-4 py-2 text-sm disabled:opacity-50">
              Check session
            </button>
            <button type="button" onClick={revoke} disabled={busy} className="focus-ring rounded-lg border border-destructive/60 px-4 py-2 text-sm text-destructive disabled:opacity-50">
              Revoke session
            </button>
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
    </div>
  );
}
