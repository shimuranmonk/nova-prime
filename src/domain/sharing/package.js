import { validateDrill } from "../drills/validation.js";

export const SHARE_FORMAT = "nova-prime-share";
export const SHARE_VERSION = 1;
export const SHARE_TYPE = "drill-pack";
export const MAX_SHARE_DRILLS = 100;
export const MAX_SHARE_BYTES = 1024 * 1024;

const clone = (value) => structuredClone(value);

function cleanText(value, limit) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function sharePackageBytes(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

export function validateSharePackage(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Share package must be a JSON object");
  if (payload.format !== SHARE_FORMAT || payload.version !== SHARE_VERSION || payload.type !== SHARE_TYPE) throw new Error("Unsupported Nova Prime share package");
  if (typeof payload.createdAt !== "string" || !Number.isFinite(new Date(payload.createdAt).getTime())) throw new Error("Share package date is invalid");
  if (typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 80) throw new Error("Share package title is invalid");
  if (typeof payload.note !== "string" || payload.note.length > 280) throw new Error("Share package note is invalid");
  if (!Array.isArray(payload.drills) || payload.drills.length < 1 || payload.drills.length > MAX_SHARE_DRILLS) throw new Error(`Share package must contain 1 to ${MAX_SHARE_DRILLS} drills`);
  const identities = new Set();
  payload.drills.forEach((drill, index) => {
    if (!drill || !["custom", "imported"].includes(drill.source)) throw new Error(`Shared drill ${index + 1} is not a custom drill`);
    if (identities.has(drill.id)) throw new Error("Share package contains duplicate drill identities");
    identities.add(drill.id);
    const validation = validateDrill(drill);
    if (!validation.valid) throw new Error(`Shared drill ${index + 1} is invalid: ${validation.issues[0]?.message ?? "validation failed"}`);
  });
  if (sharePackageBytes(payload) > MAX_SHARE_BYTES) throw new Error("Share package exceeds the 1 MB safety limit");
  return clone(payload);
}

export function createSharePackage({ drills, title = "Nova Prime drill pack", note = "", createdAt = new Date().toISOString() }) {
  const payload = {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    type: SHARE_TYPE,
    createdAt,
    title: cleanText(title, 80) || "Nova Prime drill pack",
    note: cleanText(note, 280),
    drills: clone(drills ?? []),
  };
  return Object.freeze(validateSharePackage(payload));
}

export function summarizeSharePackage(payload) {
  const valid = validateSharePackage(payload);
  const groups = { A: 0, B: 0, C: 0 };
  let programs = 0;
  let steps = 0;
  valid.drills.forEach((drill) => {
    groups[drill.group] += 1;
    for (const level of [1, 2, 3]) {
      if (!drill.programs[level]) continue;
      programs += 1;
      steps += drill.programs[level].steps.length;
    }
  });
  return Object.freeze({
    title: valid.title,
    note: valid.note,
    createdAt: valid.createdAt,
    drills: valid.drills.length,
    groups: Object.freeze(groups),
    programs,
    steps,
    bytes: sharePackageBytes(valid),
    names: Object.freeze(valid.drills.map((drill) => drill.name)),
  });
}
