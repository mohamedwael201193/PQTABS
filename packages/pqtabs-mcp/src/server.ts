import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type AgentSigner,
  ARC_CHAIN_ID,
  DEFAULT_EXPLORER_URL,
  PolicyRefusedError,
  type PqtabsClient,
  PqtabsError,
} from "pqtabs-sdk";
import { z } from "zod";

export const PACKAGE_VERSION = "0.1.1";

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected an EVM address");
const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte transaction hash");
const rawAmountSchema = z.string().regex(/^[0-9]+$/, "expected a whole number of raw USDC units (6 decimals)");
const taskSchema = z.string().trim().min(1).max(2000);

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type ServerOptions = {
  client: PqtabsClient;
  /** Provide a signer only when the operator has set one. Without it the paid tool is not registered. */
  signer?: AgentSigner;
  explorerUrl?: string;
};

function ok(data: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

/** A tool failure carries the protocol's own code and reasons. It never carries a stack or a key. */
function fail(error: unknown): ToolResult {
  if (error instanceof PolicyRefusedError) {
    return failure({ error: "policy_refused", message: error.message, reasons: [...error.reasons], retryable: false, nothingSigned: true });
  }
  if (error instanceof PqtabsError) {
    return failure({
      error: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    });
  }
  return failure({ error: "internal", message: "The request could not be completed. Nothing was signed by this tool call.", retryable: false });
}

function failure(body: Record<string, unknown>): ToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

async function run(work: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await work();
  } catch (error) {
    return fail(error);
  }
}

const expiresAt = (unix: string) => new Date(Number(unix) * 1000).toISOString();

/**
 * Builds the MCP server. Every tool is a thin wrapper over the SDK, which reads the backend and Arc.
 * No tool creates a root, changes a limit, adds a payee, rotates root authority, or bypasses a policy check.
 */
export function createPqtabsServer(options: ServerOptions): McpServer {
  const { client, signer } = options;
  const explorer = options.explorerUrl ?? DEFAULT_EXPLORER_URL;
  const txUrl = (hash: string) => `${explorer}/tx/${hash}`;

  const server = new McpServer({ name: "pqtabs", version: PACKAGE_VERSION });

  server.registerTool(
    "pqtabs_status",
    {
      title: "PQTABS status",
      description:
        "Checks the PQTABS backend, its Arc chain configuration, and the Arc RPC chain id. Read-only. Use it first to confirm the connection before any other tool.",
      inputSchema: {},
      outputSchema: {
        backendOk: z.boolean(),
        backendConfigChainId: z.number(),
        backendRpcChainId: z.number(),
        sdkRpcChainId: z.number(),
        onArc: z.boolean(),
        usdc: z.string(),
        barkeep: z.string(),
        relayerConfigured: z.boolean(),
        paidResearchEnabled: z.boolean(),
        agentAddress: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    () =>
      run(async () => {
        const [ready, config, sdkRpcChainId] = await Promise.all([client.read.ready(), client.read.config(), client.read.rpcChainId()]);
        return ok({
          backendOk: ready.ok,
          backendConfigChainId: config.chainId,
          backendRpcChainId: ready.chainId,
          sdkRpcChainId,
          onArc: config.chainId === ARC_CHAIN_ID && ready.chainId === ARC_CHAIN_ID && sdkRpcChainId === ARC_CHAIN_ID,
          usdc: config.usdc,
          barkeep: config.barkeep,
          relayerConfigured: ready.relayer,
          paidResearchEnabled: signer !== undefined,
          ...(signer ? { agentAddress: signer.address } : {}),
        });
      }),
  );

  server.registerTool(
    "pqtabs_get_portfolio",
    {
      title: "Root portfolio",
      description:
        "Reads one PQTABS root and its capabilities from Arc through the backend: how many are open, their caps and balances. Read-only. It never creates or changes a capability.",
      inputSchema: { root: addressSchema },
      outputSchema: {
        root: z.string(),
        tabCount: z.number(),
        openCount: z.number(),
        tabs: z.array(z.record(z.string(), z.unknown())),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ root }) =>
      run(async () => {
        const portfolio = await client.read.portfolio(root);
        return ok({
          root: portfolio.root,
          tabCount: portfolio.tabs.length,
          openCount: portfolio.tabs.filter((tab) => tab.open).length,
          tabs: portfolio.tabs as unknown as Record<string, unknown>[],
        });
      }),
  );

  server.registerTool(
    "pqtabs_list_capabilities",
    {
      title: "List capabilities",
      description:
        "Lists the capabilities under a root with each one's cap, per-payment limit, live USDC balance, expiry, and approved payees. Read-only. Amounts are raw USDC (6 decimals).",
      inputSchema: { root: addressSchema, openOnly: z.boolean().optional() },
      outputSchema: {
        root: z.string(),
        capabilities: z.array(
          z.object({
            tab: z.string(),
            agent: z.string(),
            open: z.boolean(),
            capRaw: z.string(),
            maxPerCallRaw: z.string(),
            balanceRaw: z.string(),
            expiresAt: z.string(),
            payees: z.array(z.string()),
          }),
        ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ root, openOnly }) =>
      run(async () => {
        const portfolio = await client.read.portfolio(root);
        const capabilities = portfolio.tabs
          .filter((tab) => !openOnly || tab.open)
          .map((tab) => ({
            tab: tab.tab,
            agent: tab.agent,
            open: tab.open,
            capRaw: tab.cap,
            maxPerCallRaw: tab.maxPerCall,
            balanceRaw: tab.usdc,
            expiresAt: expiresAt(tab.expiry),
            payees: tab.payees,
          }));
        return ok({ root: portfolio.root, capabilities });
      }),
  );

  server.registerTool(
    "pqtabs_create_research_quote",
    {
      title: "Create a research quote",
      description:
        "Asks PQTABS to price one Arc Research question. Creates a quote record only. It signs nothing and moves no USDC. The quote expires after the reported expiresInSeconds.",
      inputSchema: { task: taskSchema },
      outputSchema: {
        quoteId: z.string(),
        replayed: z.boolean(),
        priceRaw: z.string(),
        payee: z.string(),
        model: z.string(),
        provider: z.string(),
        expiresInSeconds: z.number(),
        chainId: z.number(),
        paymentRequired: z.record(z.string(), z.unknown()),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ task }) =>
      run(async () => {
        const quote = await client.research.quote(task);
        return ok({
          quoteId: quote.quoteId,
          replayed: quote.replayed,
          priceRaw: quote.priceRaw,
          payee: quote.payee,
          model: quote.model,
          provider: quote.provider,
          expiresInSeconds: quote.expiresInSeconds,
          chainId: ARC_CHAIN_ID,
          paymentRequired: quote.paymentRequired as Record<string, unknown>,
        });
      }),
  );

  server.registerTool(
    "pqtabs_check_spend_policy",
    {
      title: "Check a spend against policy",
      description:
        "Prices one question and asks the backend whether the capability would allow that payment now. Returns ALLOW or REFUSE with the backend's reasons. Creates a quote record on the backend, which is not a payment: nothing is signed, broadcast, or moved.",
      inputSchema: { tab: addressSchema, task: taskSchema },
      outputSchema: {
        quoteId: z.string(),
        capability: z.string(),
        chainId: z.number(),
        allowed: z.boolean(),
        decision: z.enum(["ALLOW", "REFUSE", "NO_PAYMENT"]),
        reasons: z.array(z.string()),
        priceRaw: z.string(),
        payee: z.string(),
        agent: z.string(),
        expiresAt: z.string(),
        remainingBalanceRaw: z.string(),
        maxPerCallRaw: z.string(),
        signerMatchesAgent: z.boolean().nullable(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ tab, task }) =>
      run(async () => {
        const quote = await client.research.quote(task);
        const policy = await client.research.checkPolicy({ tab, paymentRequired: quote.paymentRequired });
        return ok({
          quoteId: quote.quoteId,
          capability: policy.capability,
          chainId: ARC_CHAIN_ID,
          allowed: policy.allowed,
          decision: policy.decision,
          reasons: policy.reasons,
          priceRaw: policy.priceRaw,
          payee: policy.payee,
          agent: policy.agent,
          expiresAt: expiresAt(policy.expiry),
          remainingBalanceRaw: policy.remainingBalanceRaw,
          maxPerCallRaw: policy.maxPerCallRaw,
          signerMatchesAgent: signer ? signer.address.toLowerCase() === policy.agent.toLowerCase() : null,
        });
      }),
  );

  server.registerTool(
    "pqtabs_get_receipt",
    {
      title: "Verify a receipt",
      description:
        "Reads an Arc transaction and checks it against one expected payment: exactly one USDC transfer from the capability to the payee for the stated amount. Read-only.",
      inputSchema: { txHash: txHashSchema, tab: addressSchema, payee: addressSchema, amountRaw: rawAmountSchema },
      outputSchema: {
        status: z.enum(["settled", "reverted", "not_found", "mismatch"]),
        txHash: z.string(),
        chainId: z.number(),
        explorerUrl: z.string(),
        blockNumber: z.string().optional(),
        reason: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ txHash, tab, payee, amountRaw }) =>
      run(async () => {
        const check = await client.research.verifyReceipt({ txHash, tab, payee, valueRaw: amountRaw });
        return ok({
          status: check.status,
          txHash: check.txHash,
          chainId: ARC_CHAIN_ID,
          explorerUrl: txUrl(check.txHash),
          ...(check.status === "settled" ? { blockNumber: check.blockNumber } : {}),
          ...(check.status === "mismatch" ? { reason: check.reason } : {}),
        });
      }),
  );

  server.registerTool(
    "pqtabs_recover_result",
    {
      title: "Recover a research result",
      description:
        "Fetches the answer for a quote whose payment already settled. It never relays, signs, or charges. Use it when a paid run reported result_pending.",
      inputSchema: { quoteId: z.string().regex(/^[0-9a-f-]{36}$/), txHash: txHashSchema, tab: addressSchema, payee: addressSchema.optional(), amountRaw: rawAmountSchema.optional() },
      outputSchema: {
        status: z.enum(["complete", "result_pending", "settlement_pending"]),
        quoteId: z.string(),
        txHash: z.string(),
        chainId: z.number(),
        result: z.string().optional(),
        model: z.string().optional(),
        note: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ quoteId, txHash, tab, payee, amountRaw }) =>
      run(async () => {
        const outcome = await client.research.recoverResult({
          quoteId,
          txHash,
          tab,
          ...(payee === undefined ? {} : { payee }),
          ...(amountRaw === undefined ? {} : { valueRaw: amountRaw }),
        });
        return ok({
          status: outcome.status,
          quoteId: outcome.quoteId,
          txHash: outcome.txHash ?? "",
          chainId: ARC_CHAIN_ID,
          ...(outcome.status === "complete" ? { result: outcome.result, model: outcome.model } : {}),
          ...("note" in outcome ? { note: outcome.note } : {}),
        });
      }),
  );

  if (signer) {
    server.registerTool(
      "pqtabs_run_paid_research",
      {
        title: "Pay for research (spends USDC)",
        description:
          "STATE-CHANGING. Spends USDC from a capability that the root already opened, and only inside its cap, per-payment limit, expiry, and approved payee. Refuses before signing if any check fails. Requires confirmSpend true and maxPriceRaw. Reports the capability, payee, amount, and chain.",
        inputSchema: {
          tab: addressSchema,
          task: taskSchema,
          maxPriceRaw: rawAmountSchema,
          confirmSpend: z.literal(true),
        },
        outputSchema: {
          status: z.enum(["complete", "result_pending", "settlement_pending"]),
          quoteId: z.string(),
          capability: z.string(),
          payee: z.string(),
          amountRaw: z.string(),
          chainId: z.number(),
          txHash: z.string().optional(),
          explorerUrl: z.string().optional(),
          result: z.string().optional(),
          model: z.string().optional(),
          note: z.string().optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      ({ tab, task, maxPriceRaw }) =>
        run(async () => {
          const outcome = await client.spend.research({ tab, signer, maxPriceRaw, task });
          const base = {
            quoteId: outcome.quoteId,
            capability: outcome.tab,
            payee: outcome.payee,
            amountRaw: outcome.amountRaw,
            chainId: ARC_CHAIN_ID,
          };
          if (outcome.status === "complete") {
            return ok({ ...base, status: "complete", txHash: outcome.txHash, explorerUrl: txUrl(outcome.txHash), result: outcome.result, model: outcome.model });
          }
          if (outcome.status === "result_pending") {
            return ok({ ...base, status: "result_pending", txHash: outcome.txHash, explorerUrl: txUrl(outcome.txHash), note: outcome.note });
          }
          return ok({
            ...base,
            status: "settlement_pending",
            ...(outcome.txHash ? { txHash: outcome.txHash, explorerUrl: txUrl(outcome.txHash) } : {}),
            note: outcome.note,
          });
        }),
    );
  }

  return server;
}
