import { DRILL_SCHEMA_VERSION } from "../../domain/drills/schema.js";
import { validateDrill } from "../../domain/drills/validation.js";

export const NOVA_PLUS_CSV_MIGRATION = "nova-plus-csv-v1";
export const MAX_MIGRATION_BYTES = 1024 * 1024;
const GROUPS = Object.freeze(["A", "B", "C"]);
const BUILTIN_SETS = Object.freeze(["BASIC", "COMBINED", "COMPLEX"]);
const HEADER = Object.freeze(["set", "ball", "name", "speed", "spin", "type", "height", "drop", "bpm", "reps"]);

const clone = (value) => structuredClone(value);
const sanitizeName = (value) => String(value ?? "Imported drill").replace(/[;\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "Imported drill";

async function sha256Hex(text, cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.subtle?.digest) throw new Error("SHA-256 is unavailable in this browser");
  const digest = await cryptoObject.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseNumber(value, label, { minimum, maximum, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < minimum || number > maximum) {
    throw new Error(`${label} must be ${integer ? "an integer " : ""}between ${minimum} and ${maximum}`);
  }
  return number;
}

function uniqueName(records, value) {
  const base = sanitizeName(value);
  const used = new Set(records.map((record) => record.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, Math.max(1, 40 - String(suffix).length - 1))} ${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

const parseEnabled = (value) => value == null || String(value).trim() === "" || !/^(0|false|no|off)$/i.test(String(value).trim());
const parseOptionalNumber = (value, fallback, label, limits) => value == null || String(value).trim() === "" ? fallback : parseNumber(value, label, limits);

function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("Migration file is empty");
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(delimiter).map((item) => item.trim().toLowerCase());
  if (!HEADER.every((name, index) => header[index] === name)) throw new Error("Nova Plus CSV header is not recognized");
  const grouped = new Map();
  const warnings = [];
  const errors = [];
  let excludedRows = 0;
  lines.slice(1).forEach((line, index) => {
    const lineNumber = index + 2;
    const parts = line.split(delimiter);
    if (parts.length < HEADER.length) { errors.push({ line: lineNumber, message: "Row has fewer than 10 columns" }); return; }
    const group = parts[0].trim().toUpperCase();
    if (BUILTIN_SETS.includes(group)) { excludedRows += 1; return; }
    if (!GROUPS.includes(group)) { errors.push({ line: lineNumber, message: `Set must be Basic, Combined, Complex, A, B, or C (received ${group || "blank"})` }); return; }
    try {
      const ballNumber = parseNumber(parts[1], "Ball", { minimum: 1, maximum: 20 });
      const name = sanitizeName(parts[2]);
      const ball = {
        speed: parseNumber(parts[3], "Speed", { minimum: 0, maximum: 10 }),
        spin: parseNumber(parts[4], "Spin", { minimum: 0, maximum: 10 }),
        type: parts[5].trim().toLowerCase(),
        height: parseNumber(parts[6], "Height", { minimum: -50, maximum: 100, integer: true }),
        drop: parseNumber(parts[7], "Drop", { minimum: -10, maximum: 10 }),
        bpm: parseNumber(parts[8], "BPM", { minimum: 30, maximum: 90, integer: true }),
        repetitions: parseNumber(parts[9], "Reps", { minimum: 1, maximum: 100, integer: true }),
      };
      if (!["top", "back"].includes(ball.type)) throw new Error("Type must be top or back");
      const key = `${group}\u0000${name.toLowerCase()}`;
      if (!grouped.has(key)) grouped.set(key, {
        group,
        name,
        steps: new Map(),
        random: /^(1|true|yes|on)$/i.test(String(parts[12] ?? "").trim()),
        robotPosition: ["left", "middle", "right"].includes(String(parts[13] ?? "").trim().toLowerCase()) ? String(parts[13]).trim().toLowerCase() : "middle",
      });
      const drill = grouped.get(key);
      if (!drill.steps.has(ballNumber)) drill.steps.set(ballNumber, []);
      drill.steps.get(ballNumber).push({
        ball,
        scatter: parseOptionalNumber(parts[10], 0, "Scatter", { minimum: 0, maximum: 10 }),
        enabled: parseEnabled(parts[11]),
      });
    } catch (error) { errors.push({ line: lineNumber, message: error.message }); }
  });
  if (excludedRows) warnings.push(`${excludedRows} built-in row${excludedRows === 1 ? " was" : "s were"} excluded; Nova Prime already supplies its verified built-in catalogue.`);
  if (!grouped.size && !errors.length) errors.push({ line: null, message: "No custom Group A, B, or C drills were found" });
  return { grouped: [...grouped.values()], warnings, errors, rows: lines.length - 1, excludedRows };
}

function canonicalCandidates(grouped, fingerprint, timestamp) {
  return grouped.map((legacy, drillIndex) => {
    const baseId = `migration:nova-plus:${fingerprint.slice(0, 16)}:${legacy.group}:${drillIndex + 1}`;
    const steps = [...legacy.steps.entries()].sort(([left], [right]) => left - right).map(([, records], stepIndex) => ({
      id: `${baseId}:step:${stepIndex + 1}`,
      enabled: records[0].enabled,
      scatter: records[0].scatter,
      variants: records.map((record) => record.ball),
    }));
    const program = { steps, metadata: { migratedFrom: NOVA_PLUS_CSV_MIGRATION } };
    return {
      schemaVersion: DRILL_SCHEMA_VERSION,
      id: baseId,
      source: "imported",
      builtinKey: null,
      name: legacy.name,
      group: legacy.group,
      robotPosition: legacy.robotPosition,
      random: legacy.random,
      programs: { 1: clone(program), 2: clone(program), 3: clone(program) },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

export class NovaPlusCsvMigrationService {
  constructor(store, { cryptoObject = globalThis.crypto, now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.cryptoObject = cryptoObject;
    this.now = now;
  }

  async preview(input) {
    const text = typeof input === "string" ? input : await input.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > MAX_MIGRATION_BYTES) throw new Error("Migration file exceeds the 1 MB limit");
    const fingerprint = await sha256Hex(text, this.cryptoObject);
    const receiptId = `migration:${NOVA_PLUS_CSV_MIGRATION}:${fingerprint}`;
    const prior = await this.store.get("migrationReceipts", receiptId);
    const parsed = parseCsv(text);
    const timestamp = this.now();
    const candidates = canonicalCandidates(parsed.grouped, fingerprint, timestamp);
    const validationErrors = [];
    for (const candidate of candidates) {
      const validation = validateDrill(candidate);
      if (!validation.valid) validationErrors.push({ line: null, message: `${candidate.name}: ${validation.issues[0]?.message ?? "validation failed"}` });
    }
    const errors = [...parsed.errors, ...validationErrors];
    return Object.freeze({
      source: NOVA_PLUS_CSV_MIGRATION,
      fingerprint,
      receiptId,
      bytes,
      rows: parsed.rows,
      excludedRows: parsed.excludedRows,
      drills: candidates.length,
      groups: Object.freeze(Object.fromEntries(GROUPS.map((group) => [group, candidates.filter((drill) => drill.group === group).length]))),
      names: Object.freeze(candidates.map((drill) => drill.name)),
      warnings: Object.freeze(parsed.warnings),
      errors: Object.freeze(errors),
      alreadyMigrated: Boolean(prior),
      canCommit: errors.length === 0 && !prior && candidates.length > 0,
      candidates: Object.freeze(candidates),
    });
  }

  async commit(preview) {
    if (!preview?.canCommit || preview.source !== NOVA_PLUS_CSV_MIGRATION) throw new Error("Migration preview is not ready to commit");
    if (await this.store.get("migrationReceipts", preview.receiptId)) throw new Error("This migration file was already committed");
    const [storedDrills, receipts] = await Promise.all([this.store.getAll("drills"), this.store.getAll("migrationReceipts")]);
    const working = clone(storedDrills);
    const imported = [];
    for (const raw of preview.candidates) {
      const groupRecords = working.filter((drill) => drill.group === raw.group && ["custom", "imported"].includes(drill.source));
      if (groupRecords.length >= 100) throw new Error(`Group ${raw.group} would exceed its 100-drill limit`);
      const candidate = { ...clone(raw), name: uniqueName(groupRecords, raw.name), sortOrder: groupRecords.length, updatedAt: this.now() };
      if (working.some((drill) => drill.id === candidate.id)) throw new Error("Migration identity already exists without a receipt");
      const validation = validateDrill(candidate);
      if (!validation.valid) throw new Error(`Migration validation failed: ${validation.issues[0]?.message ?? candidate.name}`);
      working.push(candidate);
      imported.push(candidate);
    }
    const receipt = {
      id: preview.receiptId,
      source: preview.source,
      fingerprint: preview.fingerprint,
      status: "completed",
      completedAt: this.now(),
      counts: { imported: imported.length, excludedRows: preview.excludedRows, rows: preview.rows },
    };
    await this.store.replaceAll({ drills: working, migrationReceipts: [...receipts, receipt] });
    return Object.freeze({ imported: imported.length, drills: Object.freeze(imported), receipt: Object.freeze(receipt) });
  }
}
