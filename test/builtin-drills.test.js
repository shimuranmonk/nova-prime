import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_DRILLS, BUILTIN_GROUPS, getBuiltinDrill, getBuiltinDrills } from "../src/domain/drills/builtin-catalog.js";
import { validateDrill } from "../src/domain/drills/validation.js";

test("verified Nova Trainer catalogue contains 34 unique canonical drills", () => {
  assert.equal(BUILTIN_DRILLS.length, 34);
  assert.equal(new Set(BUILTIN_DRILLS.map((drill) => drill.id)).size, 34);
  assert.deepEqual(BUILTIN_GROUPS.map(({ id, count }) => [id, count]), [["basic", 6], ["combined", 12], ["complex", 16]]);
  assert.equal(getBuiltinDrills("basic").length, 6);
  assert.equal(getBuiltinDrills("combined").length, 12);
  assert.equal(getBuiltinDrills("complex").length, 16);
});

test("every built-in drill satisfies the canonical schema at all three levels", () => {
  for (const drill of BUILTIN_DRILLS) {
    const result = validateDrill(drill);
    assert.equal(result.valid, true, `${drill.id}: ${result.issues.map((entry) => entry.message).join(", ")}`);
    assert.deepEqual(Object.keys(drill.programs), ["1", "2", "3"]);
    assert.equal(Object.isFrozen(drill), true);
  }
});

test("basic drill levels preserve the Trainer source parameters", () => {
  const pushBh = getBuiltinDrill("builtin:push-b");
  assert.equal(pushBh.name, "Push BH");
  assert.deepEqual(pushBh.programs[1].steps[0].variants[0], {
    speed: 2, spin: 2, type: "back", height: 50, drop: -5, bpm: 36, repetitions: 1,
  });
  assert.deepEqual(pushBh.programs[3].steps[0].variants[0], {
    speed: 2, spin: 4, type: "back", height: 50, drop: -5, bpm: 48, repetitions: 1,
  });
});

test("sequence and random drills preserve source order and flags", () => {
  const combined = getBuiltinDrill("builtin:loop-b-drive-b");
  assert.equal(combined.programs[1].steps.length, 2);
  assert.deepEqual(combined.programs[1].steps.map((step) => step.variants[0].drop), [-5, -5]);
  assert.deepEqual(combined.programs[1].steps.map((step) => step.variants[0].type), ["back", "top"]);

  const random = getBuiltinDrill("builtin:all-random");
  assert.equal(random.random, true);
  assert.equal(random.group, "complex");
  assert.deepEqual(random.programs[1].steps.map((step) => step.variants[0].drop), [5, -5, 5, -5]);
});

