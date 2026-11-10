import assert from "node:assert/strict";
import test from "node:test";
import { buildStatistics } from "../src/domain/statistics/analytics.js";

function record(overrides = {}) {
  return {
    mode: "reps",
    outcome: "completed",
    startedAt: "2026-11-09T10:00:00.000Z",
    durationSeconds: 60,
    completedCycles: 10,
    drillId: "push-bh",
    ...overrides,
  };
}

test("statistics filter the selected period and aggregate local activity", () => {
  const result = buildStatistics([
    record(),
    record({ startedAt: "2026-11-08T10:00:00.000Z", mode: "time", outcome: "stopped", durationSeconds: 30, completedCycles: 2 }),
    record({ startedAt: "2026-10-01T10:00:00.000Z" }),
  ], { now: "2026-11-10T10:00:00.000Z", days: 7 });

  assert.deepEqual(result.summary, {
    sessions: 2,
    durationSeconds: 90,
    completedCycles: 12,
    completionRate: 50,
    activeDays: 2,
    currentStreak: 2,
  });
  assert.equal(result.daily.length, 2);
  assert.equal(result.modes.find((mode) => mode.id === "reps").share, 50);
});

test("statistics rank drills without mutating source records", () => {
  const records = [
    record({ drillId: "drive-fh" }),
    record({ startedAt: "2026-11-09T11:00:00.000Z", drillId: "drive-fh" }),
    record({ startedAt: "2026-11-09T12:00:00.000Z", drillId: "push-bh" }),
  ];
  const snapshot = structuredClone(records);
  const result = buildStatistics(records, { now: "2026-11-10T10:00:00.000Z", days: "all" });

  assert.equal(result.drills[0].drillId, "drive-fh");
  assert.equal(result.drills[0].sessions, 2);
  assert.deepEqual(records, snapshot);
});

test("adaptive guidance is deterministic and explains its rule", () => {
  const lowCompletion = Array.from({ length: 5 }, (_, index) => record({
    startedAt: `2026-11-0${index + 4}T10:00:00.000Z`,
    outcome: index < 2 ? "completed" : "stopped",
  }));
  const result = buildStatistics(lowCompletion, {
    now: "2026-11-10T10:00:00.000Z",
    days: 30,
    calibrationProfile: { status: "complete", quickCheck: { meanErrorCm: 3 } },
  });

  assert.ok(result.guidance.some((item) => item.id === "reduce" && item.reason.includes("40%")));
  assert.ok(result.guidance.some((item) => item.id === "diversify"));
  assert.ok(!result.guidance.some((item) => item.id === "calibrate"));
});

test("an empty period recommends a baseline and calibration", () => {
  const result = buildStatistics([], { now: "2026-11-10T10:00:00.000Z", days: 30 });
  assert.equal(result.summary.sessions, 0);
  assert.deepEqual(result.guidance.map((item) => item.id), ["baseline", "calibrate"]);
});

test("invalid or future timestamps are ignored safely", () => {
  const result = buildStatistics([
    record({ startedAt: "not-a-date" }),
    record({ startedAt: "2026-12-01T00:00:00.000Z" }),
  ], { now: "2026-11-10T10:00:00.000Z", days: "all" });
  assert.equal(result.summary.sessions, 0);
});

test("healthy balanced activity still receives a steady-plan explanation", () => {
  const records = [
    record({ mode: "reps" }),
    record({ mode: "time", startedAt: "2026-11-08T10:00:00.000Z" }),
    record({ mode: "music", startedAt: "2026-11-07T10:00:00.000Z" }),
    record({ mode: "msync", startedAt: "2026-11-06T10:00:00.000Z" }),
  ];
  const result = buildStatistics(records, {
    now: "2026-11-10T10:00:00.000Z",
    days: 30,
    calibrationProfile: { status: "complete", quickCheck: { meanErrorCm: 2 } },
  });
  assert.deepEqual(result.guidance.map((item) => item.id), ["steady"]);
});
