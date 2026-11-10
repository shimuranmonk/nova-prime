import { BUILTIN_DRILLS } from "../../domain/drills/builtin-catalog.js";

function programData(program) {
  return (program?.steps ?? []).filter((step) => step.enabled).map((step) =>
    step.variants.map((ball) => [ball.speed, ball.spin, ball.height, ball.drop, ball.bpm, ball.repetitions, 1]));
}

export function createMsyncValidationContext(track, customDrills = []) {
  const builtInDrills = Object.fromEntries(BUILTIN_DRILLS.map((drill) => [drill.builtinKey, {
    1: programData(drill.programs[1]),
    2: programData(drill.programs[2]),
    3: programData(drill.programs[3]),
    random: drill.random,
  }]));
  const customDrillsByGroup = { "custom-a": [], "custom-b": [], "custom-c": [] };
  const drillData = {};
  for (const drill of customDrills) {
    const key = drill.id;
    customDrillsByGroup[`custom-${String(drill.group).toLowerCase()}`]?.push({ id: drill.id, key });
    drillData[key] = {
      1: programData(drill.programs[1]),
      2: programData(drill.programs[2]),
      3: programData(drill.programs[3]),
      random: drill.random,
    };
  }
  return Object.freeze({
    track: track ? {
      filename: track.sourceFilename ?? track.displayName,
      duration: track.durationMs / 1000,
      metadata: { sha256: track.sha256 },
    } : null,
    builtInDrills,
    customDrills: customDrillsByGroup,
    drillData,
    requireDrillResolution: true,
  });
}
