/**
 * Display names for agents, scoped to the connected registrar.
 * This stores a name and a purpose. It does not store a signing key.
 */

export interface AgentLabel {
  name: string;
  purpose: string;
  address: string;
}

const STORAGE_KEY = "pqtabs.agent-labels.v1";

type Book = Record<string, Record<string, AgentLabel>>;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readBook(): Book {
  const store = storage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Book;
  } catch {
    return {};
  }
}

export function labelsFor(registrar: string): Record<string, AgentLabel> {
  if (!registrar) return {};
  const bucket = readBook()[registrar.toLowerCase()];
  return bucket && typeof bucket === "object" ? bucket : {};
}

/** The old pay harness is not the product. Show the research agent instead. */
export function presentedAgent(name: string, purpose: string): { name: string; role: string } {
  if (name.trim().toLowerCase() === "arc payer") {
    return {
      name: "Research agent",
      role: "Pays for external inference when the requested service fits its capability.",
    };
  }
  return { name, role: purpose };
}

export function saveAgentLabel(registrar: string, label: AgentLabel): void {
  const store = storage();
  if (!store || !registrar || !label.address) return;
  const book = readBook();
  const reg = registrar.toLowerCase();
  const id = label.address.toLowerCase();
  book[reg] = {
    ...(book[reg] || {}),
    [id]: {
      name: label.name.slice(0, 80),
      purpose: label.purpose.slice(0, 200),
      address: label.address,
    },
  };
  store.setItem(STORAGE_KEY, JSON.stringify(book));
}
