import { containsDoneSignal, createAuthResponse, NOVA_PACKETS } from "../../infrastructure/robot/nova-protocol.js";
import { recordRobotDiagnostic } from "./robot-diagnostics.js";

const CONNECTION_STATES = Object.freeze(["disconnected", "connecting", "handshake", "auth_1", "auth_2", "auth_3", "ready", "error"]);

export class NovaRobotConnection {
  #state = "disconnected";
  #listeners = new Set();
  #readyResolve = null;
  #readyReject = null;
  #readyPromise = null;

  constructor({ transport, handshakeTimeoutMs = 8000, digest, diagnostics } = {}) {
    if (!transport) throw new Error("NOVA_TRANSPORT_REQUIRED");
    this.transport = transport;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.digest = digest;
    this.diagnostics = diagnostics;
  }

  get state() { return this.#state; }
  get ready() { return this.#state === "ready"; }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  snapshot() { return Object.freeze({ state: this.#state, ready: this.ready, supported: this.transport.supported !== false }); }

  async connect() {
    if (this.ready) return this.snapshot();
    if (this.#state !== "disconnected" && this.#state !== "error") throw new Error("NOVA_CONNECTION_BUSY");
    this.#setState("connecting");
    await this.transport.connect({
      onNotification: (bytes) => { void this.#onNotification(bytes); },
      onDisconnect: () => this.#handleDisconnect(),
    });
    this.#readyPromise = new Promise((resolve, reject) => { this.#readyResolve = resolve; this.#readyReject = reject; });
    this.#setState("handshake");
    let timer;
    try {
      await this.transport.write(NOVA_PACKETS.handshakeStart);
      await Promise.race([
        this.#readyPromise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("NOVA_HANDSHAKE_TIMEOUT")), this.handshakeTimeoutMs); }),
      ]);
      return this.snapshot();
    } catch (error) {
      this.#fail(error);
      this.transport.disconnect();
      throw error;
    } finally {
      clearTimeout(timer);
      this.#readyPromise = null;
      this.#readyResolve = null;
      this.#readyReject = null;
    }
  }

  write(bytes) {
    if (!this.ready) return Promise.reject(new Error("NOVA_NOT_AUTHENTICATED"));
    return this.transport.write(bytes);
  }

  disconnect() {
    this.transport.disconnect();
    this.#setState("disconnected");
  }

  async #onNotification(bytes) {
    try {
      if (containsDoneSignal(bytes)) {
        recordRobotDiagnostic(this.diagnostics, "connection.done", { state: this.#state });
        this.#emit({ type: "done", bytes: Uint8Array.from(bytes) });
      }
      if (this.#state === "handshake") {
        const response = createAuthResponse(bytes, this.digest);
        this.#setState("auth_1");
        await this.transport.write(response);
      } else if (this.#state === "auth_1") {
        this.#setState("auth_2");
        await this.transport.write(NOVA_PACKETS.authOne);
      } else if (this.#state === "auth_2") {
        this.#setState("auth_3");
        await this.transport.write(NOVA_PACKETS.authTwo);
      } else if (this.#state === "auth_3") {
        await this.transport.write(NOVA_PACKETS.ready);
        this.#setState("ready");
        this.#readyResolve?.(this.snapshot());
      }
    } catch (error) {
      this.#fail(error);
      this.transport.disconnect();
      this.#readyReject?.(error);
    }
  }

  #handleDisconnect() {
    const error = new Error("NOVA_DISCONNECTED");
    recordRobotDiagnostic(this.diagnostics, "connection.disconnected", { state: this.#state });
    this.#setState("disconnected");
    this.#readyReject?.(error);
  }

  #fail(error) {
    recordRobotDiagnostic(this.diagnostics, "connection.error", { state: this.#state, code: error?.message ?? "UNKNOWN" });
    this.#setState("error");
    this.#emit({ type: "error", error });
  }

  #setState(state) {
    if (!CONNECTION_STATES.includes(state)) throw new Error("NOVA_CONNECTION_STATE_INVALID");
    this.#state = state;
    recordRobotDiagnostic(this.diagnostics, "connection.state", { state });
    this.#emit({ type: "state", snapshot: this.snapshot() });
  }

  #emit(event) { this.#listeners.forEach((listener) => listener(Object.freeze(event.type ? { ...event } : event))); }
}
