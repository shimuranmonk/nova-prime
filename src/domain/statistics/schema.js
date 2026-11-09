import { createId } from "../shared/id.js";
import { issue, validationResult } from "../shared/errors.js";
import { SESSION_MODES, SESSION_OUTCOMES } from "../sessions/schema.js";

export function createSessionRecord(overrides = {}) {
  return Object.freeze({
    id: createId("record"),
    mode: "reps",
    startedAt: new Date().toISOString(),
    endedAt: null,
    outcome: "completed",
    ballsPlanned: 0,
    ballsDispatched: 0,
    completedCycles: 0,
    durationSeconds: 0,
    netCount: 0,
    outCount: 0,
    drillId: null,
    errorCode: null,
    ...overrides,
  });
}

export function validateSessionRecord(record) {
  const issues = [];
  if (!record || typeof record !== "object") return validationResult([issue("STAT_RECORD_REQUIRED", "Session record is required", "record")]);
  if (!SESSION_MODES.includes(record.mode)) issues.push(issue("STAT_MODE", "Unsupported session mode", "mode"));
  if (!SESSION_OUTCOMES.includes(record.outcome)) issues.push(issue("STAT_OUTCOME", "Unsupported session outcome", "outcome"));
  for (const field of ["ballsPlanned", "ballsDispatched", "completedCycles", "durationSeconds", "netCount", "outCount"]) {
    if (!Number.isFinite(record[field]) || record[field] < 0) issues.push(issue("STAT_NUMBER", `${field} must be non-negative`, field));
  }
  return validationResult(issues, record);
}
