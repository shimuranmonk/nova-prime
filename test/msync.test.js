import assert from "node:assert/strict";
import test from "node:test";
import { createMsyncValidationContext } from "../src/application/msync/context.js";
import { MsyncService } from "../src/application/msync/msync-service.js";
import { MsyncSimulator } from "../src/application/msync/msync-simulator.js";
import { validateMsyncSource } from "../src/domain/msync/validator.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

const HASH = "8fd41e9802b5c417b45a91c90a12cdb074377d4f6a9c4d1e753624cbb3892601";
const TRACK = Object.freeze({
  id: "track_test", displayName: "test.mp3", mimeType: "audio/mpeg", byteSize: 5,
  durationMs: 60_000, sha256: HASH, audioBlob: new Blob(["audio"]), msyncAttachmentId: null,
  createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
});

function source(extra = "") {
  return `MSYNC_VERSION=1

[AUDIO]
FILENAME=test.mp3
SHA256=${HASH}
DURATION=01:00.000

[INLINE:INL_TEST]
NAME=Test Pattern
BALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2

[CUES]
00:00.000 INLINE=INL_TEST
00:01.000 REST=2
${extra}`;
}

test("frozen MSYNC v1 validator accepts a matching inline timeline", () => {
  const result = validateMsyncSource(source("00:05.000 STOP"), createMsyncValidationContext(TRACK));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.parsed.cues.length, 3);
  assert.equal(result.parsed.session.robotLead, 1.3);
  assert.equal(result.parsed.inline.INL_TEST.balls[0].type, "top");
});

test("MSYNC validator rejects silent repair candidates", () => {
  const invalid = source("00:05.000 STOP").replace("TYPE=top", "TYPE=Top");
  const result = validateMsyncSource(invalid, createMsyncValidationContext(TRACK));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.code === "INVALID_BALL_TYPE"));
});

test("MSYNC attach validates first and writes track plus attachment atomically", async () => {
  const store = new MemoryStore({ tracks: [TRACK] });
  const service = new MsyncService(store, { now: () => "2026-11-10T00:00:00.000Z" });
  const file = { name: "training.ini", text: async () => source("00:05.000 STOP") };
  const result = await service.attach(file, TRACK.id);
  assert.equal(result.attached, true);
  const updated = await store.get("tracks", TRACK.id);
  assert.equal(updated.msyncAttachmentId, result.attachment.id);
  assert.equal((await store.getAll("msyncAttachments")).length, 1);
  assert.equal((await service.revalidate(result.attachment.id)).valid, true);
});

test("invalid MSYNC input never mutates stored audio or attachments", async () => {
  const store = new MemoryStore({ tracks: [TRACK] });
  const service = new MsyncService(store);
  const result = await service.attach({ name: "broken.msync", text: async () => source("00:05.000 STOP").replace("TYPE=top", "TYPE=Top") }, TRACK.id);
  assert.equal(result.attached, false);
  assert.equal((await store.get("tracks", TRACK.id)).msyncAttachmentId, null);
  assert.deepEqual(await store.getAll("msyncAttachments"), []);
});

test("MSYNC simulator applies cues and exposes lead-time plans without transport", () => {
  const validation = validateMsyncSource(source("00:05.000 STOP"), createMsyncValidationContext(TRACK));
  const simulator = new MsyncSimulator();
  simulator.start(validation.parsed, { robotLeadSeconds: 1.3 });
  assert.equal(simulator.snapshot().active.name, "INL_TEST");
  simulator.advance(1_000);
  assert.equal(simulator.snapshot().resting, true);
  simulator.advance(5_000);
  assert.equal(simulator.snapshot().state, "completed");
  assert.ok(simulator.snapshot().events.some((event) => event.type === "ROBOT_PLAN" && event.simulation));
});

test("MSYNC simulator pause and priority stop prevent later cue activation", () => {
  const validation = validateMsyncSource(source("00:05.000 STOP"), createMsyncValidationContext(TRACK));
  const simulator = new MsyncSimulator();
  simulator.start(validation.parsed);
  simulator.pause();
  simulator.advance(5_000);
  assert.equal(simulator.snapshot().state, "paused");
  simulator.stop();
  simulator.advance(60_000);
  assert.equal(simulator.snapshot().state, "stopped");
});
