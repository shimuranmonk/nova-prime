import assert from "node:assert/strict";
import test from "node:test";
import { createBall } from "../src/domain/drills/schema.js";
import { previewBall, previewPosition } from "../src/domain/drills/preview.js";

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

test("out-of-bounds estimates are clamped to the visible table", () => {
  assert.deepEqual(previewPosition({ outcome: "side", xCm: -1000, yCm: 1000 }), { x: 2, y: 98 });
});
