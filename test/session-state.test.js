import assert from "node:assert/strict";
import test from "node:test";
import {
  applySessionEvent,
  COMMAND_RESULTS,
  SESSION_EVENTS,
  SESSION_STATES,
  SessionStateMachine,
} from "../src/domain/sessions/state-machine.js";

test("canonical happy path reaches running and completes", () => {
  const machine = new SessionStateMachine();
  for (const event of [SESSION_EVENTS.PREPARE, SESSION_EVENTS.ARM, SESSION_EVENTS.COUNTDOWN, SESSION_EVENTS.START]) {
    assert.equal(machine.dispatch(event).status, COMMAND_RESULTS.EXECUTED);
  }
  assert.equal(machine.state, SESSION_STATES.RUNNING);
  assert.equal(machine.dispatch(SESSION_EVENTS.COMPLETE).state, SESSION_STATES.COMPLETED);
  assert.equal(machine.dispatch(SESSION_EVENTS.RESET).state, SESSION_STATES.IDLE);
});

test("stop has priority from every active state", () => {
  for (const state of [SESSION_STATES.PREPARING, SESSION_STATES.ARMED, SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING, SESSION_STATES.PAUSED, SESSION_STATES.ERROR]) {
    const result = applySessionEvent(state, SESSION_EVENTS.STOP);
    assert.equal(result.status, COMMAND_RESULTS.EXECUTED);
    assert.equal(result.state, SESSION_STATES.STOPPING);
  }
});

test("repeated stop is idempotent", () => {
  const result = applySessionEvent(SESSION_STATES.STOPPING, SESSION_EVENTS.STOP);
  assert.equal(result.status, COMMAND_RESULTS.IGNORED);
  assert.equal(result.state, SESSION_STATES.STOPPING);
});

test("pause and resume are explicit rather than toggled", () => {
  assert.equal(applySessionEvent(SESSION_STATES.RUNNING, SESSION_EVENTS.PAUSE).state, SESSION_STATES.PAUSED);
  assert.equal(applySessionEvent(SESSION_STATES.PAUSED, SESSION_EVENTS.RESUME).state, SESSION_STATES.RUNNING);
  assert.equal(applySessionEvent(SESSION_STATES.PAUSED, SESSION_EVENTS.PAUSE).status, COMMAND_RESULTS.BLOCKED);
});
