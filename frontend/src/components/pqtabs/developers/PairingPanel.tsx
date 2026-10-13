"use client";

import { useState, useSyncExternalStore } from "react";
import { CopyBlock } from "./CopyBlock";
import { newPairingRequest, pairingCommand, pairingMessage, type PairingRequest, verifyPairing } from "./pairing";

const noopSubscribe = () => () => {};

/** The page's own origin. Empty during server rendering, so the panel waits for the browser. */
export function usePageOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

const REASON_TEXT: Record<string, string> = {
  expired: "This request expired. Create a new one and sign again. Nothing was stored.",
  wrong_origin: "This request was made for a different site. Create a new request on this page.",
  malformed_signature: "Paste the signature (0x and 130 hex characters), or the JSON the command printed.",
  not_signed_by_agent: "That signature is not from the agent address above. Check that the signer on this machine holds this address.",
  already_used: "This pairing was already confirmed. Create a new request to pair again.",
};

/**
 * Pairs one public agent address with the signer on the developer's machine. The browser never receives a key:
 * it issues a one-time nonce, the developer signs it locally, and the browser checks the returned signature.
 * Pairing authorizes nothing. A capability still needs its own root signature.
 */
export function PairingPanel({ agent }: { agent: string | null }) {
  const origin = usePageOrigin();
  const [request, setRequest] = useState<PairingRequest | null>(null);
  const [signature, setSignature] = useState("");
  const [paired, setPaired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!agent) {
    return <p className="text-xs">Enter the public address in step 2. Pairing starts from that address.</p>;
  }

  function createRequest() {
    if (!agent || !origin) return;
    setRequest(newPairingRequest({ agent, origin, nowMs: Date.now() }));
    setSignature("");
    setPaired(false);
    setNotice(null);
  }

  async function check() {
    if (!request) return;
    const result = await verifyPairing({ request, signature, pageOrigin: origin, nowMs: Date.now() });
    if (result.ok) {
      setPaired(true);
      setNotice(null);
      return;
    }
    setPaired(false);
    setNotice(REASON_TEXT[result.reason] ?? "The signature was not accepted. Nothing was stored.");
  }

  const expires = request ? new Date(request.expiresAt).toLocaleTimeString() : "";

  return (
    <div className="space-y-4">
      {paired && request && (
        <p role="status" className="rounded-lg border border-gold/50 p-3 text-sm text-foreground">
          Paired. The signer for {agent} proved it controls this address. Nothing was authorized. The root still has to approve a
          capability before this agent can spend.
        </p>
      )}
      {!request && (
        <button
          type="button"
          onClick={createRequest}
          disabled={!origin}
          className="focus-ring rounded-lg border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50"
        >
          Create a pairing request
        </button>
      )}
      {request && (
        <>
          <CopyBlock label="1. Message the signer will sign" code={pairingMessage(request)} />
          <CopyBlock label="2. Run this on the machine that holds the key" code={pairingCommand(request)} />
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">3. Paste the signature the command printed</span>
            <textarea
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
              rows={3}
              spellCheck={false}
              autoComplete="off"
              placeholder="0x… or the JSON from the command"
              className="mt-2 w-full rounded-lg border border-white/[.1] bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={check}
              disabled={signature.trim() === ""}
              className="focus-ring rounded-lg border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50"
            >
              Check signature
            </button>
            <span className="text-xs">Expires at {expires}. Create a new request after that.</span>
          </div>
          {notice && (
            <p role="status" className="text-xs text-destructive">
              {notice}
            </p>
          )}
        </>
      )}
    </div>
  );
}
