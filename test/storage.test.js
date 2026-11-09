import assert from "node:assert/strict";
import test from "node:test";
import { createBackup, restoreBackup, validateBackup } from "../src/application/backup/backup-service.js";
import { createSessionRecord } from "../src/domain/statistics/schema.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

test("memory storage isolates written and returned records", async () => {
  const store = new MemoryStore();
  const source = { id: "record_1", outcome: "completed" };
  await store.put("sessionRecords", source);
  source.outcome = "changed";
  const stored = await store.get("sessionRecords", "record_1");
  assert.equal(stored.outcome, "completed");
  stored.outcome = "changed-again";
  assert.equal((await store.get("sessionRecords", "record_1")).outcome, "completed");
});

test("backup round trip restores all validated collections", async () => {
  const source = new MemoryStore();
  await source.put("sessionRecords", createSessionRecord({ id: "record_1", outcome: "completed", simulation: true }));
  await source.put("settings", { id: "theme", value: "dark" });
  const backup = await createBackup(source, { now: () => "2026-11-09T00:00:00.000Z" });

  const target = new MemoryStore({ sessionRecords: [{ id: "old_record", outcome: "stopped" }] });
  const result = await restoreBackup(target, backup);
  assert.equal(result.counts.sessionRecords, 1);
  assert.equal((await target.getAll("sessionRecords"))[0].id, "record_1");
  assert.equal((await target.get("settings", "theme")).value, "dark");
});

test("invalid backup is rejected before stored data changes", async () => {
  const store = new MemoryStore({ sessionRecords: [{ id: "safe_record" }] });
  const invalid = await createBackup(new MemoryStore());
  invalid.collections.sessionRecords.push({ outcome: "missing-id" });
  assert.throws(() => validateBackup(invalid), /Invalid record/);
  await assert.rejects(() => restoreBackup(store, invalid), /Invalid record/);
  assert.equal((await store.getAll("sessionRecords"))[0].id, "safe_record");
});

test("backup validation rejects missing and unknown collections", async () => {
  const backup = await createBackup(new MemoryStore());
  delete backup.collections.settings;
  assert.throws(() => validateBackup(backup), /settings is missing/);

  const withUnknown = await createBackup(new MemoryStore());
  withUnknown.collections.unexpected = [];
  assert.throws(() => validateBackup(withUnknown), /unknown collection/);
});

