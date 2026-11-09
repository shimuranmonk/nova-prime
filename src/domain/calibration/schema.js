import { createId } from "../shared/id.js";
import { issue, validationResult } from "../shared/errors.js";

export const CALIBRATION_SCHEMA_VERSION = 1;

export function createCalibrationProfile(overrides = {}) {
  const now = new Date().toISOString();
  return Object.freeze({
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    id: createId("calibration"),
    name: "Default calibration",
    robotDescriptor: Object.freeze({ model: "Nova S Pro", label: "" }),
    tableSetup: Object.freeze({ standardTable: true, headOffset: 0, ballNotes: "" }),
    modelParameters: Object.freeze({}),
    observations: Object.freeze([]),
    scatterEstimate: null,
    accuracy: null,
    quickCheck: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function validateCalibrationProfile(profile) {
  const issues = [];
  if (!profile || typeof profile !== "object") return validationResult([issue("CALIBRATION_REQUIRED", "Calibration profile is required", "calibration")]);
  if (profile.schemaVersion !== CALIBRATION_SCHEMA_VERSION) issues.push(issue("CALIBRATION_VERSION", "Unsupported calibration schema", "schemaVersion"));
  if (typeof profile.id !== "string" || !profile.id) issues.push(issue("CALIBRATION_ID", "Calibration requires an identity", "id"));
  if (typeof profile.name !== "string" || !profile.name.trim()) issues.push(issue("CALIBRATION_NAME", "Calibration name is required", "name"));
  if (!Array.isArray(profile.observations)) issues.push(issue("CALIBRATION_OBSERVATIONS", "Observations must be an array", "observations"));
  return validationResult(issues, profile);
}
