import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Address, Hex } from "viem";
import { assertOurRoot, type Clients, factoryAbi, loadClients, readPortfolio, relay, rootAbi, tabAbi, usdcAbi, withRpcRetry } from "./chain.js";
import { BARKEEP, CHAIN_ID, EXPLORER, MAX_BODY_BYTES, USDC } from "./constants.js";
import { RateLimiter } from "./limit.js";
import { log } from "./log.js";
import { asAddress, asHex, asUint, encodeExecute, encodeReclaim, encodeRetrySweep, encodeSpend, RequestError } from "./validate.js";

const seen = new Map<string, Hex>();
const limits = new RateLimiter();

function clientIp(header: string | undefined): string {
  return header?.split(",")[0]?.trim() || "unknown";
}

export function createApp(clients: Clients = loadClients()) {
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
    return c.json({ error: code, detail: error.message, requestId: c.get("requestId") }, status);
  });

  app.get("/health", (c) => c.json({ ok: true }));

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
    });
  });

  app.get("/v1/roots/:address/portfolio", async (c) => {
    const root = asAddress(c.req.param("address"), "root");
    const portfolio = await readPortfolio(clients, root);
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

  app.post("/v1/relay/spend", async (c) => {
    const body = await readBody(c);
    const tab = asAddress(body.tab, "tab");
    const to = asAddress(body.to, "to");
    const owner = await clients.public.readContract({ address: tab, abi: tabAbi, functionName: "owner" });
    await assertOurRoot(clients, owner);
    const data = encodeSpend({
      tab,
      to,
      value: asUint(body.value, "value"),
      validAfter: asUint(body.validAfter, "validAfter"),
      validBefore: asUint(body.validBefore, "validBefore"),
      nonce: asHex(body.nonce, "nonce"),
      signature: asHex(body.signature, "signature"),
    });
    const result = await relay(clients, USDC, data, seen);
    log({ route: "/v1/relay/spend", root: owner, tab, tx: result.hash });
    return c.json(result);
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
  serve({ fetch: createApp().fetch, port }, (info) => {
    log({ route: "listen", result: `port ${info.port}` });
  });
}
