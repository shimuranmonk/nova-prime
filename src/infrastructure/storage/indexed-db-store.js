// Retained across the Nova Prime rename so existing browser data stays available.
export const DATABASE_NAME = "nova_ultimate";
export const DATABASE_VERSION = 1;

export const STORE_NAMES = Object.freeze([
  "metadata",
  "settings",
  "drills",
  "calibrations",
  "tracks",
  "playlists",
  "msyncAttachments",
  "sessionRecords",
  "migrationReceipts",
  "backups",
]);

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

export function openNovaDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb?.open) return Promise.reject(new Error("IndexedDB is unavailable"));

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      for (const name of STORE_NAMES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Unable to open Nova Prime storage")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("Nova Prime storage upgrade is blocked")), { once: true });
  });
}

export class IndexedDbStore {
  constructor(database) {
    this.database = database;
    this.kind = "indexeddb";
  }

  static async open(indexedDb = globalThis.indexedDB) {
    return new IndexedDbStore(await openNovaDatabase(indexedDb));
  }

  #store(name, mode = "readonly") {
    if (!STORE_NAMES.includes(name)) throw new Error(`Unknown store: ${name}`);
    return this.database.transaction(name, mode).objectStore(name);
  }

  async get(name, id) {
    return requestResult(this.#store(name).get(id));
  }

  async getAll(name) {
    return requestResult(this.#store(name).getAll());
  }

  async put(name, value) {
    if (!value?.id) throw new Error("Stored records require an id");
    const transaction = this.database.transaction(name, "readwrite");
    transaction.objectStore(name).put(value);
    await transactionDone(transaction);
    return value;
  }

  async delete(name, id) {
    const transaction = this.database.transaction(name, "readwrite");
    transaction.objectStore(name).delete(id);
    await transactionDone(transaction);
  }

  async replaceAll(collections) {
    const names = Object.keys(collections);
    if (names.some((name) => !STORE_NAMES.includes(name))) throw new Error("Backup contains an unknown store");
    const transaction = this.database.transaction(names, "readwrite");
    for (const name of names) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const value of collections[name]) store.put(value);
    }
    await transactionDone(transaction);
  }
}
