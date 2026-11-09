import assert from "node:assert/strict";
import test from "node:test";
import { createBall, createDrill, createStep } from "../src/domain/drills/schema.js";
import { validateBall, validateDrill, validateStep } from "../src/domain/drills/validation.js";

test("new drills satisfy the canonical schema", () => {
  const drill = createDrill();
  const result = validateDrill(drill);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test("invalid ball parameters are reported with stable paths", () => {
  const result = validateBall(createBall({ speed: 11, type: "side" }), "programs.1.steps[0].variants[0]");
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.path.endsWith("speed")));
  assert.ok(result.issues.some((entry) => entry.path.endsWith("type")));
});

test("drop plus scatter cannot exceed the robot envelope", () => {
  const step = createStep({ scatter: 4, variants: [createBall({ drop: 7 })] });
  const result = validateStep(step);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "DRILL_DROP_SCATTER"));
});

test("drills require at least one populated program", () => {
  const drill = createDrill({ programs: { 1: null, 2: null, 3: null } });
  const result = validateDrill(drill);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "DRILL_PROGRAM_REQUIRED"));
});
