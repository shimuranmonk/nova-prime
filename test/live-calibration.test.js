import assert from "node:assert/strict";
import test from "node:test";
import { fixture, flush } from "../test-support/live-runtime-fixture.js";
import { encodeDrillPacket } from "../src/infrastructure/robot/nova-protocol.js";

const ball = { speed: 3, spin: 3, type: "top", height: 40, drop: -4, bpm: 60, repetitions: 12 };

test("calibration uses the training encoder for exactly one ball per request", async () => {
  const f = fixture();
  await f.connect();
  const first = globalThis.NOVA_PRIME_CALIBRATION_FIRE(ball);
  await flush();
  await assert.rejects(globalThis.NOVA_PRIME_CALIBRATION_FIRE(ball), /idle/);
  await f.start();
  assert.equal(f.controller.state, "IDLE");
  const single = { steps: [{ enabled: true, scatter: 0, variants: [{ ...ball, repetitions: 1 }] }] };
  assert.deepEqual(f.programs().map(({ p }) => p), [[...encodeDrillPacket(single)]]);
  await f.done();
  assert.equal(await first, true);
  assert.equal(f.stops().length, 1);
  assert.equal(f.programs().length, 1);

  const second = globalThis.NOVA_PRIME_CALIBRATION_FIRE(ball);
  await flush();
  await f.done();
  assert.equal(await second, true);
  assert.equal(f.programs().length, 2);
});

test("calibration validates readiness and settings before writing", async () => {
  const f = fixture();
  await assert.rejects(globalThis.NOVA_PRIME_CALIBRATION_FIRE(ball), /Connect/);
  await f.connect();
  await assert.rejects(globalThis.NOVA_PRIME_CALIBRATION_FIRE({ ...ball, spin: 20 }), /range/);
  assert.equal(f.programs().length, 0);
});

test("a missing calibration completion triggers Stop and reports a failed shot", async () => {
  const f = fixture();
  await f.connect();
  const firing = globalThis.NOVA_PRIME_CALIBRATION_FIRE(ball);
  const result = assert.rejects(firing, /completion was not reported/);
  await f.c.advance(8000);
  await result;
  assert.equal(f.programs().length, 1);
  assert.equal(f.stops().length, 1);
});

test("backgrounding an armed calibration shot stops it without a retry", async () => {
  const f = fixture();
  await f.connect();
  const firing = globalThis.NOVA_PRIME_CALIBRATION_FIRE(ball);
  await flush();
  f.doc.visibilityState = "hidden";
  await f.doc.emit("visibilitychange");
  assert.equal(await firing, false);
  await f.c.advance(10000);
  assert.equal(f.programs().length, 1);
  assert.ok(f.stops().length >= 1);
  assert.equal(f.header.dataset.connected, "false");
});
