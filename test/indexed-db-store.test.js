import assert from "node:assert/strict";
import test from "node:test";
import { IndexedDbStore, openNovaDatabase, StorageError } from "../src/infrastructure/storage/indexed-db-store.js";

class FakeEvents {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  emit(type) { for (const listener of this.listeners.get(type) ?? []) listener(); }
}

class FakeTransaction extends FakeEvents {
  constructor(store) { super(); this.store = store; this.aborted = false; this.error = null; }
  objectStore() { return this.store; }
  abort() { this.aborted = true; this.emit("abort"); }
}

test("blocked IndexedDB upgrades return a stable recoverable storage error", async () => {
  const request = new FakeEvents();
  request.result = { objectStoreNames: { contains: () => true } };
  const opening = openNovaDatabase({ open: () => { queueMicrotask(() => request.emit("blocked")); return request; } });
  await assert.rejects(opening, (error) => {
    assert.equal(error instanceof StorageError, true);
    assert.equal(error.code, "STORAGE_UPGRADE_BLOCKED");
    assert.match(error.message, /Close other Nova Prime tabs/);
    return true;
  });
});

test("quota failure aborts a multi-store replacement before partial commit", async () => {
  let puts = 0;
  const store = {
    clear() {},
    put() {
      puts += 1;
      if (puts === 2) throw new DOMException("full", "QuotaExceededError");
    },
  };
  const transaction = new FakeTransaction(store);
  const database = { transaction: () => transaction };
  const indexed = new IndexedDbStore(database);
  await assert.rejects(() => indexed.replaceAll({ settings: [{ id: "one" }, { id: "two" }] }), (error) => {
    assert.equal(error.code, "STORAGE_QUOTA_EXCEEDED");
    assert.match(error.message, /storage is full/i);
    return true;
  });
  assert.equal(transaction.aborted, true);
});

test("asynchronous transaction aborts retain their specific error code", async () => {
  let transaction;
  const store = {
    put() {
      queueMicrotask(() => {
        transaction.error = new DOMException("full", "QuotaExceededError");
        transaction.emit("abort");
      });
    },
  };
  transaction = new FakeTransaction(store);
  const indexed = new IndexedDbStore({ transaction: () => transaction });
  await assert.rejects(() => indexed.put("settings", { id: "theme", value: "court" }), (error) => error.code === "STORAGE_QUOTA_EXCEEDED");
});

test("successful writes wait for transaction completion", async () => {
  let transaction;
  let completed = false;
  const store = {
    put() {
      queueMicrotask(() => {
        completed = true;
        transaction.emit("complete");
      });
    },
  };
  transaction = new FakeTransaction(store);
  const indexed = new IndexedDbStore({ transaction: () => transaction });
  const value = { id: "theme", value: "dark" };
  assert.equal(await indexed.put("settings", value), value);
  assert.equal(completed, true);
  assert.equal(transaction.aborted, false);
});

test("inactive read transactions return a stable recovery error", async () => {
  const indexed = new IndexedDbStore({
    transaction() { throw new DOMException("closed", "InvalidStateError"); },
  });
  await assert.rejects(() => indexed.get("settings", "theme"), (error) => {
    assert.equal(error.code, "STORAGE_TRANSACTION_INACTIVE");
    assert.match(error.message, /No partial changes were kept/);
    return true;
  });
});
