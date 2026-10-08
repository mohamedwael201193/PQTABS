import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Address, Hex } from "viem";
import { assertOurRoot, type Clients, factoryAbi, loadClients, readPortfolio, relay, rootAbi, tabAbi, usdcAbi, withRpcRetry } from "./chain.js";
import { BARKEEP, CHAIN_ID, EXPLORER, MAX_BODY_BYTES, USDC } from "./constants.js";
import { readRegistrarRoots, readRootState } from "./index/account.js";
import { startIngest } from "./index/ingest.js";
import { indexHealth } from "./index/lane.js";
import { readIndexedPortfolio } from "./index/portfolio.js";
import { decideSpend } from "./index/decide.js";
import { parseSpendBlob, recoverSpendSigner, sameSpendTerms } from "./index/spend-blob.js";
import { arcQuote, decideHttpPayment } from "./index/x402.js";
import { openIndex, type Sql } from "./index/sql.js";
import { RateLimiter } from "./limit.js";
import { log } from "./log.js";
import { asAddress, asHex, asUint, encodeExecute, encodeReclaim, encodeRetrySweep, encodeSpend, RequestError } from "./validate.js";

const seen = new Map<string, Hex>();
const limits = new RateLimiter();

function clientIp(header: string | undefined): string {
  return header?.split(",")[0]?.trim() || "unknown";
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
    c.header("access-control-allow-headers", "content-type");
    c.header("access-control-allow-methods", "GET,POST,OPTIONS");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    const kind = c.req.path.startsWith("/v1/relay") ? "relay" : "read";
    if (!limits.allow(clientIp(c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip")), kind)) {
      return c.json({ error: "rate_limited", requestId }, 429);
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
    return c.json({ ok: ready, chainId, factory: clients.factory, relayer: clients.relayerAddress !== null }, ready ? 200 : 503);
  });

  app.get("/v1/config", (c) =>
    c.json({
      chainId: CHAIN_ID,
      rpc: process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io",
      factory: clients.factory,
      usdc: USDC,
      barkeep: BARKEEP,
      explorer: EXPLORER,
    }),
  );

  app.get("/v1/registrars/:address/roots", async (c) => {
    const registrar = asAddress(c.req.param("address"), "registrar");
    const index = getIndex?.() ?? null;
    if (index) {
      const roots = await readRegistrarRoots(index, clients.public, clients.factory, registrar);
      return c.json({ registrar, count: roots.length.toString(), roots });
    }
    const count = await clients.public.readContract({
      address: clients.factory,
      abi: factoryAbi,
      functionName: "rootCount",
      args: [registrar],
    });
    const roots: Address[] = [];
    for (let i = 0n; i < count; i++) {
      roots.push(
        await clients.public.readContract({
          address: clients.factory,
          abi: factoryAbi,
          functionName: "rootAt",
          args: [registrar, i],
        }),
      );
    }
    return c.json({ registrar, count: count.toString(), roots });
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
    return c.json({ root, ...portfolio });
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

  app.post("/v1/x402/decide", async (c) => {
    const body = await readBody(c);
    const tab = asAddress(body.tab, "tab");
    if (!arcQuote(body.paymentRequired)) throw new RequestError(400, "policy_refused", "no_arc_exact");
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
    let signer;
    try {
      signer = await recoverSpendSigner(tab, blob);
    } catch {
      throw new RequestError(400, "policy_refused", "invalid_signature");
    }
    const quote = arcQuote(body.paymentRequired);
    if (!quote) throw new RequestError(400, "policy_refused", "no_arc_exact");
    if (quote.price !== value.toString() || quote.payee.toLowerCase() !== to.toLowerCase()) {
      throw new RequestError(400, "policy_refused", "quote_mismatch");
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
    const data = encodeSpend({ tab, to, value, validAfter, validBefore, nonce, signature });
    const result = await relay(clients, USDC, data, seen);
    log({ route: "/v1/relay/spend", root: facts.owner, tab, tx: result.hash });
    return c.json({ ...result, decision });
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
        startIngest(index, clients.public, clients.factory);
        log({ route: "index", result: "ready" });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : "index_open_failed";
        log({ route: "index", result: "error", error: message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted").slice(0, 180) });
      });
  }
}
