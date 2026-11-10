import { createSessionRecord } from "../../domain/statistics/schema.js";
import { validateSessionSpec } from "../../domain/sessions/schema.js";
import { COMMAND_RESULTS, SESSION_EVENTS, SESSION_STATES, SessionStateMachine } from "../../domain/sessions/state-machine.js";

function freezeSnapshot(value) {
  return Object.freeze({ ...value });
}

export class LocalSessionController {
  #machine = new SessionStateMachine();
  #listeners = new Set();
  #spec = null;
  #countdownRemaining = 0;
  #elapsedSeconds = 0;
  #completedCycles = 0;
  #cyclePauseRemaining = 0;
  #startedAt = null;
  #errorCode = null;
  #recorded = false;
  #now;
  #onRecord;

  constructor({ now = () => new Date().toISOString(), onRecord = async () => {} } = {}) {
    this.#now = now;
    this.#onRecord = onRecord;
  }

  get state() { return this.#machine.state; }

  snapshot() {
    return freezeSnapshot({
      state: this.state,
      spec: this.#spec,
      countdownRemaining: this.#countdownRemaining,
      elapsedSeconds: this.#elapsedSeconds,
      completedCycles: this.#completedCycles,
      cyclePauseRemaining: this.#cyclePauseRemaining,
      progress: this.#progress(),
      simulation: true,
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  start(spec, { countdownSeconds = 3 } = {}) {
    if (this.state !== SESSION_STATES.IDLE) return freezeSnapshot({ status: COMMAND_RESULTS.BLOCKED, reason: "SESSION_ACTIVE" });
    const validation = validateSessionSpec(spec);
    if (!validation.valid || !["reps", "time", "music", "msync"].includes(spec.mode)) {
      return freezeSnapshot({ status: COMMAND_RESULTS.BLOCKED, reason: "INVALID_LOCAL_SESSION", issues: validation.issues });
    }

    this.#spec = spec;
    this.#countdownRemaining = Math.max(0, Math.floor(countdownSeconds));
    this.#elapsedSeconds = 0;
    this.#completedCycles = 0;
    this.#cyclePauseRemaining = 0;
    this.#startedAt = this.#now();
    this.#errorCode = null;
    this.#recorded = false;
    this.#machine.dispatch(SESSION_EVENTS.PREPARE);
    this.#machine.dispatch(SESSION_EVENTS.ARM);
    this.#machine.dispatch(SESSION_EVENTS.COUNTDOWN);
    if (this.#countdownRemaining === 0) this.#machine.dispatch(SESSION_EVENTS.START);
    this.#notify();
    return freezeSnapshot({ status: COMMAND_RESULTS.EXECUTED, snapshot: this.snapshot() });
  }

  tick(seconds = 1) {
    const amount = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    if (this.state === SESSION_STATES.COUNTDOWN) {
      this.#countdownRemaining = Math.max(0, this.#countdownRemaining - amount);
      if (this.#countdownRemaining === 0) this.#machine.dispatch(SESSION_EVENTS.START);
    } else if (this.state === SESSION_STATES.RUNNING) {
      this.#elapsedSeconds += amount;
      if (["music", "msync"].includes(this.#spec.mode)) {
        // Audio owns completion; the canonical session still owns elapsed time,
        // Pause, Resume, Stop, recording, and failure recovery.
      } else if (this.#spec.mode === "reps") {
        if (this.#cyclePauseRemaining > 0) {
          this.#cyclePauseRemaining = Math.max(0, this.#cyclePauseRemaining - amount);
        } else {
          this.#completedCycles = Math.min(this.#spec.repetitions, this.#completedCycles + 1);
          if (this.#completedCycles < this.#spec.repetitions) this.#cyclePauseRemaining = this.#spec.pauseSeconds;
        }
      } else if (this.#cyclePauseRemaining > 0) {
        this.#cyclePauseRemaining = Math.max(0, this.#cyclePauseRemaining - amount);
      } else {
        this.#completedCycles += 1;
        this.#cyclePauseRemaining = this.#spec.pauseSeconds;
      }

      const complete = this.#spec.mode === "reps"
        ? this.#completedCycles >= this.#spec.repetitions
        : this.#spec.mode === "time" && this.#elapsedSeconds >= this.#spec.durationSeconds;
      if (complete) void this.#finish("completed");
    }
    this.#notify();
    return this.snapshot();
  }

  pause() {
    const result = this.#machine.dispatch(SESSION_EVENTS.PAUSE);
    this.#notify();
    return result;
  }

  resume() {
    const result = this.#machine.dispatch(SESSION_EVENTS.RESUME);
    this.#notify();
    return result;
  }

  complete({ completedCycles = this.#completedCycles } = {}) {
    const result = this.#machine.dispatch(SESSION_EVENTS.COMPLETE);
    if (result.status === COMMAND_RESULTS.EXECUTED) {
      this.#completedCycles = Math.max(0, Math.floor(completedCycles));
      void this.#record("completed");
    }
    this.#notify();
    return result;
  }

  fail(errorCode = "SESSION_FAILED") {
    const result = this.#machine.dispatch(SESSION_EVENTS.FAIL);
    if (result.status === COMMAND_RESULTS.EXECUTED) {
      this.#errorCode = String(errorCode);
      void this.#record("failed");
    }
    this.#notify();
    return result;
  }

  stop() {
    const result = this.#machine.dispatch(SESSION_EVENTS.STOP);
    if (result.status === COMMAND_RESULTS.EXECUTED) {
      this.#machine.dispatch(SESSION_EVENTS.STOPPED);
      void this.#record("stopped");
      this.#clear();
    }
    this.#notify();
    return result;
  }

  async #finish(outcome) {
    this.#machine.dispatch(SESSION_EVENTS.COMPLETE);
    await this.#record(outcome);
  }

  async #record(outcome) {
    if (!this.#spec || !this.#startedAt || this.#recorded) return;
    this.#recorded = true;
    const record = createSessionRecord({
      mode: this.#spec.mode,
      startedAt: this.#startedAt,
      endedAt: this.#now(),
      outcome,
      ballsPlanned: 0,
      ballsDispatched: 0,
      completedCycles: this.#completedCycles,
      durationSeconds: Math.round(this.#elapsedSeconds),
      drillId: this.#spec.drillId,
      level: this.#spec.level,
      targetAmount: this.#spec.mode === "reps" ? this.#spec.repetitions : this.#spec.mode === "time" ? this.#spec.durationSeconds : null,
      pauseSeconds: this.#spec.pauseSeconds,
      playlistId: this.#spec.playlistId,
      quickTrackIds: this.#spec.quickTrackIds,
      msyncAttachmentId: this.#spec.msyncAttachmentId,
      errorCode: this.#errorCode,
      simulation: true,
    });
    await this.#onRecord(record);
  }

  reset() {
    if (this.state !== SESSION_STATES.COMPLETED && this.state !== SESSION_STATES.ERROR) {
      return freezeSnapshot({ status: COMMAND_RESULTS.BLOCKED, reason: "NOT_FINISHED" });
    }
    const result = this.#machine.dispatch(SESSION_EVENTS.RESET);
    this.#clear();
    this.#notify();
    return result;
  }

  #clear() {
    this.#spec = null;
    this.#countdownRemaining = 0;
    this.#elapsedSeconds = 0;
    this.#completedCycles = 0;
    this.#cyclePauseRemaining = 0;
    this.#startedAt = null;
    this.#errorCode = null;
    this.#recorded = false;
  }

  #progress() {
    if (!this.#spec) return 0;
    if (["music", "msync"].includes(this.#spec.mode)) return 0;
    const current = this.#spec.mode === "reps" ? this.#completedCycles : this.#elapsedSeconds;
    const target = this.#spec.mode === "reps" ? this.#spec.repetitions : this.#spec.durationSeconds;
    return Math.min(1, target > 0 ? current / target : 0);
  }

  #notify() {
    const snapshot = this.snapshot();
    this.#listeners.forEach((listener) => listener(snapshot));
  }
}

