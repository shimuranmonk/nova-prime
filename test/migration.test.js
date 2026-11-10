import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NovaPlusCsvMigrationService } from "../src/application/migration/nova-plus-csv-migration.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

const HEADER = "Set;Ball;Name;Speed;Spin;Type;Height;Drop;BPM;Reps";
const VALID_CSV = [
  HEADER,
  "Basic;1;Push BH;4;2;back;40;0;45;1",
  "A;1;Serve receive;4;2;back;40;-1;45;2",
  "A;1;Serve receive;5;3;top;45;1;50;1",
  "A;2;Serve receive;6;4;top;50;2;55;1",
  "B;1;Footwork;7;5;top;55;3;60;3",
].join("\n");
const FIXTURE_URL = new URL("./fixtures/nova-plus-custom-drills.csv", import.meta.url);

function service(store = new MemoryStore()) {
  return new NovaPlusCsvMigrationService(store, {
    cryptoObject: webcrypto,
    now: () => "2026-11-10T01:02:03.000Z",
  });
}

test("Nova Plus CSV preview is read-only, excludes built-ins, and preserves variants across all levels", async () => {
  const store = new MemoryStore();
  const preview = await service(store).preview(await readFile(FIXTURE_URL, "utf8"));

  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows, 5);
  assert.equal(preview.excludedRows, 1);
  assert.deepEqual(preview.groups, { A: 1, B: 1, C: 0 });
  assert.match(preview.warnings[0], /built-in row/);
  assert.equal(preview.candidates[0].programs[1].steps[0].variants.length, 2);
  assert.deepEqual(preview.candidates[0].programs[2], preview.candidates[0].programs[1]);
  assert.deepEqual(preview.candidates[0].programs[3], preview.candidates[0].programs[1]);
  assert.deepEqual(await store.getAll("drills"), []);
  assert.deepEqual(await store.getAll("migrationReceipts"), []);
});

test("invalid Nova Plus rows block commit without changing local data", async () => {
  const store = new MemoryStore({ drills: [{ id: "existing", name: "Keep me" }] });
  const preview = await service(store).preview(`${HEADER}\nA;1;Unsafe;99;2;top;40;0;45;1`);

  assert.equal(preview.canCommit, false);
  assert.match(preview.errors[0].message, /Speed/);
  await assert.rejects(() => service(store).commit(preview), /not ready/);
  assert.deepEqual((await store.getAll("drills")).map((item) => item.id), ["existing"]);
  assert.deepEqual(await store.getAll("migrationReceipts"), []);
});

test("unknown Nova Plus sets are reported instead of silently treated as built-ins", async () => {
  const preview = await service().preview(`${HEADER}\nFavorites;1;Unknown;4;2;top;40;0;45;1`);
  assert.equal(preview.canCommit, false);
  assert.equal(preview.excludedRows, 0);
  assert.match(preview.errors[0].message, /Set must be/);
});

test("Nova Plus commit writes drills and receipt atomically and prevents duplicate migration", async () => {
  const store = new MemoryStore();
  const migration = service(store);
  const preview = await migration.preview(VALID_CSV);
  const result = await migration.commit(preview);

  assert.equal(result.imported, 2);
  assert.equal((await store.getAll("drills")).length, 2);
  assert.equal((await store.getAll("migrationReceipts"))[0].status, "completed");

  const repeated = await migration.preview(VALID_CSV);
  assert.equal(repeated.alreadyMigrated, true);
  assert.equal(repeated.canCommit, false);
  await assert.rejects(() => migration.commit(repeated), /not ready/);
});

test("name conflicts are resolved and group capacity failures preserve every collection", async () => {
  const existing = Array.from({ length: 100 }, (_, index) => ({
    id: `existing-${index}`,
    name: index === 0 ? "Serve receive" : `Existing ${index}`,
    group: "A",
    source: "custom",
  }));
  const store = new MemoryStore({ drills: existing });
  const migration = service(store);
  const preview = await migration.preview(`${HEADER}\nA;1;Serve receive;4;2;back;40;0;45;1`);

  await assert.rejects(() => migration.commit(preview), /100-drill limit/);
  assert.equal((await store.getAll("drills")).length, 100);
  assert.deepEqual(await store.getAll("migrationReceipts"), []);

  const roomStore = new MemoryStore({ drills: [existing[0]] });
  const roomMigration = service(roomStore);
  const roomPreview = await roomMigration.preview(`${HEADER}\nA;1;Serve receive;4;2;back;40;0;45;1`);
  const result = await roomMigration.commit(roomPreview);
  assert.equal(result.drills[0].name, "Serve receive 2");
});

test("storage failure cannot leave drills without a migration receipt", async () => {
  class FailingAtomicStore extends MemoryStore {
    async replaceAll() {
      throw new Error("simulated transaction failure");
    }
  }
  const store = new FailingAtomicStore();
  const migration = service(store);
  const preview = await migration.preview(VALID_CSV);

  await assert.rejects(() => migration.commit(preview), /simulated transaction failure/);
  assert.deepEqual(await store.getAll("drills"), []);
  assert.deepEqual(await store.getAll("migrationReceipts"), []);
});
