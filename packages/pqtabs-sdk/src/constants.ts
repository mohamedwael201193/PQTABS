/** Protocol constants. Mirrors backend/src/constants.ts and backend/src/index/research.ts. */

export const ARC_CHAIN_ID = 5042;
export const ARC_NETWORK = "eip155:5042";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const SCHEME = "pqtabs-barkeep";
export const RESEARCH_MAX_TOKENS = 400;
export const RESEARCH_TTL_SECONDS = 600;
/** Keccak of "Transfer(address,address,uint256)". */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** The authorization blob is 65 signature bytes, 20 payee, 32 value, 32 validAfter, 32 validBefore, 32 nonce. */
export const SPEND_BLOB_BYTES = 213;

export const DEFAULT_BACKEND_URL = "https://pqtabs.onrender.com";
export const DEFAULT_RPC_URL = "https://rpc.mainnet.arc.io";
export const DEFAULT_EXPLORER_URL = "https://explorer.arc.io";

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_RECEIPT_TIMEOUT_MS = 90_000;
export const DEFAULT_RECEIPT_POLL_MS = 2_000;
/** Backend clock margin: an authorization must still be valid for this many seconds when it is signed. */
export const MIN_VALIDITY_SECONDS = 6;
