import assert from "node:assert/strict";
import test from "node:test";
import { createCalibrationProfile, validateCalibrationProfile } from "../src/domain/calibration/schema.js";
import { createPlaylist, createTrack, validatePlaylist, validateTrack } from "../src/domain/music/schema.js";
import { createMsyncAttachment, validateMsyncAttachment } from "../src/domain/msync/schema.js";
import { createSessionSpec, validateSessionSpec } from "../src/domain/sessions/schema.js";
import { createSessionRecord, validateSessionRecord } from "../src/domain/statistics/schema.js";

test("calibration profile foundation is valid", () => {
  assert.equal(validateCalibrationProfile(createCalibrationProfile()).valid, true);
});

test("music track requires playable metadata and audio", () => {
  const result = validateTrack(createTrack());
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "AUDIO_TRACK_DURATION"));
  assert.ok(result.issues.some((entry) => entry.code === "AUDIO_TRACK_BLOB"));
});

test("playlist item identities and order are validated", () => {
  const result = validatePlaylist(createPlaylist({ items: [{ trackId: "track_1", order: 0 }] }));
  assert.equal(result.valid, true);
});

test("session requirements depend on mode", () => {
  assert.equal(validateSessionSpec(createSessionSpec({ drillId: "drill_1" })).valid, true);
  assert.equal(validateSessionSpec(createSessionSpec({ mode: "music", drillId: "drill_1" })).valid, false);
  assert.equal(validateSessionSpec(createSessionSpec({ mode: "msync", drillId: null })).valid, false);
});

test("MSYNC attachments require validated source data", () => {
  assert.equal(validateMsyncAttachment(createMsyncAttachment()).valid, false);
});

test("statistics reject negative counters", () => {
  const result = validateSessionRecord(createSessionRecord({ ballsDispatched: -1 }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.path === "ballsDispatched"));
});

test("statistics accept legacy records and validate optional planning fields", () => {
  const legacy = createSessionRecord();
  const { level, targetAmount, pauseSeconds, ...withoutPlanningFields } = legacy;
  assert.equal(validateSessionRecord(withoutPlanningFields).valid, true);
  assert.equal(validateSessionRecord(createSessionRecord({ level: 4 })).valid, false);
  assert.equal(validateSessionRecord(createSessionRecord({ targetAmount: -1 })).valid, false);
});
