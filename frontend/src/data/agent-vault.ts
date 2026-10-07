import { getAddress, hexToBytes, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const DB_NAME = "pqtabs-agent-vault";
const FORMAT = "PQTABS-AGENT-1";
const ITERATIONS = 210_000;

type StoredAgent = {
  registrar: string;
  address: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

type BackupFile = {
  format: string;
  address: string;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function base64ToBytes(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("wrap")) db.createObjectStore("wrap");
      if (!db.objectStoreNames.contains("agents")) db.createObjectStore("agents");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the agent vault."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The agent vault request failed."));
  });
}

async function withStore<T>(name: "wrap" | "agents", mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(name, mode);
    const result = await requestToPromise(run(tx.objectStore(name)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("The agent vault transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("The agent vault transaction was aborted."));
    });
    return result;
  } finally {
    db.close();
  }
}

async function deviceKey(): Promise<CryptoKey> {
  const existing = await withStore<CryptoKey | undefined>("wrap", "readonly", (store) => store.get("device"));
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await withStore("wrap", "readwrite", (store) => store.put(created, "device"));
  return created;
}

function owned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(copy);
  view.set(bytes);
  return view;
}

function recordId(registrar: string, address: string): string {
  return `${registrar.toLowerCase()}:${address.toLowerCase()}`;
}

async function encryptPrivateKey(privateKey: Hex): Promise<{ iv: ArrayBuffer; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deviceKey(), owned(hexToBytes(privateKey)));
  return { iv: iv.buffer, ciphertext };
}

async function decryptPrivateKey(iv: ArrayBuffer, ciphertext: ArrayBuffer): Promise<Hex> {
  const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await deviceKey(), ciphertext));
  return toHex(bytes);
}

export async function saveAgentKey(registrar: string, address: string, privateKey: Hex): Promise<void> {
  if (!registrar || typeof indexedDB === "undefined") throw new Error("This browser cannot store an agent key.");
  const sealed = await encryptPrivateKey(privateKey);
  const record: StoredAgent = { registrar: registrar.toLowerCase(), address: getAddress(address), ...sealed };
  await withStore("agents", "readwrite", (store) => store.put(record, recordId(registrar, address)));
}

export async function loadAgentKeys(registrar: string): Promise<Hex[]> {
  if (!registrar || typeof indexedDB === "undefined") return [];
  const db = await openDb();
  try {
    const tx = db.transaction("agents", "readonly");
    const rows = await requestToPromise(tx.objectStore("agents").getAll() as IDBRequest<StoredAgent[]>);
    const keys: Hex[] = [];
    for (const row of rows) {
      if (!row?.address || row.registrar.toLowerCase() !== registrar.toLowerCase()) continue;
      keys.push(await decryptPrivateKey(row.iv, row.ciphertext));
    }
    return keys;
  } finally {
    db.close();
  }
}

async function derive(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealAgentBackup(privateKey: Hex, address: string, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error("Use at least 8 characters for the backup passphrase.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapping = await derive(passphrase, salt, ITERATIONS);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapping, owned(hexToBytes(privateKey))));
  const body: BackupFile = {
    format: FORMAT,
    address: getAddress(address),
    kdf: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
  return JSON.stringify(body);
}

export async function openAgentBackup(fileText: string, passphrase: string): Promise<{ address: Hex; privateKey: Hex }> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new Error("This file is not an agent backup.");
  }
  if (parsed.format !== FORMAT || parsed.kdf !== "PBKDF2-SHA-256") throw new Error("This file is not an agent backup.");
  const iterations = Number(parsed.iterations);
  if (!Number.isFinite(iterations) || iterations < 100_000 || iterations > 1_000_000) throw new Error("This backup uses an unsupported passphrase setup.");
  let bytes: ArrayBuffer;
  try {
    const wrapping = await derive(passphrase, base64ToBytes(parsed.salt), iterations);
    bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(parsed.iv) as BufferSource }, wrapping, base64ToBytes(parsed.ciphertext) as BufferSource);
  } catch {
    throw new Error("That passphrase did not open this backup.");
  }
  const privateKey = toHex(new Uint8Array(bytes));
  const address = privateKeyToAccount(privateKey).address;
  if (address.toLowerCase() !== String(parsed.address).toLowerCase()) throw new Error("This backup does not match the agent it names.");
  return { address, privateKey };
}
