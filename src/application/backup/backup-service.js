import { STORE_NAMES } from "../../infrastructure/storage/indexed-db-store.js";
import { validateCalibrationProfile } from "../../domain/calibration/schema.js";
import { validateDrill } from "../../domain/drills/validation.js";
import { validateMsyncAttachment } from "../../domain/msync/schema.js";
import { validatePlaylist, validateTrack } from "../../domain/music/schema.js";
import { validateSessionRecord } from "../../domain/statistics/schema.js";

export const BACKUP_FORMAT = "nova-prime-backup";
export const LEGACY_BACKUP_FORMATS = Object.freeze(["nova-ultimate-backup"]);
export const BACKUP_VERSION = 1;
export const BACKUP_STORES = Object.freeze(STORE_NAMES.filter((name) => name !== "backups"));

const RECORD_VALIDATORS = Object.freeze({
  drills: validateDrill,
  calibrations: validateCalibrationProfile,
  tracks: validateTrack,
  playlists: validatePlaylist,
  msyncAttachments: validateMsyncAttachment,
  sessionRecords: validateSessionRecord,
});

function assertRecord(record, storeName) {
  if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.id !== "string" || !record.id) {
    throw new Error(`Invalid record in ${storeName}`);
  }
  const validation = RECORD_VALIDATORS[storeName]?.(record);
  if (validation && !validation.valid) throw new Error(`Invalid ${storeName} record ${record.id}: ${validation.issues[0]?.message ?? "schema validation failed"}`);
}

export async function createBackup(store, { now = () => new Date().toISOString() } = {}) {
  const collections = {};
  for (const name of BACKUP_STORES) collections[name] = await store.getAll(name);
  return Object.freeze({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now(),
    collections,
  });
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== "object") throw new Error("Backup must be a JSON object");
  if (![BACKUP_FORMAT, ...LEGACY_BACKUP_FORMATS].includes(backup.format) || backup.version !== BACKUP_VERSION) throw new Error("Unsupported Nova Prime backup format");
  if (!backup.collections || typeof backup.collections !== "object" || Array.isArray(backup.collections)) throw new Error("Backup collections are missing");

  for (const name of Object.keys(backup.collections)) {
    if (!BACKUP_STORES.includes(name)) throw new Error(`Backup contains an unknown collection: ${name}`);
  }

  const normalized = {};
  for (const name of BACKUP_STORES) {
    if (!Object.hasOwn(backup.collections, name)) throw new Error(`Backup collection ${name} is missing`);
    const values = backup.collections[name];
    if (!Array.isArray(values)) throw new Error(`Backup collection ${name} must be an array`);
    values.forEach((value) => assertRecord(value, name));
    const ids = new Set(values.map((value) => value.id));
    if (ids.size !== values.length) throw new Error(`Backup collection ${name} contains duplicate ids`);
    normalized[name] = values.map((value) => structuredClone(value));
  }
  return normalized;
}

export async function restoreBackup(store, backup) {
  const collections = validateBackup(backup);
  await store.replaceAll(collections);
  const counts = Object.fromEntries(Object.entries(collections).map(([name, values]) => [name, values.length]));
  return Object.freeze({ restored: Object.values(counts).reduce((total, count) => total + count, 0), counts });
}
