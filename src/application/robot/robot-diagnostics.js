function immutableDetails(details) {
  if (!details || typeof details !== "object") return Object.freeze({});
  return Object.freeze({ ...details });
}

export function recordRobotDiagnostic(diagnostics, type, details = {}) {
  try {
    diagnostics?.record?.(type, details);
  } catch {
    // Diagnostics must never interfere with Stop, disconnect, or command delivery.
  }
}

export class RobotDiagnostics {
  #entries = [];
  #sequence = 0;

  constructor({ now = () => Date.now(), limit = 200 } = {}) {
    this.now = now;
    this.limit = Math.max(10, Math.min(1000, Math.floor(limit)));
  }

  record(type, details = {}) {
    if (typeof type !== "string" || !type.trim()) throw new Error("ROBOT_DIAGNOSTIC_TYPE_REQUIRED");
    const entry = Object.freeze({
      sequence: ++this.#sequence,
      timestampMs: Number(this.now()),
      type: type.trim(),
      details: immutableDetails(details),
    });
    this.#entries.push(entry);
    if (this.#entries.length > this.limit) this.#entries.splice(0, this.#entries.length - this.limit);
    return entry;
  }

  snapshot() {
    return Object.freeze(this.#entries.slice());
  }

  clear() {
    this.#entries = [];
  }
}
