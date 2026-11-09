import { DRILL_SCHEMA_VERSION } from "./schema.js";

export const BUILTIN_CATALOG_SOURCE = Object.freeze({
  repository: "shimuranmonk/nova-advance",
  branch: "refactor/nova-trainer-modular",
  libraryPath: "js/model/library.js",
  libraryBlob: "9a0c54a59deb2fea46e24c8c40296730e14c24d6",
  ballPath: "js/model/ball.js",
  ballBlob: "8bb90b539a7b5fb4279e34439039453aebbb4c0d",
});

const STROKES = Object.freeze({
  push: (drop) => [ball(2, 2, "back", drop, 36), ball(2, 3, "back", drop, 42), ball(2, 4, "back", drop, 48)],
  drive: (drop) => [ball(3, 2, "top", drop, 54), ball(3, 2, "top", drop, 60), ball(3, 2, "top", drop, 72)],
  loop: (drop) => [ball(2.5, 3, "back", drop, 36), ball(2.5, 4, "back", drop, 42), ball(2.5, 5, "back", drop, 48)],
});

const SIDE = Object.freeze({ b: -5, f: 5 });
const BASIC = Object.freeze(["push(b)", "push(f)", "drive(b)", "drive(f)", "loop(b)", "loop(f)"]);
const COMBINED = Object.freeze([
  "loop(b)-drive(b)", "loop(f)-drive(f)", "drive(f)-drive(b)", "push(f)-drive(f)",
  "push(b)-loop(b)", "loop(f)-drive(b)", "push(f)-loop(b)", "drive(f)-drive(f)",
  "push(b)-loop(f)", "push(f)-loop(f)", "loop(f)-loop(f)", "loop(b)-drive(f)",
]);
const COMPLEX = Object.freeze([
  "push(b)-loop(f)-drive(b)", "push(f)-loop(b)-drive(f)", "loop(f)-drive(f)-drive(b)",
  "loop(b)-drive(f)-drive(b)", "drive(f)-drive(f)-drive(f)", "push(f)-loop(f)-drive(f)",
  "push(b)-loop(b)-drive(b)", "push(f)-loop(b)-drive(b)", "loop(f)-drive(b)-drive(f)",
  "loop(b)-drive(b)-drive(f)", "push(b)-loop(f)-drive(f)", "push(b)-loop(b)-drive(f)",
  "drive(b)-drive(f)-drive(f)",
]);
const RANDOM = Object.freeze({
  "random-drive": Object.freeze(["drive(f)", "drive(b)"]),
  "23-random-drive": Object.freeze(["drive(f)", "drive(b)", "drive(f)"]),
  "all-random": Object.freeze(["push(f)", "push(b)", "drive(f)", "drive(b)"]),
});
const RANDOM_NAMES = Object.freeze({
  "random-drive": "Random drive",
  "23-random-drive": "2-3 random drive",
  "all-random": "All random",
});

function ball(speed, spin, type, drop, bpm) {
  return Object.freeze({ speed, spin, type, height: 50, drop, bpm, repetitions: 1 });
}

function parseToken(token) {
  const match = token.match(/^(\w+)\((\w)\)$/);
  if (!match || !STROKES[match[1]] || !(match[2] in SIDE)) throw new Error(`Invalid built-in drill token: ${token}`);
  return Object.freeze({ stroke: match[1], side: match[2] });
}

function slug(key) {
  return key.replaceAll("(", "-").replaceAll(")", "").replaceAll("_", "-");
}

function prettyName(key) {
  if (RANDOM_NAMES[key]) return RANDOM_NAMES[key];
  return key.split("-").map((token) => {
    const { stroke, side } = parseToken(token);
    return `${stroke[0].toUpperCase()}${stroke.slice(1)} ${side === "b" ? "BH" : "FH"}`;
  }).join(" – ");
}

function makeStep(drillSlug, level, index, sourceBall) {
  return Object.freeze({
    id: `builtin:${drillSlug}:l${level}:s${index + 1}`,
    enabled: true,
    scatter: 0,
    variants: Object.freeze([sourceBall]),
  });
}

function makeProgram(key, level, tokens, useLevelParameters) {
  const drillSlug = slug(key);
  const steps = tokens.map((token, index) => {
    const { stroke, side } = parseToken(token);
    const sourceBall = STROKES[stroke](SIDE[side])[useLevelParameters ? level - 1 : 0];
    return makeStep(drillSlug, level, index, sourceBall);
  });
  return Object.freeze({ steps: Object.freeze(steps), metadata: Object.freeze({ sourceLevel: level }) });
}

function makeDrill(key, group, tokens, { random = false, useLevelParameters = false } = {}) {
  const drillSlug = slug(key);
  return Object.freeze({
    schemaVersion: DRILL_SCHEMA_VERSION,
    id: `builtin:${drillSlug}`,
    source: "builtin",
    builtinKey: key,
    name: prettyName(key),
    group,
    robotPosition: "middle",
    random,
    programs: Object.freeze({
      1: makeProgram(key, 1, tokens, useLevelParameters),
      2: makeProgram(key, 2, tokens, useLevelParameters),
      3: makeProgram(key, 3, tokens, useLevelParameters),
    }),
    sourceReference: BUILTIN_CATALOG_SOURCE,
  });
}

const catalog = [
  ...BASIC.map((key) => makeDrill(key, "basic", [key], { useLevelParameters: true })),
  ...COMBINED.map((key) => makeDrill(key, "combined", key.split("-"))),
  ...COMPLEX.map((key) => makeDrill(key, "complex", key.split("-"))),
  ...Object.entries(RANDOM).map(([key, tokens]) => makeDrill(key, "complex", tokens, { random: true })),
];

export const BUILTIN_DRILLS = Object.freeze(catalog);
export const BUILTIN_GROUPS = Object.freeze([
  Object.freeze({ id: "basic", label: "Basic", count: 6 }),
  Object.freeze({ id: "combined", label: "Combined", count: 12 }),
  Object.freeze({ id: "complex", label: "Complex", count: 16 }),
]);

const byId = new Map(BUILTIN_DRILLS.map((drill) => [drill.id, drill]));

export function getBuiltinDrills(group = null) {
  return group ? BUILTIN_DRILLS.filter((drill) => drill.group === group) : [...BUILTIN_DRILLS];
}

export function getBuiltinDrill(id) {
  return byId.get(id) ?? null;
}

