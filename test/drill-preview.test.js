import assert from "node:assert/strict";
import test from "node:test";
import { createBall } from "../src/domain/drills/schema.js";
import { applyCalibration, fitBallToTarget, previewBall, previewPosition, tablePointFromPosition } from "../src/domain/drills/preview.js";

test("uncalibrated preview returns deterministic bounded table coordinates", () => {
  const ball = createBall();
  const first = previewBall(ball);
  const second = previewBall(ball);
  assert.deepEqual(first, second);
  assert.ok(["in", "short", "net", "long", "side"].includes(first.outcome));
  const position = previewPosition(first);
  assert.ok(position.x >= 2 && position.x <= 98);
  assert.ok(position.y >= 2 && position.y <= 98);
});

test("robot position changes the lateral estimate", () => {
  const ball = createBall({ speed: 7, height: 55, drop: 2 });
  const left = previewPosition(previewBall(ball, "left"));
  const right = previewPosition(previewBall(ball, "right"));
  assert.notEqual(left.x, right.x);
});

test("negative Trainer height produces a two-sided serve preview", () => {
  const result = previewBall(createBall({ speed: 1.8, spin: 5.5, type: "back", height: -30 }));
  assert.equal(result.ok, true);
  assert.ok(result.serveBounce);
  assert.ok(result.serveBounce.yCm > 137);
  assert.ok(result.yCm < 137);
});

test("out-of-bounds estimates are clamped to the visible table", () => {
  assert.deepEqual(previewPosition({ outcome: "side", xCm: -1000, yCm: 1000 }), { x: 2, y: 2 });
});

test("valid player-side landings render below the net and convert back to centimetres", () => {
  const position = previewPosition({ ok: true, xCm: 0, yCm: 68.5 });
  assert.deepEqual(position, { x: 50, y: 75 });
  assert.deepEqual(tablePointFromPosition(position), { xCm: 0, yCm: 68.5 });
  assert.ok(Math.abs(tablePointFromPosition({ x: 0, y: 0 }).yCm - 131.52) < 1e-9);
});

test("interactive placement fits speed and direction while preserving the other ball controls", () => {
  const source = createBall({ speed: 2, spin: 4, type: "back", height: 57, drop: 0, bpm: 52, repetitions: 3 });
  const fit = fitBallToTarget(source, { xCm: 30, yCm: 65 }, "middle", { scatter: 2 });
  assert.equal(fit.ball.spin, 4);
  assert.equal(fit.ball.type, "back");
  assert.equal(fit.ball.height, 57);
  assert.equal(fit.ball.bpm, 52);
  assert.equal(fit.ball.repetitions, 3);
  assert.ok(fit.ball.drop <= 8 && fit.ball.drop >= -8);
  assert.ok(Number.isFinite(fit.errorCm));
  assert.ok(fit.result.ok);
});

test("interactive placement respects scatter-constrained direction", () => {
  const fit = fitBallToTarget(createBall(), { xCm: 70, yCm: 40 }, "middle", { scatter: 9 });
  assert.ok(Math.abs(fit.ball.drop) <= 1);
});

test("saved calibration offsets adjust successful landing estimates", () => {
  const result = { ok: true, outcome: "in", xCm: 10, yCm: 40 };
  const adjusted = applyCalibration(result, { id: "cal_1", modelParameters: { xOffsetCm: -3, yOffsetCm: 5 } });
  assert.equal(adjusted.xCm, 7);
  assert.equal(adjusted.yCm, 45);
  assert.equal(adjusted.calibrated, true);
});

test("response calibration adjusts placement according to ball controls", () => {
  const result = { ok: true, outcome: "in", xCm: 10, yCm: 40 };
  const profile = { id: "cal_response", modelParameters: { xOffsetCm: 0, yOffsetCm: 0, xModel: { intercept: 1, drop: 10 }, yModel: { intercept: 2, speed: 5, height: 6, spin: 4 } } };
  const adjusted = applyCalibration(result, profile, createBall({ speed: 10, spin: 5, type: "back", height: 100, drop: 5 }));
  assert.equal(adjusted.xCm, 16);
  assert.equal(adjusted.yCm, 51);
});
