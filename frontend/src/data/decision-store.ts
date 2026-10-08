import { decisionsForRegistrar, type DecisionRecord } from "./decision-record";

const DB_NAME = "pqtabs-decisions";
const STORE = "records";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "at" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The decision note could not be opened."));
  });
}

export async function saveDecision(record: DecisionRecord): Promise<void> {
  if (typeof indexedDB === "undefined") throw new Error("This browser cannot store a decision note.");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The decision note was not saved."));
  });
  db.close();
}

export async function loadDecisions(registrar: string): Promise<DecisionRecord[]> {
  if (!registrar || typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const rows = await new Promise<DecisionRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as DecisionRecord[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error("The decision notes could not be read."));
  });
  db.close();
  return decisionsForRegistrar(rows, registrar);
}
