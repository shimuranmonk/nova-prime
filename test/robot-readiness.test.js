import assert from "node:assert/strict";
import test from "node:test";
import { RobotDiagnostics } from "../src/application/robot/robot-diagnostics.js";
import { RobotExecutor } from "../src/application/robot/robot-executor.js";
import { RobotSafetyMonitor } from "../src/application/robot/robot-safety-monitor.js";

class FakeEventSource {
  constructor() { this.listeners = new Map(); this.visibilityState = "visible"; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  dispatch(type) { this.listeners.get(type)?.(); }
}

test("robot diagnostics are timestamped, bounded, immutable, and clearable", () => {
  let now = 100;
  const diagnostics = new RobotDiagnostics({ now: () => now++, limit: 10 });
  for (let index = 0; index < 12; index += 1) diagnostics.record("test.event", { index });
  const entries = diagnostics.snapshot();
  assert.equal(entries.length, 10);
  assert.equal(entries[0].sequence, 3);
  assert.equal(entries[0].timestampMs, 102);
  assert.equal(Object.isFrozen(entries), true);
  assert.equal(Object.isFrozen(entries[0]), true);
  assert.equal(Object.isFrozen(entries[0].details), true);
  diagnostics.clear();
  assert.deepEqual(diagnostics.snapshot(), []);
});

test("backgrounding an active robot requests priority Stop and never auto-resumes", async () => {
  const visibility = new FakeEventSource();
  const lifecycle = new FakeEventSource();
  const diagnostics = new RobotDiagnostics({ now: () => 1 });
  let stopCalls = 0;
  const executor = {
    state: "running",
    async stop() { stopCalls += 1; this.state = "stopped"; return { status: "SENT" }; },
  };
  const monitor = new RobotSafetyMonitor({ executor, visibilitySource: visibility, lifecycleSource: lifecycle, diagnostics });
  monitor.arm();
  visibility.visibilityState = "hidden";
  visibility.dispatch("visibilitychange");
  await monitor.flush();
  assert.equal(stopCalls, 1);
  assert.equal(executor.state, "stopped");

  visibility.visibilityState = "visible";
  visibility.dispatch("visibilitychange");
  assert.equal(stopCalls, 1);
  assert.equal(executor.state, "stopped");
  assert.deepEqual(diagnostics.snapshot().map(({ type }) => type), [
    "lifecycle.monitor_armed",
    "lifecycle.stop_requested",
    "lifecycle.stop_completed",
    "lifecycle.foreground",
  ]);
});

test("page hide is deduplicated while Stop is already pending", async () => {
  const visibility = new FakeEventSource();
  const lifecycle = new FakeEventSource();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let stopCalls = 0;
  const executor = {
    state: "running",
    async stop() { stopCalls += 1; await pending; this.state = "stopped"; return { status: "SENT" }; },
  };
  const monitor = new RobotSafetyMonitor({ executor, visibilitySource: visibility, lifecycleSource: lifecycle });
  monitor.arm();
  lifecycle.dispatch("pagehide");
  lifecycle.dispatch("pagehide");
  assert.equal(stopCalls, 1);
  release();
  await monitor.flush();
  monitor.disarm();
  assert.equal(visibility.listeners.size, 0);
  assert.equal(lifecycle.listeners.size, 0);
});

test("executor diagnostics describe delivery and Stop without retaining packet bytes", async () => {
  const diagnostics = new RobotDiagnostics({ now: () => 1 });
  const connection = { ready: true, async write() {} };
  const executor = new RobotExecutor({ connection, diagnostics });
  await executor.start([0x81, 1, 2, 3]);
  await executor.stop();
  const entries = diagnostics.snapshot();
  assert.deepEqual(entries.map(({ type }) => type), [
    "executor.started",
    "executor.packet_sent",
    "executor.stop_attempt",
    "executor.stop_sent",
  ]);
  assert.equal(entries[1].details.byteLength, 4);
  assert.equal(JSON.stringify(entries).includes("129"), false);
});
