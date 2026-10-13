/**
 * pqtabs-sdk: a TypeScript client for PQTABS on Arc mainnet.
 *
 * Read-only methods never move money. `spend.research` moves USDC only inside a capability that the
 * root already authorized, and only after every check passes. The agent key stays in your AgentSigner.
 */

export {
  CIRCLE_ARC_MAINNET,
  type CircleSignerOptions,
  type CircleSignTypedData,
  type CircleSignTypedDataRequest,
  circleDeveloperSigner,
  circleTypedDataDigest,
  fromCircleTypedDataJson,
  normalizeSignature,
  toCircleTypedDataJson,
} from "./circle-signer.js";
export { type CallOptions, type PaidResearchInput, type PolicyResult, PqtabsClient, type PqtabsClientOptions, type QuoteResult, type ReceiptCheck, type ResearchOutcome, type SpendStep } from "./client.js";
export {
  ARC_CHAIN_ID,
  ARC_NETWORK,
  DEFAULT_BACKEND_URL,
  DEFAULT_EXPLORER_URL,
  DEFAULT_RPC_URL,
  RESEARCH_MAX_TOKENS,
  RESEARCH_TTL_SECONDS,
  SCHEME,
  USDC_ADDRESS,
} from "./constants.js";
export { isPqtabsError, PolicyRefusedError, PqtabsError, type PqtabsErrorCode, type PqtabsErrorOptions, RateLimitedError } from "./errors.js";
export { evaluateDecision, type ParsedQuote, parseBarkeepQuote, paymentDeadline } from "./policy.js";
export { checkUsdcSettlement, type SettlementCheck } from "./receipt.js";
export { type ArcReceipt, type ReceiptLog, type ReceiptReader, viemReceiptReader, waitForReceipt } from "./rpc.js";
export type { Capability, Config, DecideResponse, PaymentRequired, Portfolio, QuoteResponse, Tab } from "./schemas.js";
export { type AgentSigner, externalSigner, privateKeySigner, recoverAuthorizationSigner, type TransferAuthorization, transferAuthorizationTypedData } from "./signer.js";
export { decodeSpendBlob, encodeSpendBlob, type SpendBlobFields } from "./spend-blob.js";
export { type AttemptStore, fileAttemptStore, MemoryAttemptStore, type SpendAttempt } from "./store.js";
