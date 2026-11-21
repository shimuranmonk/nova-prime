export function makeInlineAlias(name) {
  let stem = String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!stem) stem = "DRILL";
  if (/^\d/.test(stem)) stem = `DRILL_${stem}`;
  return `INL_${stem.slice(0, 32)}`;
}
export function createMsyncInlineBlock(drill, level = 1) {
  const name = String(drill.name || "Drill").replace(/[\r\n;]+/g, " ").trim().slice(0, 100);
  const lines = [`[INLINE:${makeInlineAlias(name)}]`, `NAME=${name || "Drill"}`, `RANDOM=${Boolean(drill.random)}`];
  let number = 0;
  for (const step of drill.programs?.[level]?.steps ?? []) {
    if (!step.enabled || !step.variants?.length) continue;
    number++;
    for (const ball of step.variants) {
      let line = `BALL=${number};SPEED=${ball.speed};SPIN=${ball.spin};TYPE=${ball.type};HEIGHT=${ball.height};DROP=${ball.drop};BPM=${ball.bpm};REPS=${ball.repetitions}`;
      if (step.scatter > 0) line += `;SCATTER=${step.scatter}`;
      lines.push(line);
    }
  }
  if (!number) throw new Error("This level has no active balls to export");
  return lines.join("\n");
}
export function createMsyncReference(drill) {
  if (!drill?.id || !["custom", "imported"].includes(drill.source)) throw new Error("Save a custom drill before copying its reference");
  return `CUSTOM:${drill.id}`;
}
