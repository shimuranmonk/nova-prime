function frozen(value) { return Object.freeze({ ...value }); }

export class MsyncSimulator {
  #listeners = new Set();
  #parsed = null;
  #state = "idle";
  #positionMs = 0;
  #cueIndex = 0;
  #robotCueIndex = 0;
  #robotLeadMs = 1300;
  #active = null;
  #flavor = null;
  #restUntilMs = 0;
  #events = [];
  #activations = 0;

  snapshot() {
    return frozen({
      state: this.#state,
      positionMs: this.#positionMs,
      durationMs: this.#parsed?.audio?.durationMs ?? 0,
      progress: this.#parsed?.audio?.durationMs ? Math.min(1, this.#positionMs / this.#parsed.audio.durationMs) : 0,
      active: this.#active,
      flavor: this.#flavor,
      resting: this.#restUntilMs > this.#positionMs,
      restUntilMs: this.#restUntilMs,
      robotLeadMs: this.#robotLeadMs,
      events: Object.freeze([...this.#events]),
      activations: this.#activations,
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  start(parsed, { robotLeadSeconds = parsed?.session?.robotLead ?? 1.3 } = {}) {
    if (!parsed?.audio || !Array.isArray(parsed.cues)) throw new Error("A validated MSYNC timeline is required");
    this.#parsed = parsed;
    this.#state = "playing";
    this.#positionMs = 0;
    this.#cueIndex = 0;
    this.#robotCueIndex = 0;
    this.#robotLeadMs = Math.round(Math.max(0, Math.min(5, Number(robotLeadSeconds))) * 1000);
    this.#active = null;
    this.#flavor = null;
    this.#restUntilMs = 0;
    this.#events = [];
    this.#activations = 0;
    this.#emit("START", { robotLeadMs: this.#robotLeadMs });
    this.advance(0);
    return this.snapshot();
  }

  advance(positionMs) {
    if (this.#state !== "playing") return this.snapshot();
    this.#positionMs = Math.max(this.#positionMs, Math.max(0, Number(positionMs) || 0));
    const cues = this.#parsed.cues;
    while (this.#robotCueIndex < cues.length) {
      const cue = cues[this.#robotCueIndex];
      const commandAt = Math.max(0, cue.timeMs - this.#robotLeadMs);
      if (commandAt > this.#positionMs) break;
      this.#emit("ROBOT_PLAN", { cueType: cue.type, cueTimeMs: cue.timeMs, commandAtMs: commandAt, simulation: true });
      this.#robotCueIndex += 1;
    }
    while (this.#cueIndex < cues.length && cues[this.#cueIndex].timeMs <= this.#positionMs && this.#state === "playing") {
      this.#apply(cues[this.#cueIndex]);
      this.#cueIndex += 1;
    }
    if (this.#state === "playing" && this.#positionMs >= this.#parsed.audio.durationMs) this.#complete("AUDIO_END");
    this.#notify();
    return this.snapshot();
  }

  pause() {
    if (this.#state !== "playing") return false;
    this.#state = "paused";
    this.#emit("PAUSE", {});
    return true;
  }

  resume() {
    if (this.#state !== "paused") return false;
    this.#state = "playing";
    this.#emit("RESUME", {});
    return true;
  }

  stop() {
    if (!["playing", "paused"].includes(this.#state)) return false;
    this.#state = "stopped";
    this.#active = null;
    this.#flavor = null;
    this.#restUntilMs = 0;
    this.#emit("STOP", { priority: true });
    return true;
  }

  #apply(cue) {
    if (["DRILL", "INLINE"].includes(cue.type)) {
      this.#active = frozen({ type: cue.type, name: cue.name, once: Boolean(cue.once) });
      this.#flavor = null;
      this.#restUntilMs = 0;
      this.#activations += 1;
      this.#emit("ACTIVATE", { cue });
    } else if (cue.type === "FLAVOR") {
      this.#flavor = cue.name === "NONE" ? null : cue.name;
      this.#emit("FLAVOR", { cue });
    } else if (cue.type === "REST") {
      this.#restUntilMs = cue.timeMs + cue.durationMs;
      this.#emit("REST", { cue, untilMs: this.#restUntilMs });
    } else if (cue.type === "IDLE") {
      this.#active = null;
      this.#flavor = null;
      this.#restUntilMs = 0;
      this.#emit("IDLE", { cue });
    } else if (cue.type === "STOP") {
      this.#complete("STOP_CUE");
    }
  }

  #complete(reason) {
    this.#state = "completed";
    this.#active = null;
    this.#flavor = null;
    this.#restUntilMs = 0;
    this.#emit("COMPLETE", { reason });
  }

  #emit(type, details) {
    this.#events.push(Object.freeze({ type, positionMs: this.#positionMs, ...details }));
    if (this.#events.length > 100) this.#events.shift();
    this.#notify();
  }

  #notify() {
    const snapshot = this.snapshot();
    this.#listeners.forEach((listener) => listener(snapshot));
  }
}
