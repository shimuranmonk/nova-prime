import assert from "node:assert/strict";
import test from "node:test";
import { CalibrationService } from "../src/application/calibration/calibration-service.js";
import { calculateCalibration, calibrationPlan, summarizeQuickCheck } from "../src/domain/calibration/calculation.js";
import { validateCalibrationProfile } from "../src/domain/calibration/schema.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

function observations(count = 5) {
  return calibrationPlan(count === 10 ? "complete" : "standard").slice(0, count).map((testItem, index) => ({
    id: `observation_${index}`,
    testId: testItem.id,
    label: testItem.name,
    kind: testItem.kind,
    ball: structuredClone(testItem.ball),
    predicted: { xCm: testItem.target.xCm, yCm: testItem.target.yCm },
    actual: { xCm: testItem.target.xCm + 4 + (index % 2), yCm: testItem.target.yCm - 6 + (index % 3) },
    outcome: "landed",
    recordedAt: "2026-11-10T00:00:00.000Z",
  }));
}

test("Standard and Complete plans cover the required observation counts", () => {
  assert.equal(calibrationPlan("standard").length, 5);
  assert.equal(calibrationPlan("complete").length, 10);
  assert.deepEqual(new Set(calibrationPlan("standard").map((entry) => entry.kind)), new Set(["top", "none", "back", "serve"]));
});

test("calibration derives bounded offsets and accuracy from landed observations", () => {
  const result = calculateCalibration(observations());
  assert.ok(result.modelParameters.xOffsetCm >= 4 && result.modelParameters.xOffsetCm <= 5);
  assert.ok(result.modelParameters.yOffsetCm >= -6 && result.modelParameters.yOffsetCm <= -4);
  assert.ok(result.accuracy >= 6);
  assert.equal(result.landedCount, 5);
});

test("calibration requires at least three landed observations", () => {
  assert.throws(() => calculateCalibration(observations(2)), /at least three landed balls/);
});

test("service saves, validates, exports, imports, and Quick Checks profiles", async () => {
  const store = new MemoryStore();
  const service = new CalibrationService(store, { idFactory: () => "calibration_test", now: () => "2026-11-10T00:00:00.000Z" });
  const saved = await service.save({ name: "Club table", mode: "standard", tableSetup: { robotPosition: "middle", ballNotes: "40+ balls" }, observations: observations() });
  assert.equal(validateCalibrationProfile(saved).valid, true);
  assert.equal((await service.active()).id, saved.id);

  const quickObservations = observations(3);
  const checked = await service.saveQuickCheck(saved.id, quickObservations);
  assert.ok(checked.quickCheck.meanErrorCm > 0);
  assert.equal(checked.quickCheck.landedCount, 3);

  const payload = await service.export();
  const target = new CalibrationService(new MemoryStore());
  assert.equal((await target.import(payload)).imported, 1);
  assert.equal((await target.active()).name, "Club table");
});

test("Quick Check suggests corrective action for misses", () => {
  const summary = summarizeQuickCheck([{ outcome: "net" }, { outcome: "long" }, { outcome: "wide" }]);
  assert.equal(summary.suggestions.length, 3);
});
