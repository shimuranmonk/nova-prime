import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveCalibrationPlan } from "../src/domain/calibration/adaptive-plan.js";
import { CENTERED_SETUP, PRIOR, objective, simulate } from "../src/domain/calibration/trainer-physics.js";
import { fitBallToTarget, previewBall, previewCalibratedBall } from "../src/domain/drills/preview.js";
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
  assert.ok(Number.isFinite(result.modelParameters.xModel.drop));
  assert.ok(Number.isFinite(result.modelParameters.yModel.height));
  assert.equal(result.landedCount, 5);
});

test("calibration learns parameter response instead of only a global offset", () => {
  const samples = observations(10).map((entry) => {
    const dropEffect = (entry.ball.drop / 10) * 12;
    const speedEffect = ((entry.ball.speed - 5) / 5) * 15;
    return { ...entry, actual: { xCm: entry.predicted.xCm + 3 + dropEffect, yCm: entry.predicted.yCm - 2 + speedEffect } };
  });
  const result = calculateCalibration(samples);
  assert.ok(result.modelParameters.xModel.drop > 5);
  assert.ok(result.modelParameters.yModel.speed > 5);
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

test("adaptive calibration learns from long shots and improves an independent landing", () => {
  const truth = { ...PRIOR, a: PRIOR.a + 0.4 };
  const planner = new AdaptiveCalibrationPlan({ setup: CENTERED_SETUP, cover: 15 });
  for (let attempt = 0; attempt < 120; attempt++) {
    const pending = planner.next();
    if (!pending) break;
    const actual = simulate(pending.ball, truth, CENTERED_SETUP);
    planner.record({
      result: actual.ok ? "ok" : actual.net ? "net" : actual.out === "long" ? "long" : "side",
      x: actual.x,
      y: actual.y,
    });
  }
  assert.equal(planner.next(), null);
  assert.ok(planner.shots.some(shot => shot.result === "long"));
  const physics = planner.finish();
  assert.ok(objective(physics, planner.shots, CENTERED_SETUP) < objective(PRIOR, planner.shots, CENTERED_SETUP));
  const ball = { speed: 3.1, spin: 3.2, type: "top", height: 35, drop: 2 };
  const actual = simulate(ball, truth, CENTERED_SETUP);
  const fitted = simulate(ball, physics, CENTERED_SETUP);
  const baseline = simulate(ball, PRIOR, CENTERED_SETUP);
  assert.ok(actual.ok && fitted.ok && baseline.ok);
  assert.ok(Math.hypot(actual.x - fitted.x, actual.y - fitted.y) <
    Math.hypot(actual.x - baseline.x, actual.y - baseline.y));
});

test("physics profiles round-trip and drive centered editor aiming without legacy offsets", async () => {
  const service = new CalibrationService(new MemoryStore());
  const profile = await service.save({
    name: "Centered",
    mode: "standard",
    tableSetup: { robotPosition: "middle", headOffset: 0 },
    observations: observations().map(entry => ({ ...entry, predicted: null })),
    physicsParameters: { ...PRIOR, a: PRIOR.a + 0.4 },
  });
  const imported = new CalibrationService(new MemoryStore());
  await imported.import(await service.export());
  assert.deepEqual(await imported.active(), profile);

  const ball = { speed: 3.1, spin: 3.2, type: "top", height: 35, drop: 2 };
  const point = previewCalibratedBall(ball, "middle", profile);
  const simulation = simulate(ball, profile.physicsModel.parameters, CENTERED_SETUP);
  assert.equal(point.xCm, simulation.x);
  assert.equal(point.yCm, simulation.y);
  assert.deepEqual(previewCalibratedBall(ball, "left", profile), previewBall(ball, "left"));
  const fit = fitBallToTarget(ball, point, "middle", { calibration: profile });
  assert.deepEqual(fit.result, previewCalibratedBall(fit.ball, "middle", profile));
  assert.equal(fit.ball.height, ball.height);
  assert.equal(fit.ball.spin, ball.spin);
});
