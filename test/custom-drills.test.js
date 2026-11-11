import assert from "node:assert/strict";
import test from "node:test";
import { CustomDrillService, MAX_CUSTOM_DRILLS_PER_GROUP } from "../src/application/drills/custom-drill-service.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

function makeService(store = new MemoryStore()) {
  let sequence = 0;
  return new CustomDrillService(store, {
    idFactory: (prefix) => `${prefix}_test_${++sequence}`,
    now: () => "2026-11-10T00:00:00.000Z",
  });
}

test("custom drills use immutable IDs, sanitized unique names, and persistent groups", async () => {
  const service = makeService();
  const first = await service.create({ name: "  My;\nDrill  ", group: "A" });
  const second = await service.create({ name: "My Drill", group: "A" });
  assert.equal(first.name, "My Drill");
  assert.equal(second.name, "My Drill 2");

  const moved = await service.update(first.id, { name: "Backhand plan", group: "B", robotPosition: "left" });
  assert.equal(moved.id, first.id);
  assert.equal(moved.group, "B");
  assert.equal(moved.robotPosition, "left");
  assert.equal((await service.list("A")).length, 1);
  assert.equal((await service.list("B"))[0].id, first.id);
});

test("duplicate creates new drill and step identities", async () => {
  const service = makeService();
  const source = await service.create({ name: "Pattern", group: "A" });
  const copy = await service.duplicate(source.id);
  assert.notEqual(copy.id, source.id);
  assert.notEqual(copy.programs[1].steps[0].id, source.programs[1].steps[0].id);
  assert.equal(copy.name, "Pattern copy");
});

test("custom drill ordering moves and compacts after deletion", async () => {
  const service = makeService();
  const first = await service.create({ name: "First" });
  const second = await service.create({ name: "Second" });
  const third = await service.create({ name: "Third" });
  assert.equal(await service.move(third.id, -1), true);
  assert.deepEqual((await service.list("A")).map((drill) => drill.name), ["First", "Third", "Second"]);
  assert.equal(await service.delete(first.id), true);
  assert.deepEqual((await service.list("A")).map((drill) => [drill.name, drill.sortOrder]), [["Third", 0], ["Second", 1]]);
  assert.equal(await service.delete(first.id), false);
});

test("custom drill export and atomic import preserve valid programs", async () => {
  const source = makeService();
  const created = await source.create({ name: "Exported", group: "C" });
  const payload = await source.export([created.id]);
  assert.equal(payload.format, "nova-prime-drills");

  const targetStore = new MemoryStore();
  const target = makeService(targetStore);
  const result = await target.import(payload);
  assert.equal(result.added, 1);
  assert.equal((await target.list("C"))[0].name, "Exported");

  const invalid = structuredClone(payload);
  invalid.drills[0].id = "new-invalid-id";
  invalid.drills[0].programs[1].steps[0].variants[0].speed = 99;
  await assert.rejects(() => target.import(invalid), /Invalid imported drill/);
  assert.equal((await target.list()).length, 1);

  const legacyTarget = makeService();
  const legacyPayload = { ...payload, format: "nova-ultimate-drills" };
  assert.equal((await legacyTarget.import(legacyPayload)).added, 1);
});

test("visual editor saves all levels atomically and preserves drill identity", async () => {
  const service = makeService();
  const source = await service.create({ name: "Editor pattern" });
  const programs = structuredClone(source.programs);
  programs[1].steps.push({
    id: "step_editor_two",
    enabled: true,
    scatter: 1,
    variants: [{ speed: 6, spin: 4, type: "back", height: 45, drop: -2, bpm: 55, repetitions: 2 }],
  });
  programs[2] = structuredClone(programs[1]);
  programs[2].steps = programs[2].steps.map((step, index) => ({ ...step, id: `step_level_two_${index}` }));

  const saved = await service.saveEditor(source.id, { programs, random: true, robotPosition: "right" });
  assert.equal(saved.id, source.id);
  assert.equal(saved.random, true);
  assert.equal(saved.robotPosition, "right");
  assert.equal(saved.programs[1].steps.length, 2);
  assert.equal(saved.programs[2].steps[1].variants[0].type, "back");
});

test("invalid editor saves do not mutate the stored drill", async () => {
  const service = makeService();
  const source = await service.create({ name: "Atomic editor" });
  const programs = structuredClone(source.programs);
  programs[1].steps[0].variants[0].speed = 99;
  await assert.rejects(() => service.saveEditor(source.id, { programs, random: true }), /speed is outside/);
  const unchanged = await service.get(source.id);
  assert.equal(unchanged.random, false);
  assert.equal(unchanged.programs[1].steps[0].variants[0].speed, 5);
});

test("custom groups enforce the Trainer 100-drill capacity", async () => {
  const service = makeService();
  for (let index = 0; index < MAX_CUSTOM_DRILLS_PER_GROUP; index += 1) {
    await service.create({ name: `Drill ${index + 1}`, group: "A" });
  }
  await assert.rejects(() => service.create({ name: "Overflow", group: "A" }), /already contains 100 drills/);
});
