import { recordRobotDiagnostic } from "./robot-diagnostics.js";

const ACTIVE_STATES = new Set(["running", "pausing", "paused", "stopping"]);

export class RobotSafetyMonitor {
  #armed = false;
  #pending = null;

  constructor({
    executor,
    visibilitySource = globalThis.document,
    lifecycleSource = globalThis.window,
    diagnostics,
  } = {}) {
    if (!executor) throw new Error("ROBOT_EXECUTOR_REQUIRED");
    this.executor = executor;
    this.visibilitySource = visibilitySource;
    this.lifecycleSource = lifecycleSource;
    this.diagnostics = diagnostics;
    this.onVisibilityChange = () => {
      if (this.visibilitySource?.visibilityState === "hidden") void this.#protect("visibility_hidden").catch(() => {});
      else recordRobotDiagnostic(this.diagnostics, "lifecycle.foreground", { state: this.executor.state });
    };
    this.onPageHide = () => { void this.#protect("page_hide").catch(() => {}); };
  }

  get armed() { return this.#armed; }

  arm() {
    if (this.#armed) return this.snapshot();
    this.visibilitySource?.addEventListener?.("visibilitychange", this.onVisibilityChange);
    this.lifecycleSource?.addEventListener?.("pagehide", this.onPageHide);
    this.#armed = true;
    recordRobotDiagnostic(this.diagnostics, "lifecycle.monitor_armed", { state: this.executor.state });
    return this.snapshot();
  }

  disarm() {
    if (!this.#armed) return this.snapshot();
    this.visibilitySource?.removeEventListener?.("visibilitychange", this.onVisibilityChange);
    this.lifecycleSource?.removeEventListener?.("pagehide", this.onPageHide);
    this.#armed = false;
    recordRobotDiagnostic(this.diagnostics, "lifecycle.monitor_disarmed", { state: this.executor.state });
    return this.snapshot();
  }

  async flush() {
    await this.#pending;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({ armed: this.#armed, pendingStop: Boolean(this.#pending), executorState: this.executor.state });
  }

  #protect(reason) {
    if (this.#pending) return this.#pending;
    if (!ACTIVE_STATES.has(this.executor.state)) {
      recordRobotDiagnostic(this.diagnostics, "lifecycle.stop_ignored", { reason, state: this.executor.state });
      return Promise.resolve();
    }
    const before = this.executor.state;
    recordRobotDiagnostic(this.diagnostics, "lifecycle.stop_requested", { reason, state: before });
    this.#pending = Promise.resolve(this.executor.stop())
      .then((result) => {
        recordRobotDiagnostic(this.diagnostics, "lifecycle.stop_completed", { reason, state: this.executor.state, status: result?.status });
        return result;
      })
      .catch((error) => {
        recordRobotDiagnostic(this.diagnostics, "lifecycle.stop_failed", { reason, code: error?.message ?? "UNKNOWN" });
        throw error;
      })
      .finally(() => { this.#pending = null; });
    return this.#pending;
  }
}
