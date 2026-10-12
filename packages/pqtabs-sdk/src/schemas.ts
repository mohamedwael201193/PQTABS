import { z } from "zod";

/**
 * Response schemas. Each shape is taken from the backend route in backend/src/server.ts.
 * Schemas use looseObject so a new optional backend field does not break a client.
 * Required fields are the ones the SDK relies on for money, policy, or identity.
 */

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected an EVM address");
export const hash32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hash");
export const uintSchema = z.string().regex(/^[0-9]+$/, "expected an unsigned integer string");
export const uuidSchema = z.string().regex(/^[0-9a-f-]{36}$/, "expected a quote id");

export const healthSchema = z.looseObject({ ok: z.literal(true) });

export const readySchema = z.looseObject({
  ok: z.boolean(),
  chainId: z.number(),
  factory: addressSchema,
  relayer: z.boolean(),
});

export const configSchema = z.looseObject({
  // A number, not a literal: a wrong chain must reach the explicit chain_mismatch check, not a schema error.
  chainId: z.number(),
  rpc: z.string(),
  factory: addressSchema,
  usdc: addressSchema,
  barkeep: addressSchema,
  explorer: z.string(),
});

export const timeSchema = z.looseObject({ asOf: uintSchema });

export const tabSchema = z.looseObject({
  tab: addressSchema,
  agent: addressSchema,
  cap: uintSchema,
  expiry: uintSchema,
  open: z.boolean(),
  needsSweep: z.boolean().optional(),
  owner: addressSchema,
  maxPerCall: uintSchema,
  usdc: uintSchema,
  payees: z.array(addressSchema),
  balanceKnown: z.boolean().optional(),
  limitKnown: z.boolean().optional(),
  spentRaw: uintSchema.optional(),
  spentKnown: z.boolean().optional(),
  openedTx: z.string().optional(),
  openedBlock: z.string().optional(),
  openedAt: z.string().optional(),
});

export const portfolioSchema = z.looseObject({
  root: addressSchema,
  tabs: z.array(tabSchema),
});

export const capabilitySchema = z.looseObject({
  root: addressSchema,
  tab: addressSchema,
  cap: uintSchema,
  expiry: uintSchema,
  open: z.boolean(),
  needsSweep: z.boolean(),
  owner: addressSchema,
  agent: addressSchema,
  maxPerCall: uintSchema,
  tabExpiry: uintSchema,
  usdc: uintSchema,
});

/** One Barkeep row. `maxTimeoutSeconds` is the quote lifetime; the SDK rejects anything shorter than 7 seconds. */
export const barkeepAcceptSchema = z.looseObject({
  scheme: z.literal("pqtabs-barkeep"),
  network: z.literal("eip155:5042"),
  asset: addressSchema,
  amount: uintSchema,
  payTo: addressSchema,
  maxTimeoutSeconds: z.number().int().min(7).max(3600),
  extra: z.looseObject({
    quoteId: uuidSchema,
    bodyHash: hash32Schema,
    service: z.literal("Arc Research"),
    provider: z.string(),
    model: z.string(),
    maxTokens: z.number().int().positive(),
    tariff: z.literal(true),
    name: z.string(),
    version: z.string(),
  }),
});

export const paymentRequiredSchema = z.looseObject({
  x402Version: z.literal(2),
  scheme: z.literal("pqtabs-barkeep"),
  standardExact: z.literal(false),
  resource: z.looseObject({ url: z.string(), description: z.string().optional() }),
  accepts: z.array(barkeepAcceptSchema).min(1),
});

export const quoteResponseSchema = z.looseObject({
  paymentRequired: paymentRequiredSchema,
  quoteId: uuidSchema,
  scheme: z.literal("pqtabs-barkeep"),
  standardExact: z.literal(false),
  replayed: z.boolean(),
});

/**
 * The decision from /v1/x402/decide. For a refusal the price, payee, and agent may be empty strings
 * because the backend fills them from the quote, so those three are plain strings here.
 */
export const decideResponseSchema = z.looseObject({
  decision: z.enum(["ALLOW", "REFUSE", "NO_PAYMENT"]),
  reason: z.array(z.string()),
  resource: z.string(),
  price: z.string(),
  asset: z.string(),
  network: z.string(),
  payee: z.string(),
  agent: z.string(),
  remaining_capability_balance: uintSchema,
  maxPerCall: uintSchema,
  root_exposure: uintSchema,
  maxOpenExposure: uintSchema,
  expiry: uintSchema,
  capability: addressSchema,
  cap: uintSchema,
});

export const spendResponseSchema = z.looseObject({
  hash: hash32Schema,
  scheme: z.literal("pqtabs-barkeep"),
  standardExact: z.literal(false),
  replayed: z.boolean(),
});

export const researchResultSchema = z.looseObject({
  status: z.enum(["complete", "result_pending"]),
  result: z.string().optional(),
  model: z.string().optional(),
  txHash: hash32Schema,
  scheme: z.literal("pqtabs-barkeep"),
  standardExact: z.literal(false),
});

export const errorBodySchema = z.looseObject({
  error: z.string().optional(),
  detail: z.string().optional(),
  requestId: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
export type Tab = z.infer<typeof tabSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type PaymentRequired = z.infer<typeof paymentRequiredSchema>;
export type BarkeepAccept = z.infer<typeof barkeepAcceptSchema>;
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
export type DecideResponse = z.infer<typeof decideResponseSchema>;
export type SpendResponse = z.infer<typeof spendResponseSchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
