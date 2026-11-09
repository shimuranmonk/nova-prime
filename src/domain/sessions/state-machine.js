export const SESSION_STATES = Object.freeze({
  IDLE: "IDLE",
  PREPARING: "PREPARING",
  ARMED: "ARMED",
  COUNTDOWN: "COUNTDOWN",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  STOPPING: "STOPPING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
});

export const SESSION_EVENTS = Object.freeze({
  PREPARE: "PREPARE",
  ARM: "ARM",
  COUNTDOWN: "COUNTDOWN",
  START: "START",
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  STOP: "STOP",
  STOPPED: "STOPPED",
  COMPLETE: "COMPLETE",
  FAIL: "FAIL",
  RESET: "RESET",
});

export const COMMAND_RESULTS = Object.freeze({
  EXECUTED: "EXECUTED",
  IGNORED: "IGNORED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
});

const ACTIVE_STATES = new Set([
  SESSION_STATES.PREPARING,
  SESSION_STATES.ARMED,
  SESSION_STATES.COUNTDOWN,
  SESSION_STATES.RUNNING,
  SESSION_STATES.PAUSED,
  SESSION_STATES.ERROR,
]);

const TRANSITIONS = Object.freeze({
  [SESSION_STATES.IDLE]: { [SESSION_EVENTS.PREPARE]: SESSION_STATES.PREPARING },
  [SESSION_STATES.PREPARING]: { [SESSION_EVENTS.ARM]: SESSION_STATES.ARMED },
  [SESSION_STATES.ARMED]: { [SESSION_EVENTS.COUNTDOWN]: SESSION_STATES.COUNTDOWN },
  [SESSION_STATES.COUNTDOWN]: { [SESSION_EVENTS.START]: SESSION_STATES.RUNNING },
  [SESSION_STATES.RUNNING]: {
    [SESSION_EVENTS.PAUSE]: SESSION_STATES.PAUSED,
    [SESSION_EVENTS.COMPLETE]: SESSION_STATES.COMPLETED,
  },
  [SESSION_STATES.PAUSED]: {
    [SESSION_EVENTS.RESUME]: SESSION_STATES.RUNNING,
    [SESSION_EVENTS.COMPLETE]: SESSION_STATES.COMPLETED,
  },
  [SESSION_STATES.STOPPING]: { [SESSION_EVENTS.STOPPED]: SESSION_STATES.IDLE },
  [SESSION_STATES.COMPLETED]: { [SESSION_EVENTS.RESET]: SESSION_STATES.IDLE },
  [SESSION_STATES.ERROR]: { [SESSION_EVENTS.RESET]: SESSION_STATES.IDLE },
});

export function applySessionEvent(state, event) {
  if (!Object.values(SESSION_STATES).includes(state)) {
    return Object.freeze({ status: COMMAND_RESULTS.FAILED, state, reason: "UNKNOWN_STATE" });
  }
  if (!Object.values(SESSION_EVENTS).includes(event)) {
    return Object.freeze({ status: COMMAND_RESULTS.FAILED, state, reason: "UNKNOWN_EVENT" });
  }

  if (event === SESSION_EVENTS.STOP) {
    if (state === SESSION_STATES.IDLE || state === SESSION_STATES.COMPLETED) {
      return Object.freeze({ status: COMMAND_RESULTS.IGNORED, state, reason: "NOTHING_TO_STOP" });
    }
    if (state === SESSION_STATES.STOPPING) {
      return Object.freeze({ status: COMMAND_RESULTS.IGNORED, state, reason: "ALREADY_STOPPING" });
    }
    if (ACTIVE_STATES.has(state)) {
      return Object.freeze({ status: COMMAND_RESULTS.EXECUTED, state: SESSION_STATES.STOPPING, previousState: state });
    }
  }

  if (event === SESSION_EVENTS.FAIL && state !== SESSION_STATES.IDLE && state !== SESSION_STATES.COMPLETED) {
    return Object.freeze({ status: COMMAND_RESULTS.EXECUTED, state: SESSION_STATES.ERROR, previousState: state });
  }

  const target = TRANSITIONS[state]?.[event];
  if (!target) return Object.freeze({ status: COMMAND_RESULTS.BLOCKED, state, reason: "INVALID_TRANSITION" });
  return Object.freeze({ status: COMMAND_RESULTS.EXECUTED, state: target, previousState: state });
}

export class SessionStateMachine {
  #state = SESSION_STATES.IDLE;
  #listeners = new Set();

  get state() { return this.#state; }

  dispatch(event) {
    const result = applySessionEvent(this.#state, event);
    if (result.status === COMMAND_RESULTS.EXECUTED) {
      this.#state = result.state;
      this.#listeners.forEach((listener) => listener(result));
    }
    return result;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
