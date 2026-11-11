import { createId } from "../shared/id.js";

export const DRILL_SCHEMA_VERSION = 1;
export const DRILL_SOURCES = Object.freeze(["builtin", "custom", "imported"]);
export const DRILL_GROUPS = Object.freeze(["builtin", "basic", "combined", "complex", "A", "B", "C"]);
export const ROBOT_POSITIONS = Object.freeze(["left", "middle", "right"]);
export const BALL_TYPES = Object.freeze(["top", "back"]);
export const DRILL_STEP_LIMIT = 20;

export const BALL_LIMITS = Object.freeze({
  speed: [0, 10],
  spin: [0, 10],
  height: [-50, 100],
  drop: [-10, 10],
  bpm: [30, 90],
  repetitions: [1, 100],
  scatter: [0, 10],
});

export const SPIN_LIMITS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 9, 8, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

export function spinLimitForSpeed(value) {
  const speed = Math.min(10, Math.max(0, Number(value) || 0));
  const position = speed * 2;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return SPIN_LIMITS[lower];
  return SPIN_LIMITS[lower] + (SPIN_LIMITS[upper] - SPIN_LIMITS[lower]) * (position - lower);
}

export function createBall(overrides = {}) {
  return Object.freeze({
    speed: 5,
    spin: 3,
    type: "top",
    height: 40,
    drop: 0,
    bpm: 45,
    repetitions: 1,
    ...overrides,
  });
}

export function createStep(overrides = {}) {
  return Object.freeze({
    id: createId("step"),
    enabled: true,
    scatter: 0,
    variants: Object.freeze([createBall()]),
    ...overrides,
  });
}

export function createProgram(overrides = {}) {
  return Object.freeze({ steps: Object.freeze([createStep()]), metadata: Object.freeze({}), ...overrides });
}

export function createDrill(overrides = {}) {
  return Object.freeze({
    schemaVersion: DRILL_SCHEMA_VERSION,
    id: createId("drill"),
    source: "custom",
    builtinKey: null,
    name: "New drill",
    group: "A",
    robotPosition: "middle",
    random: false,
    programs: Object.freeze({ 1: createProgram(), 2: null, 3: null }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}
