import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Address, Hex } from "viem";
import { assertOurRoot, type Clients, listFactoryRoots, loadClients, readPortfolio, relay, rootAbi, scanFailureRoots, tabAbi, usdcAbi, withRpcRetry } from "./chain.js";
import { BARKEEP, CHAIN_ID, EXPLORER, MAX_BODY_BYTES, PQROOT_NEXT, USDC, YIELD_VAULT } from "./constants.js";
import { allowedOrigins, authenticate, createChallenge, createSession, DevAuthError, ensureDevTables, revokeSession, SqlDevStore } from "./dev/session.js";
import { readRegistrarRoots, readRootState } from "./index/account.js";
import { decideSpend } from "./index/decide.js";
import { exactAccept, exactPayer, settleWithFacilitator } from "./index/exact-settlement.js";
import { startIngest } from "./index/ingest.js";
import { indexHealth } from "./index/lane.js";
import { readIndexedPortfolio } from "./index/portfolio.js";
import { askGroq, buildResearchQuote, dedicatedPayee, oneUsdcTransfer, parseBarkeepPayment, quoteAgrees, researchDelivery, researchTariff } from "./index/research.js";
import { openQuote, readQuote, rememberQuote, saveDelivery } from "./index/research-store.js";
import { parseSpendBlob, recoverSpendSigner, sameSpendTerms } from "./index/spend-blob.js";
import { recallSpend, rememberSpend } from "./index/spend-ledger.js";
import { openIndex, type Sql } from "./index/sql.js";
import { arcQuote, decideHttpPayment } from "./index/x402.js";
import { RateLimiter } from "./limit.js";
import { log } from "./log.js";
import { asAddress, asHex, asUint, encodeExecute, encodeReclaim, encodeRetrySweep, encodeSpend, RequestError } from "./validate.js";

const seen = new Map<string, Hex>();
const limits = new RateLimiter();
/** Index handles whose developer-session tables already exist. Keyed by the handle, so each store is migrated once. */
const devTablesReady = new WeakSet<object>();

function clientIp(header: string | undefined): string {
  return header?.split(",")[0]?.trim() || "unknown";
}

function forbiddenPayees(relayer: string | null): string[] {
  return [
    relayer ?? "",
    "0x2d0FdFafCC7E46226D3db00Ae976aA8F53996b95",
    "0xd462cc45b06Ae45daCd93F7B3979758C7b4a2cc0",
    "0x18398aA1dFdA63F30529c46E90ac41c1E75F7Ecf",
  ];
}

async function readCapability(clients: Clients, tab: Address) {
  const owner = await withRpcRetry(
    () => clients.public.readContract({ address: tab, abi: tabAbi, functionName: "owner" }),
    1,
  );
  await assertOurRoot(clients, owner);
  const [agent, maxPerCall, expiry, payees, balance, tabState, openExposure, maxOpenExposure, head] = await withRpcRetry(
    () =>
      Promise.all([
        clients.public.readContract({ address: tab, abi: tabAbi, functionName: "agent" }),
        clients.public.readContract({ address: tab, abi: tabAbi, functionName: "maxPerCall" }),
        clients.public.readContract({ address: tab, abi: tabAbi, functionName: "expiry" }),
        clients.public.readContract({ address: tab, abi: tabAbi, functionName: "payees" }),
        clients.public.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [tab] }),
        clients.public.readContract({ address: owner, abi: rootAbi, functionName: "tabs", args: [tab] }),
        clients.public.readContract({ address: owner, abi: rootAbi, functionName: "openExposure" }),
        clients.public.readContract({ address: owner, abi: rootAbi, functionName: "maxOpenExposure" }),
        clients.public.getBlock({ blockTag: "latest" }),
      ]),
    1,
  );
  return {
    owner,
    agent: String(agent),
    maxPerCall,
    expiry,
    payees,
    balance,
    cap: tabState[0],
    openExposure,
    maxOpenExposure,
    open: tabState[2] === true,
    now: head.timestamp,
  };
}

export function createApp(clients: Clients = loadClients(), getIndex?: () => Sql | null) {
  const app = new Hono<{ Variables: { requestId: string } }>();

  app.use("*", async (c, next) => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    c.header("access-control-allow-origin", "*");
    c.header("access-control-allow-headers", "content-type, authorization");
    c.header("access-control-allow-methods", "GET,POST,OPTIONS");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    const kind = c.req.path.startsWith("/v1/relay") ? "relay" : "read";
    const client = clientIp(c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"));
    if (!limits.allow(client, kind)) {
      // Refused before any handler runs, so nothing was signed or broadcast.
      const wait = limits.retryAfterSeconds(client, kind);
      c.header("retry-after", String(wait));
      return c.json(
        {
          error: "rate_limited",
          detail: `Too many requests from this connection. Wait ${wait} seconds, then try again. Nothing was sent.`,
          requestId,
        },
        429,
      );
    }
    await next();
    if (c.error) return;
    log({ requestId, route: c.req.path, result: "ok", latency_ms: Date.now() - started });
  });

  app.onError((error, c) => {
    const status = error instanceof RequestError ? error.status : 500;
    const code = error instanceof RequestError ? error.code : "internal";
    log({
      requestId: c.get("requestId"),
      route: c.req.path,
      result: "error",
      error: code,
    });
    const detail = error instanceof RequestError ? error.message : "The request could not be completed.";
    return c.json({ error: code, detail, requestId: c.get("requestId") }, status);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/v1/index", (c) => {
    const health = indexHealth();
    const lag = health.chainHead != null && health.indexedBlock != null ? (health.chainHead - health.indexedBlock).toString() : null;
    return c.json({
      indexedBlock: health.indexedBlock?.toString() ?? null,
      chainHead: health.chainHead?.toString() ?? null,
      lag,
      lastSuccessfulIndex: health.lastSuccessAt,
      lastError: health.lastError,
      queueDepth: health.busy ? 1 : 0,
    });
  });

  app.get("/ready", async (c) => {
    const chainId = await clients.public.getChainId();
    const code = await clients.public.getCode({ address: clients.factory });
    const ready = chainId === CHAIN_ID && !!code && code !== "0x";
    return c.json(
      { ok: ready, chainId, factory: clients.factory, factoryNext: clients.factoryNext ?? null, relayer: clients.relayerAddress !== null },
      ready ? 200 : 503,
    );
  });

  app.get("/v1/config", (c) =>
    c.json({
      chainId: CHAIN_ID,
      rpc: process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io",
      factory: clients.factory,
      factoryNext: clients.factoryNext ?? null,
      implementationNext: PQROOT_NEXT,
      yieldVault: YIELD_VAULT,
      usdc: USDC,
      barkeep: BARKEEP,
      explorer: EXPLORER,
    }),
  );

  app.get("/v1/registrars/:address/roots", async (c) => {
    const registrar = asAddress(c.req.param("address"), "registrar");
    const index = getIndex?.() ?? null;
    const factories = [clients.factory, ...(clients.factoryNext ? [clients.factoryNext] : [])];
    const indexed = index ? await readRegistrarRoots(index, clients.public, clients.factory, registrar) : [];
    let onChain: Address[] = [];
    try {
      onChain = await listFactoryRoots(clients.public, factories, registrar);
    } catch (error) {
      onChain = scanFailureRoots(indexed, error);
    }
    const seen = new Set(indexed.map((root) => root.toLowerCase()));
    const roots = [...indexed];
    for (const root of onChain) {
      if (seen.has(root.toLowerCase())) continue;
      seen.add(root.toLowerCase());
      roots.push(root);
    }
    return c.json({ registrar, count: roots.length.toString(), roots });
  });

  app.get("/v1/time", async (c) => {
    const head = await withRpcRetry(() => clients.public.getBlock({ blockTag: "latest" }));
    return c.json({ asOf: head.timestamp.toString() });
  });

  app.get("/v1/roots/:address", async (c) => {
    const root = asAddress(c.req.param("address"), "root");
    const index = getIndex?.() ?? null;
    if (index) return c.json(await readRootState(index, clients.public, clients.factory, root));
    await assertOurRoot(clients, root);
    const [pqVk, registrar, nextNonce, maxOpenExposure, openExposure] = await Promise.all([
      withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "pqVk" })),
      withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "registrar" })),
      withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "nextNonce" })),
      withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "maxOpenExposure" })),
      withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "openExposure" })),
    ]);
    const balance = await withRpcRetry(() => clients.public.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [root] }));
    return c.json({
      root,
      pqVk,
      registrar,
      nextNonce: nextNonce.toString(),
      maxOpenExposure: maxOpenExposure.toString(),
      openExposure: openExposure.toString(),
      usdc: balance.toString(),
      balancesConfirmed: true,
    });
  });

  app.get("/v1/roots/:address/portfolio", async (c) => {
    const root = asAddress(c.req.param("address"), "root");
    const index = getIndex?.() ?? null;
    const started = Date.now();
    const portfolio = index ? await readIndexedPortfolio(index, clients.public, clients.factory, root) : await readPortfolio(clients, root);
    c.header("Server-Timing", `app;dur=${Date.now() - started}`);
    return c.json({ root, source: index ? "index" : "live", ...portfolio });
  });

  app.get("/v1/roots/:root/tabs/:tab", async (c) => {
    const root = asAddress(c.req.param("root"), "root");
    const tab = asAddress(c.req.param("tab"), "tab");
    await assertOurRoot(clients, root);
    const state = await clients.public.readContract({ address: root, abi: rootAbi, functionName: "tabs", args: [tab] });
    const [owner, agent, maxPerCall, expiry, balance] = await Promise.all([
      clients.public.readContract({ address: tab, abi: tabAbi, functionName: "owner" }),
      clients.public.readContract({ address: tab, abi: tabAbi, functionName: "agent" }),
      clients.public.readContract({ address: tab, abi: tabAbi, functionName: "maxPerCall" }),
      clients.public.readContract({ address: tab, abi: tabAbi, functionName: "expiry" }),
      clients.public.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [tab] }),
    ]);
    return c.json({
      root,
      tab,
      cap: state[0].toString(),
      expiry: state[1].toString(),
      open: state[2],
      needsSweep: state[3],
      owner,
      agent,
      maxPerCall: maxPerCall.toString(),
      tabExpiry: expiry.toString(),
      usdc: balance.toString(),
    });
  });

  app.get("/v1/tx/:hash", async (c) => {
    const hash = asHex(c.req.param("hash"), "hash");
    if (hash.length !== 66) throw new RequestError(400, "bad_hash", "transaction hash must be 32 bytes");
    const receipt = await withRpcRetry(() => clients.public.getTransactionReceipt({ hash }));
    return c.json({
      hash: receipt.transactionHash,
      status: receipt.status,
      block: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
    });
  });

  app.post("/v1/relay/execute", async (c) => {
    const body = await readBody(c);
    const root = asAddress(body.root, "root");
    await assertOurRoot(clients, root);
    const data = encodeExecute(asHex(body.action, "action"), asUint(body.nonce, "nonce"), asUint(body.deadline, "deadline"), asHex(body.signature, "signature"));
    const current = await withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "nextNonce" }));
    const nonce = asUint(body.nonce, "nonce");
    if (nonce < current) throw new RequestError(409, "nonce_consumed", "that nonce is already used");
    if (nonce !== current) throw new RequestError(409, "bad_nonce", "nonce does not match the root");
    const result = await relay(clients, root, data, seen);
    log({ route: "/v1/relay/execute", root, nonce: body.nonce, tx: result.hash });
    return c.json(result);
  });

  app.post("/v1/relay/reclaim", async (c) => {
    const body = await readBody(c);
    const root = asAddress(body.root, "root");
    const tab = asAddress(body.tab, "tab");
    await assertOurRoot(clients, root);
    const result = await relay(clients, root, encodeReclaim(tab), seen);
    log({ route: "/v1/relay/reclaim", root, tab, tx: result.hash });
    return c.json(result);
  });

  app.post("/v1/relay/retry-sweep", async (c) => {
    const body = await readBody(c);
    const root = asAddress(body.root, "root");
    const tab = asAddress(body.tab, "tab");
    await assertOurRoot(clients, root);
    const result = await relay(clients, root, encodeRetrySweep(tab), seen);
    log({ route: "/v1/relay/retry-sweep", root, tab, tx: result.hash });
    return c.json(result);
  });

  // Developer sessions: read-only, wallet-authorized, revocable. They never spend and never bypass a capability's checks.
  const devIndex = async (): Promise<Sql> => {
    const index = getIndex?.() ?? null;
    if (!index) throw new RequestError(503, "index_unavailable", "The developer session store is not open.");
    if (!devTablesReady.has(index)) {
      await ensureDevTables(index);
      devTablesReady.add(index);
    }
    return index;
  };
  const bearer = (c: { req: { header: (name: string) => string | undefined } }): string | undefined =>
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") || undefined;
  const devFailure = (c: { json: (body: unknown, status: number) => Response }, error: unknown) => {
    if (error instanceof DevAuthError) return c.json({ error: error.code, detail: error.message }, error.status as 400);
    throw error;
  };

  app.post("/v1/dev/challenge", async (c) => {
    const body = await readBody(c);
    try {
      const headerOrigin = c.req.header("origin");
      if (headerOrigin && body.origin !== headerOrigin) throw new DevAuthError("origin_mismatch", 403, "Origin header does not match the origin in the body");
      const store = new SqlDevStore(await devIndex());
      const result = await createChallenge({
        store,
        wallet: body.wallet,
        origin: body.origin,
        scopes: body.scopes,
        now: Math.floor(Date.now() / 1000),
        allowed: allowedOrigins(),
      });
      c.header("cache-control", "no-store");
      return c.json({ nonce: result.nonce, message: result.message, expiresAt: result.expiresAt });
    } catch (error) {
      return devFailure(c, error);
    }
  });

  app.post("/v1/dev/session", async (c) => {
    const body = await readBody(c);
    try {
      const headerOrigin = c.req.header("origin");
      if (headerOrigin && body.origin !== headerOrigin) throw new DevAuthError("origin_mismatch", 401, "Origin header does not match the origin in the body");
      const store = new SqlDevStore(await devIndex());
      const session = await createSession({
        store,
        wallet: body.wallet,
        origin: body.origin,
        scopes: body.scopes,
        nonce: body.nonce,
        signature: body.signature,
        now: Math.floor(Date.now() / 1000),
      });
      c.header("cache-control", "no-store");
      return c.json({
        token: session.token,
        wallet: session.wallet,
        scopes: session.scopes,
        expiresAt: session.expiresAt,
        note: "Shown once. Keep it in memory or a secret store. It is read-only and cannot spend.",
      });
    } catch (error) {
      return devFailure(c, error);
    }
  });

  app.get("/v1/dev/session", async (c) => {
    try {
      const store = new SqlDevStore(await devIndex());
      const session = await authenticate({ store, token: bearer(c), now: Math.floor(Date.now() / 1000) });
      c.header("cache-control", "no-store");
      return c.json({ wallet: session.wallet, scopes: session.scopes, expiresAt: session.expiresAt, revoked: false });
    } catch (error) {
      return devFailure(c, error);
    }
  });

  app.post("/v1/dev/revoke", async (c) => {
    try {
      const store = new SqlDevStore(await devIndex());
      await revokeSession({ store, token: bearer(c), now: Math.floor(Date.now() / 1000) });
      return c.json({ revoked: true });
    } catch (error) {
      return devFailure(c, error);
    }
  });

  app.get("/v1/dev/roots/:address/portfolio", async (c) => {
    try {
      const store = new SqlDevStore(await devIndex());
      await authenticate({ store, token: bearer(c), requiredScope: "read:roots", now: Math.floor(Date.now() / 1000) });
    } catch (error) {
      return devFailure(c, error);
    }
    const root = asAddress(c.req.param("address"), "root");
    const index = getIndex?.() ?? null;
    const portfolio = index ? await readIndexedPortfolio(index, clients.public, clients.factory, root) : await readPortfolio(clients, root);
    c.header("cache-control", "no-store");
    return c.json({ root, source: index ? "index" : "live", ...portfolio });
  });

  app.post("/v1/research/quote", async (c) => {
    const body = await readBody(c);
    const task = typeof body.task === "string" ? body.task : "";
    const merchant = dedicatedPayee(process.env.MERCHANT_PAYEE, forbiddenPayees(clients.relayerAddress));
    if (!merchant) throw new RequestError(503, "merchant_unconfigured", "The merchant receiving address is not configured.");
    const index = getIndex?.() ?? null;
    if (!index) throw new RequestError(503, "index_unavailable", "The quote store is not open.");
    const price = researchTariff();
    const now = Math.floor(Date.now() / 1000);
    let draft: ReturnType<typeof buildResearchQuote>;
    try {
      draft = buildResearchQuote({
        id: crypto.randomUUID(),
        task,
        payee: merchant,
        price,
        now,
        resourceUrl: "https://pqtabs.onrender.com/v1/research",
      });
    } catch {
      throw new RequestError(400, "bad_task", "The question is empty or too long. Nothing was signed.");
    }
    const existing = await openQuote(index, draft.bodyHash, now);
    if (existing) {
      const again = buildResearchQuote({
        id: existing.id,
        task: existing.task,
        payee: merchant,
        price: BigInt(existing.price),
        now: Number(existing.expires_at) - 600,
        resourceUrl: "https://pqtabs.onrender.com/v1/research",
      });
      return c.json({ paymentRequired: again.paymentRequired, quoteId: existing.id, scheme: "pqtabs-barkeep", standardExact: false, exact: true, replayed: true });
    }
    await rememberQuote(index, draft);
    return c.json({ paymentRequired: draft.paymentRequired, quoteId: draft.id, scheme: "pqtabs-barkeep", standardExact: false, exact: true, replayed: false });
  });

  app.post("/v1/research/exact", async (c) => {
    const body = await readBody(c);
    const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
    const index = getIndex?.() ?? null;
    const stored = await readQuote(index, quoteId);
    if (!stored) throw new RequestError(400, "unknown_quote", "That quote is not stored.");
    if (stored.tx_hash && stored.status === "complete" && stored.result) {
      return c.json({ status: "complete", result: stored.result, model: stored.model, txHash: stored.tx_hash, scheme: "exact", standardExact: true, replayed: true });
    }
    if (Number(stored.expires_at) <= Math.floor(Date.now() / 1000)) {
      throw new RequestError(400, "quote_expired", "That quote has expired. Nothing was settled.");
    }
    const requirements = exactAccept({
      id: stored.id,
      bodyHash: stored.body_hash,
      price: stored.price,
      payee: stored.payee,
      ttlSeconds: 600,
    });
    const payer = exactPayer(body.paymentPayload, requirements);
    if (!payer) throw new RequestError(400, "bad_payload", "The exact payload does not match this quote.");
    const settled = await settleWithFacilitator(requirements, body.paymentPayload);
    if (!settled.ok) throw new RequestError(402, "not_settled", settled.reason);
    const receipt = await withRpcRetry(() => clients.public.getTransactionReceipt({ hash: settled.transaction as Hex }), 1);
    const matched = oneUsdcTransfer(
      { status: receipt.status, logs: receipt.logs.map((entry) => ({ address: entry.address, topics: entry.topics, data: entry.data })) },
      { from: payer, to: stored.payee, value: stored.price },
    );
    if (!matched) throw new RequestError(409, "receipt_mismatch", "The facilitator transaction is not this quote.");
    const answered = stored.result ? { text: stored.result, model: stored.model } : await askGroq(stored.task);
    const status = researchDelivery(true, answered.text);
    if (status === "unpaid") throw new RequestError(409, "receipt_mismatch", "The facilitator transaction is not this quote.");
    await saveDelivery(index, quoteId, settled.transaction, status, answered.text, answered.model);
    return c.json({ status, result: answered.text, model: answered.model, txHash: settled.transaction, scheme: "exact", standardExact: true, replayed: false });
  });

  app.post("/v1/x402/decide", async (c) => {
    const body = await readBody(c);
    const tab = asAddress(body.tab, "tab");
    if (!arcQuote(body.paymentRequired) && !parseBarkeepPayment(body.paymentRequired)) {
      throw new RequestError(400, "policy_refused", "no_arc_exact");
    }
    const facts = await readCapability(clients, tab);
    const decision = decideHttpPayment(402, body.paymentRequired, {
      now: facts.now,
      signer: null,
      tabAgent: facts.agent,
      payees: facts.payees,
      maxPerCall: facts.maxPerCall,
      balance: facts.balance,
      expiry: facts.expiry,
      open: facts.open,
      openExposure: facts.openExposure,
      maxOpenExposure: facts.maxOpenExposure,
    });
    return c.json({ ...decision, capability: tab, cap: facts.cap.toString() });
  });

  app.post("/v1/relay/spend", async (c) => {
    const body = await readBody(c);
    const tab = asAddress(body.tab, "tab");
    const to = asAddress(body.to, "to");
    const value = asUint(body.value, "value");
    const validAfter = asUint(body.validAfter, "validAfter");
    const validBefore = asUint(body.validBefore, "validBefore");
    const nonce = asHex(body.nonce, "nonce");
    const signature = asHex(body.signature, "signature");
    const blob = parseSpendBlob(signature);
    if (!blob) throw new RequestError(400, "bad_signature_length", "spend blob must be 213 bytes");
    if (!sameSpendTerms(blob, { to, value, validAfter, validBefore, nonce })) {
      throw new RequestError(400, "policy_refused", "tampered_action");
    }
    let signer: Address;
    try {
      signer = await recoverSpendSigner(tab, blob);
    } catch {
      throw new RequestError(400, "policy_refused", "invalid_signature");
    }
    const custom = parseBarkeepPayment(body.paymentRequired);
    const quote = arcQuote(body.paymentRequired);
    const index = getIndex?.() ?? null;
    if (custom) {
      const stored = await readQuote(index, custom.quoteId);
      if (!stored) throw new RequestError(400, "policy_refused", "unknown_quote");
      const agreement = quoteAgrees(stored, custom, to, value.toString(), Math.floor(Date.now() / 1000));
      if (agreement !== "ok") throw new RequestError(400, "policy_refused", agreement);
      const merchant = dedicatedPayee(process.env.MERCHANT_PAYEE, forbiddenPayees(clients.relayerAddress));
      if (!merchant) throw new RequestError(503, "merchant_unconfigured", "The merchant receiving address is not configured.");
      if (merchant.toLowerCase() !== to.toLowerCase()) throw new RequestError(400, "policy_refused", "wrong_payee");
    } else if (!quote) {
      throw new RequestError(400, "policy_refused", "no_arc_exact");
    } else if (quote.price !== value.toString() || quote.payee.toLowerCase() !== to.toLowerCase()) {
      throw new RequestError(400, "policy_refused", "quote_mismatch");
    }
    const data = encodeSpend({ tab, to, value, validAfter, validBefore, nonce, signature });
    const prior = (await recallSpend(index, data)) ?? seen.get(data) ?? null;
    if (prior) {
      log({ route: "/v1/relay/spend", tab, tx: prior });
      return c.json({ hash: prior, scheme: "pqtabs-barkeep", standardExact: false, replayed: true });
    }
    const facts = await readCapability(clients, tab);
    const decision = decideSpend({
      now: facts.now,
      amount: value,
      payee: to,
      signer,
      tabAgent: facts.agent,
      payees: facts.payees,
      maxPerCall: facts.maxPerCall,
      balance: facts.balance,
      expiry: facts.expiry,
      open: facts.open,
      openExposure: facts.openExposure,
      maxOpenExposure: facts.maxOpenExposure,
      serviceAvailable: true,
    });
    if (decision.decision !== "ALLOW") {
      throw new RequestError(400, "policy_refused", decision.reason.join(","));
    }
    const result = await relay(clients, USDC, data, seen);
    try {
      await rememberSpend(index, data, result.hash);
    } catch {
      /* The hash is still returned. The in-memory cache covers this process. */
    }
    log({ route: "/v1/relay/spend", root: facts.owner, tab, tx: result.hash });
    return c.json({ ...result, decision, scheme: "pqtabs-barkeep", standardExact: false, replayed: false });
  });

  app.post("/v1/research/result", async (c) => {
    const body = await readBody(c);
    const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
    const txHash = typeof body.txHash === "string" ? body.txHash : "";
    const tab = asAddress(String(body.tab ?? ""), "tab");
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new RequestError(400, "bad_hash", "A result needs the Arc transaction hash.");
    const index = getIndex?.() ?? null;
    const stored = await readQuote(index, quoteId);
    if (!stored) throw new RequestError(400, "unknown_quote", "That quote is not stored.");
    if (stored.tx_hash && stored.tx_hash.toLowerCase() !== txHash.toLowerCase()) {
      throw new RequestError(409, "quote_already_settled", "This quote is already bound to a different transaction.");
    }
    if (stored.status === "complete" && stored.result && stored.tx_hash) {
      return c.json({ status: "complete", result: stored.result, model: stored.model, txHash: stored.tx_hash, scheme: "pqtabs-barkeep", standardExact: false });
    }
    const receipt = await withRpcRetry(() => clients.public.getTransactionReceipt({ hash: txHash as Hex }), 1);
    const matched = oneUsdcTransfer(
      { status: receipt.status, logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })) },
      { from: tab, to: stored.payee, value: stored.price },
    );
    if (!matched) throw new RequestError(409, "receipt_mismatch", "The Arc receipt is not this quote.");
    const answered = stored.result ? { text: stored.result, model: stored.model } : await askGroq(stored.task);
    const status = researchDelivery(true, answered.text);
    if (status === "unpaid") throw new RequestError(409, "receipt_mismatch", "The Arc receipt is not this quote.");
    await saveDelivery(index, quoteId, txHash, status, answered.text, answered.model);
    return c.json({ status, result: answered.text, model: answered.model, txHash, scheme: "pqtabs-barkeep", standardExact: false });
  });

  return app;
}

async function readBody(c: { req: { text: () => Promise<string> } }): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) throw new RequestError(413, "payload_too_large", "body is too large");
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new RequestError(400, "bad_json", "body must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "bad_json", "body is not JSON");
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("/src/server.js")) {
  const port = Number(process.env.PORT || 8080);
  const clients = loadClients();
  const holder: { sql: Sql | null } = { sql: null };
  serve({ fetch: createApp(clients, () => holder.sql).fetch, port }, (info) => {
    log({ route: "listen", result: `port ${info.port}` });
  });
  const hostedWithoutDatabase = Boolean(process.env.RENDER_SERVICE_ID) && !process.env.DATABASE_URL;
  if (hostedWithoutDatabase) {
    log({ route: "index", result: "skipped", error: "DATABASE_URL is not set" });
  } else {
    openIndex()
      .then((index) => {
        holder.sql = index;
        startIngest(index, clients.public, [clients.factory, ...(clients.factoryNext ? [clients.factoryNext] : [])]);
        log({ route: "index", result: "ready" });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : "index_open_failed";
        log({ route: "index", result: "error", error: message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted").slice(0, 180) });
      });
  }
}
