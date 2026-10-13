import { isAddress } from "viem";

/** 64 hex characters, with or without 0x. This is the shape of a private key (and of a transaction hash). */
const KEY_SHAPED = /^(0x)?[0-9a-fA-F]{64}$/;

export type AgentAddressState =
  | { kind: "empty" }
  | { kind: "key" }
  | { kind: "invalid" }
  | { kind: "valid"; address: string };

/**
 * Classifies the agent-address field. The field takes only a public address. Anything shaped like a private key is
 * refused before it is used for anything, and the value is never sent or stored.
 */
export function classifyAgentInput(value: string): AgentAddressState {
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "empty" };
  if (KEY_SHAPED.test(trimmed)) return { kind: "key" };
  if (isAddress(trimmed)) return { kind: "valid", address: trimmed };
  return { kind: "invalid" };
}
