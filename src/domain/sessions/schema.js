import { createId } from "../shared/id.js";
import { issue, validationResult } from "../shared/errors.js";

export const SESSION_MODES = Object.freeze(["reps", "time", "music", "msync"]);
export const SESSION_OUTCOMES = Object.freeze(["completed", "stopped", "disconnected", "failed"]);

export function createSessionSpec(overrides = {}) {
  return Object.freeze({
    id: createId("session"),
    mode: "reps",
    drillId: null,
    level: 1,
    repetitions: 10,
    durationSeconds: 60,
    pauseSeconds: 1,
    playlistId: null,
    quickTrackIds: Object.freeze([]),
    msyncAttachmentId: null,
    robotPosition: "middle",
    calibrationProfileId: null,
    ...overrides,
  });
}

export function validateSessionSpec(spec) {
  const issues = [];
  if (!spec || typeof spec !== "object") return validationResult([issue("SESSION_SPEC_REQUIRED", "Session specification is required", "session")]);
  if (!SESSION_MODES.includes(spec.mode)) issues.push(issue("SESSION_MODE", "Unsupported session mode", "mode"));
  if (![1, 2, 3].includes(spec.level)) issues.push(issue("SESSION_LEVEL", "Session level must be 1, 2, or 3", "level"));
  if (!Number.isFinite(spec.pauseSeconds) || spec.pauseSeconds < 0 || spec.pauseSeconds > 30) issues.push(issue("SESSION_PAUSE", "Pause must be between 0 and 30 seconds", "pauseSeconds"));
  if (spec.mode === "reps" && (!Number.isInteger(spec.repetitions) || spec.repetitions < 1)) issues.push(issue("SESSION_REPETITIONS", "Repetitions must be a positive integer", "repetitions"));
  if (spec.mode === "time" && (!Number.isFinite(spec.durationSeconds) || spec.durationSeconds < 1)) issues.push(issue("SESSION_DURATION", "Duration must be positive", "durationSeconds"));
  if (["reps", "time", "music"].includes(spec.mode) && !spec.drillId) issues.push(issue("SESSION_DRILL_REQUIRED", "A drill is required for this mode", "drillId"));
  if (spec.mode === "music" && !spec.playlistId && (!Array.isArray(spec.quickTrackIds) || spec.quickTrackIds.length === 0)) issues.push(issue("SESSION_MUSIC_REQUIRED", "Music mode requires a playlist or Quick Music tracks", "playlistId"));
  if (spec.mode === "msync" && !spec.msyncAttachmentId) issues.push(issue("SESSION_MSYNC_REQUIRED", "MSYNC mode requires a validated attachment", "msyncAttachmentId"));
  return validationResult(issues, spec);
}
