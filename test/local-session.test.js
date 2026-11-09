import assert from "node:assert/strict";
import test from "node:test";
import { LocalSessionController } from "../src/application/sessions/session-controller.js";
import { createSessionSpec } from "../src/domain/sessions/schema.js";
import { COMMAND_RESULTS, SESSION_STATES } from "../src/domain/sessions/state-machine.js";

test("reps dry run counts down, completes, and records no physical balls", () => {
  const records = [];
  const controller = new LocalSessionController({ now: () => "2026-11-09T00:00:00.000Z", onRecord: (record) => records.push(record) });
  const result = controller.start(createSessionSpec({ drillId: "dry-run", repetitions: 3, pauseSeconds: 0 }), { countdownSeconds: 1 });
  assert.equal(result.status, COMMAND_RESULTS.EXECUTED);
  assert.equal(controller.state, SESSION_STATES.COUNTDOWN);

  controller.tick();
  assert.equal(controller.state, SESSION_STATES.RUNNING);
  controller.tick();
  controller.tick();
  controller.tick();

  assert.equal(controller.state, SESSION_STATES.COMPLETED);
  assert.equal(records.length, 1);
  assert.equal(records[0].completedCycles, 3);
  assert.equal(records[0].ballsDispatched, 0);
  assert.equal(records[0].simulation, true);
});

test("time dry run pauses explicitly and resumes without advancing while paused", () => {
  const controller = new LocalSessionController();
  controller.start(createSessionSpec({ mode: "time", drillId: "dry-run", durationSeconds: 3 }), { countdownSeconds: 0 });
  controller.tick();
  assert.equal(controller.snapshot().elapsedSeconds, 1);
  assert.equal(controller.pause().status, COMMAND_RESULTS.EXECUTED);
  controller.tick(2);
  assert.equal(controller.snapshot().elapsedSeconds, 1);
  assert.equal(controller.resume().status, COMMAND_RESULTS.EXECUTED);
  controller.tick(2);
  assert.equal(controller.state, SESSION_STATES.COMPLETED);
});

test("priority Stop returns a local session to idle and records a stopped outcome", () => {
  const records = [];
  const controller = new LocalSessionController({ onRecord: (record) => records.push(record) });
  controller.start(createSessionSpec({ drillId: "dry-run", repetitions: 10 }), { countdownSeconds: 0 });
  controller.tick();
  assert.equal(controller.stop().status, COMMAND_RESULTS.EXECUTED);
  assert.equal(controller.state, SESSION_STATES.IDLE);
  assert.equal(records[0].outcome, "stopped");
  assert.equal(records[0].ballsDispatched, 0);
  assert.equal(controller.stop().status, COMMAND_RESULTS.IGNORED);
});

test("reps dry run honors configured rest between cycles", () => {
  const controller = new LocalSessionController();
  controller.start(createSessionSpec({ drillId: "dry-run", repetitions: 2, pauseSeconds: 2 }), { countdownSeconds: 0 });
  controller.tick();
  assert.equal(controller.snapshot().completedCycles, 1);
  assert.equal(controller.snapshot().cyclePauseRemaining, 2);
  controller.tick();
  assert.equal(controller.snapshot().completedCycles, 1);
  assert.equal(controller.snapshot().cyclePauseRemaining, 1);
  controller.tick();
  assert.equal(controller.snapshot().completedCycles, 1);
  controller.tick();
  assert.equal(controller.state, SESSION_STATES.COMPLETED);
});

test("time dry run honors rest while total duration continues", () => {
  const controller = new LocalSessionController();
  controller.start(createSessionSpec({ mode: "time", drillId: "dry-run", durationSeconds: 4, pauseSeconds: 2 }), { countdownSeconds: 0 });
  controller.tick();
  assert.equal(controller.snapshot().completedCycles, 1);
  assert.equal(controller.snapshot().cyclePauseRemaining, 2);
  controller.tick();
  controller.tick();
  assert.equal(controller.snapshot().completedCycles, 1);
  controller.tick();
  assert.equal(controller.state, SESSION_STATES.COMPLETED);
});

