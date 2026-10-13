/**
 * Developer session client. A session is a read-only API token for one wallet and one origin.
 * It is never root authority. It cannot sign a payment, open or close a capability, or change a limit or payee.
 * The wallet signs a plain-text sign-in message, and nothing else is ever signed here.
 */

export const READ_SCOPE = "read:roots";

export type DeveloperSession = {
  token: string;
  wallet: string;
  scopes: string[];
  /** Unix seconds, as the backend reports it. */
  expiresAt: number;
};

export class DeveloperSessionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DeveloperSessionError";
    this.code = code;
  }
}

/** Plain-language meaning for each backend code. The fallback says what did not happen. */
export const SESSION_ERRORS: Record<string, string> = {
  origin_not_allowed: "This site is not allowed to request developer sessions. Use the PQTABS app.",
  origin_mismatch: "The page origin did not match the request. Reload the page and try again.",
  invalid_request: "The wallet address is not valid.",
  unknown_scope: "That permission is not available for developer sessions.",
  challenge_expired: "The sign-in request expired. Start again.",
  nonce_unknown: "The server does not know this sign-in request. Start again.",
  nonce_used: "This sign-in request was already used. Start again.",
  wrong_wallet: "The wallet changed during sign-in. Start again with the wallet you want to use.",
  invalid_signature: "The wallet signature did not match. No session was created. Try again.",
  missing_token: "No session token was sent.",
  unknown_session: "This session is not known. Sign in again.",
  session_revoked: "This session was revoked. Sign in again.",
  session_expired: "This session expired. Sign in again.",
  insufficient_scope: "This session cannot read this resource.",
  index_unavailable: "The developer session store is not open yet. Try again shortly.",
};

const FALLBACK = "The session request did not finish. No payment was signed or sent.";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = (await response.json().catch(() => null)) as (Partial<T> & { error?: string; detail?: string }) | null;
  if (!response.ok) {
    const code = body?.error ?? `http_${response.status}`;
    throw new DeveloperSessionError(code, SESSION_ERRORS[code] ?? FALLBACK);
  }
  if (!body) throw new DeveloperSessionError("bad_response", FALLBACK);
  return body as T;
}

export async function signInDeveloperSession(input: {
  backendUrl: string;
  wallet: string;
  origin: string;
  signMessage: (message: string) => Promise<string>;
  fetchImpl?: FetchLike;
}): Promise<DeveloperSession> {
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  const base = input.backendUrl.replace(/\/$/, "");
  const scopes = [READ_SCOPE];
  const json = { "content-type": "application/json", accept: "application/json" };

  const challenge = await call<{ nonce: string; message: string; expiresAt: number }>(fetchImpl, `${base}/v1/dev/challenge`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ wallet: input.wallet, origin: input.origin, scopes }),
  });
  if (typeof challenge.message !== "string" || typeof challenge.nonce !== "string") {
    throw new DeveloperSessionError("bad_response", FALLBACK);
  }

  const signature = await input.signMessage(challenge.message);
  const session = await call<{ token: string; wallet: string; scopes: string[]; expiresAt: number }>(fetchImpl, `${base}/v1/dev/session`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ wallet: input.wallet, origin: input.origin, scopes, nonce: challenge.nonce, signature }),
  });
  if (typeof session.token !== "string" || !session.scopes.includes(READ_SCOPE)) {
    throw new DeveloperSessionError("bad_response", FALLBACK);
  }
  return { token: session.token, wallet: session.wallet, scopes: session.scopes, expiresAt: session.expiresAt };
}

export async function checkDeveloperSession(input: { backendUrl: string; token: string; fetchImpl?: FetchLike }): Promise<{ wallet: string; scopes: string[]; expiresAt: number }> {
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  return call(fetchImpl, `${input.backendUrl.replace(/\/$/, "")}/v1/dev/session`, {
    method: "GET",
    headers: { authorization: `Bearer ${input.token}`, accept: "application/json" },
  });
}

export async function revokeDeveloperSession(input: { backendUrl: string; token: string; fetchImpl?: FetchLike }): Promise<void> {
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  await call<{ revoked: boolean }>(fetchImpl, `${input.backendUrl.replace(/\/$/, "")}/v1/dev/revoke`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.token}`, accept: "application/json" },
  });
}

/** A short, safe preview for the screen. The full token is never logged or stored by this module. */
export function tokenPreview(token: string): string {
  return token.length <= 10 ? "••••" : `${token.slice(0, 6)}…${token.slice(-4)}`;
}
