import assert from "node:assert/strict";
import test from "node:test";
import { inheritedStep } from "../src/app/drill-editor.js";

test("Add Step inherits the preceding single ball and scatter", () => {
  const step = inheritedStep({
    enabled: false,
    scatter: 2.5,
    variants: [{ speed: 7, spin: 2, type: "back", height: 65, drop: -4, bpm: 72, repetitions: 3 }],
  });
  assert.equal(step.enabled, true);
  assert.equal(step.scatter, 2.5);
  assert.deepEqual(step.variants[0], { speed: 7, spin: 2, type: "back", height: 65, drop: -4, bpm: 72, repetitions: 3 });
});

test("Add Step converts an inherited Serve to a normal ball and avoids ambiguous scatter", () => {
  const serve = { speed: 2, spin: 5, type: "back", height: -30, drop: 3, bpm: 45, repetitions: 1 };
  const step = inheritedStep({ scatter: 4, variants: [serve, { ...serve, drop: -3 }] });
  assert.equal(step.variants[0].height, 40);
  assert.equal(step.variants[0].drop, 3);
  assert.equal(step.scatter, 0);
});
