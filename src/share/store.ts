/**
 * The agent tab's own storage (SPEC-ACCOUNTS.md §12 O, §13): the machine
 * keypair, the trust root, and the directory handles — everything the server
 * deliberately never holds. IndexedDB because `CryptoKey` and
 * `FileSystemDirectoryHandle` are structured-cloneable and localStorage cannot
 * carry either.
 *
 * All of it is treated as evictable. The server rows are the durable record,
 * and losing this database costs a re-key ceremony and a folder re-pick, both
 * designed as routine (§12 O). The `vessel-` prefix is deliberate — storage
 * names keep the internal name (CLAUDE.md deviation 10).
 */

const DB_NAME = "vessel-share";
const STORE = "kv";

export interface StoredMachine {
  machineId: string;
  name: string;
  keyPair: CryptoKeyPair;
  /** The owner's grant public key, written at pair time, never re-fetched (§13). */
  trustRoot: Uint8Array;
  /** Our own public key bytes, for telling a re-key elsewhere from our own row. */
  publicKeyBytes: Uint8Array;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function get<T>(key: string): Promise<T | null> {
  const db = await open();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function del(key: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const shareStore = {
  machine: () => get<StoredMachine>("machine"),
  saveMachine: (machine: StoredMachine) => put("machine", machine),
  clearMachine: () => del("machine"),

  handle: (driveId: string) => get<FileSystemDirectoryHandle>(`handle:${driveId}`),
  saveHandle: (driveId: string, handle: FileSystemDirectoryHandle) =>
    put(`handle:${driveId}`, handle),
  deleteHandle: (driveId: string) => del(`handle:${driveId}`),
};
