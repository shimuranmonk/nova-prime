import { NOVA_PACKETS } from "../../infrastructure/robot/nova-protocol.js";

export class RobotExecutor {
  #epoch = 0;
  #tail = Promise.resolve();
  #state = "idle";
  #priorityPromise = null;

  constructor({ connection, stopAttempts = 2 } = {}) {
    if (!connection) throw new Error("ROBOT_CONNECTION_REQUIRED");
    this.connection = connection;
    this.stopAttempts = Math.max(1, Math.floor(stopAttempts));
  }

  get state() { return this.#state; }
  get epoch() { return this.#epoch; }
  snapshot() { return Object.freeze({ state: this.#state, epoch: this.#epoch, ready: this.connection.ready !== false }); }

  start(packet) {
    if (this.connection.ready === false) return Promise.reject(new Error("ROBOT_NOT_READY"));
    this.#epoch += 1;
    this.#tail = Promise.resolve();
    this.#priorityPromise = null;
    this.#state = "running";
    return this.#enqueue(packet, this.#epoch);
  }

  enqueue(packet) {
    if (this.#state !== "running") return Promise.reject(new Error("ROBOT_SESSION_NOT_RUNNING"));
    return this.#enqueue(packet, this.#epoch);
  }

  pause() {
    if (this.#state !== "running") return Promise.resolve(Object.freeze({ status: "IGNORED", reason: "NOT_RUNNING" }));
    return this.#priorityStop("paused");
  }

  resume(packet) {
    if (this.#state !== "paused") return Promise.reject(new Error("ROBOT_SESSION_NOT_PAUSED"));
    return this.start(packet);
  }

  stop() {
    if (["idle", "stopped"].includes(this.#state)) return Promise.resolve(Object.freeze({ status: "IGNORED", reason: "ALREADY_STOPPED" }));
    if (this.#priorityPromise && this.#state === "stopping") return this.#priorityPromise;
    return this.#priorityStop("stopped");
  }

  reset() {
    if (!['stopped', 'error'].includes(this.#state)) throw new Error("ROBOT_RESET_BLOCKED");
    this.#state = "idle";
    this.#priorityPromise = null;
  }

  async disconnect() {
    if (!["idle", "stopped"].includes(this.#state) && this.connection.ready !== false) await this.stop();
    this.connection.disconnect?.();
    this.#state = "idle";
  }

  #enqueue(packet, epoch) {
    const payload = Uint8Array.from(packet);
    const task = this.#tail.then(async () => {
      if (epoch !== this.#epoch || this.#state !== "running") return Object.freeze({ status: "CANCELLED", epoch });
      await this.connection.write(payload);
      if (epoch !== this.#epoch) return Object.freeze({ status: "CANCELLED", epoch });
      return Object.freeze({ status: "SENT", epoch });
    });
    this.#tail = task.catch((error) => {
      if (epoch === this.#epoch) this.#state = "error";
      throw error;
    }).catch(() => {});
    return task;
  }

  #priorityStop(finalState) {
    this.#epoch += 1;
    this.#state = finalState === "paused" ? "pausing" : "stopping";
    const epoch = this.#epoch;
    this.#priorityPromise = (async () => {
      let lastError;
      for (let attempt = 0; attempt < this.stopAttempts; attempt += 1) {
        try {
          await this.connection.write(NOVA_PACKETS.stop);
          this.#state = finalState;
          return Object.freeze({ status: "SENT", epoch, attempts: attempt + 1 });
        } catch (error) { lastError = error; }
      }
      this.#state = "error";
      throw lastError;
    })();
    return this.#priorityPromise;
  }
}
