import { createBall } from "../drills/schema.js";

const planBall = (id, name, ball, target, kind) => Object.freeze({ id, name, ball: createBall(ball), target: Object.freeze(target), kind });

export const STANDARD_CALIBRATION_PLAN = Object.freeze([
  planBall("top-deep-bh", "Topspin · deep backhand", { speed: 3, spin: 5, type: "top", height: 44, drop: -4 }, { xCm: -35, yCm: 40 }, "top"),
  planBall("none-forehand", "No spin · forehand", { speed: 3.5, spin: 0, type: "top", height: 46, drop: 4 }, { xCm: 35, yCm: 75 }, "none"),
  planBall("back-short", "Backspin · short middle", { speed: 1.8, spin: 5.5, type: "back", height: 42, drop: 0 }, { xCm: 0, yCm: 100 }, "back"),
  planBall("top-fast-fh", "Fast topspin · deep forehand", { speed: 4.5, spin: 3, type: "top", height: 48, drop: 4 }, { xCm: 35, yCm: 30 }, "top"),
  planBall("serve-short", "Short backspin serve", { speed: 1.8, spin: 5.5, type: "back", height: 28, drop: 0 }, { xCm: 0, yCm: 110 }, "serve"),
]);

export const COMPLETE_CALIBRATION_PLAN = Object.freeze(STANDARD_CALIBRATION_PLAN.flatMap((test) => [test, Object.freeze({ ...test, id: `${test.id}-repeat`, name: `${test.name} · repeat` })]));

export function calibrationPlan(mode = "standard") {
  return mode === "complete" ? COMPLETE_CALIBRATION_PLAN : STANDARD_CALIBRATION_PLAN;
}

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const rounded = (value, precision = 1) => Math.round(value * (10 ** precision)) / (10 ** precision);

export function calculateCalibration(observations) {
  const landed = observations.filter((entry) => entry.outcome === "landed" && entry.actual && entry.predicted);
  if (landed.length < 3) throw new Error("Record at least three landed balls before saving calibration");
  const dx = landed.map((entry) => entry.actual.xCm - entry.predicted.xCm);
  const dy = landed.map((entry) => entry.actual.yCm - entry.predicted.yCm);
  const xOffsetCm = average(dx);
  const yOffsetCm = average(dy);
  const residuals = landed.map((entry) => Math.hypot((entry.actual.xCm - entry.predicted.xCm) - xOffsetCm, (entry.actual.yCm - entry.predicted.yCm) - yOffsetCm));
  const rawErrors = landed.map((entry) => Math.hypot(entry.actual.xCm - entry.predicted.xCm, entry.actual.yCm - entry.predicted.yCm));
  const accuracy = Math.max(6, Math.round(Math.sqrt(average(residuals.map((value) => value ** 2)))));

  const groups = new Map();
  for (const entry of landed) {
    const key = entry.testId.replace(/-repeat$/, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry.actual);
  }
  const spreads = [];
  for (const points of groups.values()) {
    if (points.length < 2) continue;
    const cx = average(points.map((point) => point.xCm));
    const cy = average(points.map((point) => point.yCm));
    spreads.push(...points.map((point) => Math.hypot(point.xCm - cx, point.yCm - cy)));
  }
  return Object.freeze({
    modelParameters: Object.freeze({ xOffsetCm: rounded(xOffsetCm), yOffsetCm: rounded(yOffsetCm) }),
    accuracy,
    rawMeanErrorCm: rounded(average(rawErrors)),
    scatterEstimate: spreads.length ? rounded(average(spreads)) : null,
    landedCount: landed.length,
  });
}

export function summarizeQuickCheck(observations) {
  const landed = observations.filter((entry) => entry.outcome === "landed" && entry.actual && entry.predicted);
  const errors = landed.map((entry) => Math.hypot(entry.actual.xCm - entry.predicted.xCm, entry.actual.yCm - entry.predicted.yCm));
  const outcomes = observations.reduce((result, entry) => ({ ...result, [entry.outcome]: (result[entry.outcome] || 0) + 1 }), {});
  const meanErrorCm = rounded(average(errors));
  const suggestions = [];
  if (outcomes.net) suggestions.push("Raise height by about 5 points for balls that meet the net.");
  if (outcomes.long) suggestions.push("Lower height or speed slightly for balls that run long.");
  if (outcomes.wide) suggestions.push("Reduce direction magnitude and recheck robot alignment.");
  if (landed.length && meanErrorCm > 20) suggestions.push("Run a new Standard calibration before relying on placement previews.");
  if (!suggestions.length) suggestions.push("Placement is consistent with the saved profile.");
  return Object.freeze({ checkedAt: new Date().toISOString(), meanErrorCm, landedCount: landed.length, outcomes: Object.freeze(outcomes), suggestions: Object.freeze(suggestions) });
}
