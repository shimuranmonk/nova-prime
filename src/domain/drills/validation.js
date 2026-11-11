import {
  BALL_LIMITS,
  BALL_TYPES,
  DRILL_STEP_LIMIT,
  DRILL_GROUPS,
  DRILL_SCHEMA_VERSION,
  DRILL_SOURCES,
  ROBOT_POSITIONS,
  spinLimitForSpeed,
} from "./schema.js";
import { issue, validationResult } from "../shared/errors.js";

const inRange = (value, [minimum, maximum]) => Number.isFinite(value) && value >= minimum && value <= maximum;

export function validateBall(ball, path = "ball") {
  const issues = [];
  if (!ball || typeof ball !== "object") return validationResult([issue("DRILL_BALL_REQUIRED", "Ball must be an object", path)]);

  for (const field of ["speed", "spin", "height", "drop", "bpm", "repetitions"]) {
    if (!inRange(ball[field], BALL_LIMITS[field])) {
      issues.push(issue("DRILL_BALL_RANGE", `${field} is outside the supported range`, `${path}.${field}`));
    }
  }

  if (Number.isFinite(ball.speed) && Number.isFinite(ball.spin) && ball.spin > spinLimitForSpeed(ball.speed)) {
    issues.push(issue("DRILL_SPIN_SPEED_LIMIT", "Spin exceeds the Nova Plus limit for this speed", `${path}.spin`));
  }

  if (!BALL_TYPES.includes(ball.type)) issues.push(issue("DRILL_BALL_TYPE", "Ball type is unsupported", `${path}.type`));
  return validationResult(issues, ball);
}

export function validateStep(step, path = "step") {
  const issues = [];
  if (!step || typeof step !== "object") return validationResult([issue("DRILL_STEP_REQUIRED", "Step must be an object", path)]);
  if (typeof step.id !== "string" || !step.id) issues.push(issue("DRILL_STEP_ID", "Step requires an identity", `${path}.id`));
  if (typeof step.enabled !== "boolean") issues.push(issue("DRILL_STEP_ENABLED", "Step enabled state must be boolean", `${path}.enabled`));
  if (!inRange(step.scatter, BALL_LIMITS.scatter)) issues.push(issue("DRILL_SCATTER_RANGE", "Scatter is outside the supported range", `${path}.scatter`));
  if (!Array.isArray(step.variants) || step.variants.length === 0) {
    issues.push(issue("DRILL_VARIANTS_REQUIRED", "Step requires at least one variant", `${path}.variants`));
  } else {
    step.variants.forEach((ball, index) => {
      const result = validateBall(ball, `${path}.variants[${index}]`);
      issues.push(...result.issues);
      if (Number.isFinite(step.scatter) && Number.isFinite(ball.drop) && Math.abs(ball.drop) + step.scatter > 10) {
        issues.push(issue("DRILL_DROP_SCATTER", "Absolute drop plus scatter cannot exceed 10", `${path}.variants[${index}]`));
      }
    });
  }
  return validationResult(issues, step);
}

export function validateDrill(drill) {
  const issues = [];
  if (!drill || typeof drill !== "object") return validationResult([issue("DRILL_REQUIRED", "Drill must be an object", "drill")]);
  if (drill.schemaVersion !== DRILL_SCHEMA_VERSION) issues.push(issue("DRILL_SCHEMA_VERSION", "Unsupported drill schema version", "schemaVersion"));
  if (typeof drill.id !== "string" || !drill.id) issues.push(issue("DRILL_ID_REQUIRED", "Drill requires an immutable identity", "id"));
  if (typeof drill.name !== "string" || !drill.name.trim()) issues.push(issue("DRILL_NAME_REQUIRED", "Drill name is required", "name"));
  if (!DRILL_SOURCES.includes(drill.source)) issues.push(issue("DRILL_SOURCE", "Unsupported drill source", "source"));
  if (!DRILL_GROUPS.includes(drill.group)) issues.push(issue("DRILL_GROUP", "Unsupported drill group", "group"));
  if (!ROBOT_POSITIONS.includes(drill.robotPosition)) issues.push(issue("DRILL_ROBOT_POSITION", "Unsupported robot position", "robotPosition"));
  if (typeof drill.random !== "boolean") issues.push(issue("DRILL_RANDOM", "Random must be boolean", "random"));

  const programs = drill.programs;
  if (!programs || typeof programs !== "object") {
    issues.push(issue("DRILL_PROGRAMS_REQUIRED", "Drill programs are required", "programs"));
  } else {
    let populated = 0;
    for (const level of [1, 2, 3]) {
      const program = programs[level];
      if (program == null) continue;
      populated += 1;
      if (!Array.isArray(program.steps) || program.steps.length === 0) {
        issues.push(issue("DRILL_STEPS_REQUIRED", "Program requires at least one step", `programs.${level}.steps`));
      } else {
        if (program.steps.length > DRILL_STEP_LIMIT) issues.push(issue("DRILL_STEP_LIMIT", `Program cannot exceed ${DRILL_STEP_LIMIT} steps`, `programs.${level}.steps`));
        program.steps.forEach((step, index) => issues.push(...validateStep(step, `programs.${level}.steps[${index}]`).issues));
      }
    }
    if (populated === 0) issues.push(issue("DRILL_PROGRAM_REQUIRED", "At least one drill program is required", "programs"));
  }

  return validationResult(issues, drill);
}
