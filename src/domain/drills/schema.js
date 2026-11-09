import { createId } from "../shared/id.js";

export const DRILL_SCHEMA_VERSION = 1;
export const DRILL_SOURCES = Object.freeze(["builtin", "custom", "imported"]);
export const DRILL_GROUPS = Object.freeze(["builtin", "A", "B", "C"]);
export const ROBOT_POSITIONS = Object.freeze(["left", "middle", "right"]);
export const BALL_TYPES = Object.freeze(["top", "back"]);

export const BALL_LIMITS = Object.freeze({
  speed: [0, 10],
  spin: [0, 10],
  height: [0, 100],
  drop: [-10, 10],
  bpm: [1, 120],
  repetitions: [1, 100],
  scatter: [0, 10],
});

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
