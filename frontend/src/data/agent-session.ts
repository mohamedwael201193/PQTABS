import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const agentKeys = new Map<string, Hex>();
let vaultGeneration = 0;

export function rememberAgentKey(address: string, privateKey: Hex): void {
  agentKeys.set(getAddress(address).toLowerCase(), privateKey);
}

export function recallAgentKey(address: string): Hex | null {
  return agentKeys.get(address.toLowerCase()) ?? null;
}

export function browserHoldsAgentKey(address: string): boolean {
  return recallAgentKey(address) !== null;
}

export function forgetAgentKeys(): void {
  vaultGeneration += 1;
  agentKeys.clear();
}

export function nextVaultTicket(): number {
  return ++vaultGeneration;
}

export function vaultTicketCurrent(ticket: number): boolean {
  return ticket === vaultGeneration;
}

export function clearRememberedKeys(): void {
  agentKeys.clear();
}

export function rememberFromPrivateKey(privateKey: Hex): void {
  rememberAgentKey(privateKeyToAccount(privateKey).address, privateKey);
}
