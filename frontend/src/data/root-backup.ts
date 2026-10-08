const DB_NAME = "pqtabs-root-backup";
const STORE = "backups";

export type StoredRootBackup = {
  version: "PQTABS1";
  registrar: string;
  root: string | null;
  blob: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the security-key backup store."));
  });
}

function finish<T>(request: IDBRequest<T>, tx: IDBTransaction): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The security-key backup request failed."));
    tx.onerror = () => reject(tx.error ?? new Error("The security-key backup transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("The security-key backup transaction was aborted."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  if (typeof indexedDB === "undefined") throw new Error("This browser cannot keep a security-key backup.");
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    return await finish(run(tx.objectStore(STORE), tx), tx);
  } finally {
    db.close();
  }
}

function keyFor(registrar: string): string {
  return registrar.toLowerCase();
}

export async function saveRootBackup(registrar: string, bytes: ArrayBuffer, root: string | null = null): Promise<void> {
  if (!registrar) throw new Error("Connect a wallet before saving a security-key backup.");
  const record: StoredRootBackup = {
    version: "PQTABS1",
    registrar: keyFor(registrar),
    root,
    blob: bytes.slice(0),
  };
  await withStore("readwrite", (store) => store.put(record, record.registrar));
}

export async function bindRootBackup(registrar: string, root: string): Promise<void> {
  const existing = await loadRecord(registrar);
  if (!existing) return;
  existing.root = root;
  await withStore("readwrite", (store) => store.put(existing, existing.registrar));
}

export async function hasRootBackup(registrar: string): Promise<boolean> {
  if (!registrar || typeof indexedDB === "undefined") return false;
  const record = await loadRecord(registrar);
  return Boolean(record && record.blob.byteLength > 0);
}

export async function loadRootBackup(registrar: string): Promise<ArrayBuffer | null> {
  const record = await loadRecord(registrar);
  return record ? record.blob.slice(0) : null;
}

async function loadRecord(registrar: string): Promise<StoredRootBackup | null> {
  if (!registrar || typeof indexedDB === "undefined") return null;
  const record = await withStore<StoredRootBackup | undefined>("readonly", (store) => store.get(keyFor(registrar)));
  if (!record || record.version !== "PQTABS1" || !(record.blob instanceof ArrayBuffer)) return null;
  return record;
}
