import { createId } from "../shared/id.js";
import { issue, validationResult } from "../shared/errors.js";

export const CALIBRATION_SCHEMA_VERSION = 1;
export const CALIBRATION_MODES = Object.freeze(["standard", "complete"]);
export const CALIBRATION_OUTCOMES = Object.freeze(["landed", "net", "long", "wide", "unseen"]);

export function createCalibrationProfile(overrides = {}) {
  const now = new Date().toISOString();
  return Object.freeze({
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    id: createId("calibration"),
    name: "Default calibration",
    mode: "standard",
    status: "draft",
    robotDescriptor: Object.freeze({ model: "Nova S Pro", label: "" }),
    tableSetup: Object.freeze({ standardTable: true, robotPosition: "middle", headOffset: 0, ballNotes: "" }),
    modelParameters: Object.freeze({ xOffsetCm: 0, yOffsetCm: 0 }),
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
  if (!CALIBRATION_MODES.includes(profile.mode)) issues.push(issue("CALIBRATION_MODE", "Calibration mode is unsupported", "mode"));
  if (!["draft", "complete"].includes(profile.status)) issues.push(issue("CALIBRATION_STATUS", "Calibration status is unsupported", "status"));
  if (!profile.tableSetup || !["left", "middle", "right"].includes(profile.tableSetup.robotPosition)) issues.push(issue("CALIBRATION_POSITION", "Calibration requires a robot position", "tableSetup.robotPosition"));
  for (const field of ["xOffsetCm", "yOffsetCm"]) {
    if (!Number.isFinite(profile.modelParameters?.[field]) || Math.abs(profile.modelParameters[field]) > 100) issues.push(issue("CALIBRATION_OFFSET", `${field} is outside the supported range`, `modelParameters.${field}`));
  }
  if (!Array.isArray(profile.observations)) issues.push(issue("CALIBRATION_OBSERVATIONS", "Observations must be an array", "observations"));
  else profile.observations.forEach((observation, index) => {
    const path = `observations[${index}]`;
    if (!CALIBRATION_OUTCOMES.includes(observation?.outcome)) issues.push(issue("CALIBRATION_OUTCOME", "Observation outcome is unsupported", `${path}.outcome`));
    if (observation?.outcome === "landed" && (!["xCm", "yCm"].every((field) => Number.isFinite(observation.actual?.[field])) || !["xCm", "yCm"].every((field) => Number.isFinite(observation.predicted?.[field])))) issues.push(issue("CALIBRATION_LANDING", "Landed observations require predicted and actual coordinates", path));
  });
  if (profile.accuracy != null && (!Number.isFinite(profile.accuracy) || profile.accuracy < 0 || profile.accuracy > 200)) issues.push(issue("CALIBRATION_ACCURACY", "Calibration accuracy is outside the supported range", "accuracy"));
  if (profile.quickCheck != null && (!Number.isFinite(profile.quickCheck.meanErrorCm) || profile.quickCheck.meanErrorCm < 0)) issues.push(issue("CALIBRATION_QUICK_CHECK", "Quick Check result is invalid", "quickCheck"));
  return validationResult(issues, profile);
}
