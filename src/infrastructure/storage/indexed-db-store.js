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

export class StorageError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.name = "StorageError";
    this.code = code;
  }
}

export function normalizeStorageError(error, fallbackCode = "STORAGE_OPERATION_FAILED") {
  if (error instanceof StorageError) return error;
  const name = error?.name ?? "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return new StorageError("STORAGE_QUOTA_EXCEEDED", "Device storage is full. Export a backup or remove large local audio before retrying.", { cause: error });
  }
  if (name === "InvalidStateError" || name === "TransactionInactiveError") {
    return new StorageError("STORAGE_TRANSACTION_INACTIVE", "Persistent storage became unavailable before the operation completed. No partial changes were kept.", { cause: error });
  }
  return new StorageError(fallbackCode, error?.message || "Persistent storage operation failed.", { cause: error });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(normalizeStorageError(request.error, "STORAGE_READ_FAILED")), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(normalizeStorageError(transaction.error, "STORAGE_TRANSACTION_ABORTED")), { once: true });
    transaction.addEventListener("error", () => reject(normalizeStorageError(transaction.error, "STORAGE_TRANSACTION_FAILED")), { once: true });
  });
}

export function openNovaDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb?.open) return Promise.reject(new StorageError("STORAGE_UNAVAILABLE", "Persistent browser storage is unavailable."));

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      for (const name of STORE_NAMES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(normalizeStorageError(request.error, "STORAGE_OPEN_FAILED")), { once: true });
    request.addEventListener("blocked", () => reject(new StorageError("STORAGE_UPGRADE_BLOCKED", "Close other Nova Prime tabs, then reload to finish the storage upgrade.")), { once: true });
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
    if (!STORE_NAMES.includes(name)) throw new StorageError("STORAGE_UNKNOWN_STORE", `Unknown store: ${name}`);
    try {
      return this.database.transaction(name, mode).objectStore(name);
    } catch (error) {
      throw normalizeStorageError(error, "STORAGE_TRANSACTION_OPEN_FAILED");
    }
  }

  async #write(names, operation) {
    const list = Array.isArray(names) ? names : [names];
    if (!list.length || list.some((name) => !STORE_NAMES.includes(name))) throw new StorageError("STORAGE_UNKNOWN_STORE", "Persistent storage request contains an unknown store.");
    let transaction;
    try {
      transaction = this.database.transaction(list, "readwrite");
    } catch (error) {
      throw normalizeStorageError(error, "STORAGE_TRANSACTION_OPEN_FAILED");
    }
    const done = transactionDone(transaction);
    try {
      operation(transaction);
    } catch (error) {
      try { transaction.abort(); } catch {}
      await done.catch(() => {});
      throw normalizeStorageError(error);
    }
    await done;
  }

  async get(name, id) {
    return requestResult(this.#store(name).get(id));
  }

  async getAll(name) {
    return requestResult(this.#store(name).getAll());
  }

  async put(name, value) {
    if (!value?.id) throw new Error("Stored records require an id");
    await this.#write(name, (transaction) => transaction.objectStore(name).put(value));
    return value;
  }

  async delete(name, id) {
    await this.#write(name, (transaction) => transaction.objectStore(name).delete(id));
  }

  async replaceAll(collections) {
    const names = Object.keys(collections);
    if (names.some((name) => !STORE_NAMES.includes(name))) throw new Error("Backup contains an unknown store");
    if (!names.length) throw new StorageError("STORAGE_EMPTY_TRANSACTION", "At least one collection is required.");
    if (names.some((name) => !Array.isArray(collections[name]))) throw new StorageError("STORAGE_COLLECTION_INVALID", "Every replacement collection must be an array.");
    await this.#write(names, (transaction) => {
      for (const name of names) {
        const store = transaction.objectStore(name);
        store.clear();
        for (const value of collections[name]) store.put(value);
      }
    });
  }
}
