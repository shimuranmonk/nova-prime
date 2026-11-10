import { calculateCalibration, summarizeQuickCheck } from "../../domain/calibration/calculation.js";
import { CALIBRATION_SCHEMA_VERSION, createCalibrationProfile, validateCalibrationProfile } from "../../domain/calibration/schema.js";
import { createId } from "../../domain/shared/id.js";

export const CALIBRATION_FORMAT = "nova-prime-calibrations";
export const CALIBRATION_FORMAT_VERSION = 1;
const clone = (value) => structuredClone(value);

export class CalibrationService {
  constructor(store, { idFactory = (prefix) => createId(prefix), now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.idFactory = idFactory;
    this.now = now;
  }

  async list() {
    return (await this.store.getAll("calibrations")).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async active() {
    return (await this.list()).find((profile) => profile.status === "complete") ?? null;
  }

  async save({ id = null, name, mode, tableSetup, observations }) {
    const derived = calculateCalibration(observations);
    const previous = id ? await this.store.get("calibrations", id) : null;
    const timestamp = this.now();
    const profile = createCalibrationProfile({
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      id: previous?.id ?? this.idFactory("calibration"),
      name: String(name || "Default calibration").trim().slice(0, 50) || "Default calibration",
      mode,
      status: "complete",
      tableSetup: { standardTable: true, robotPosition: tableSetup.robotPosition, headOffset: Number(tableSetup.headOffset) || 0, ballNotes: String(tableSetup.ballNotes || "").trim().slice(0, 160) },
      modelParameters: derived.modelParameters,
      observations: clone(observations),
      scatterEstimate: derived.scatterEstimate,
      accuracy: derived.accuracy,
      quickCheck: null,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    await this.#put(profile);
    return profile;
  }

  async saveQuickCheck(id, observations) {
    const profile = await this.store.get("calibrations", id);
    if (!profile) throw new Error("Calibration profile was not found");
    const updated = { ...profile, quickCheck: summarizeQuickCheck(observations), updatedAt: this.now() };
    await this.#put(updated);
    return updated;
  }

  async export() {
    return { format: CALIBRATION_FORMAT, version: CALIBRATION_FORMAT_VERSION, createdAt: this.now(), calibrations: clone(await this.list()) };
  }

  async import(payload) {
    if (!payload || payload.format !== CALIBRATION_FORMAT || payload.version !== CALIBRATION_FORMAT_VERSION || !Array.isArray(payload.calibrations)) throw new Error("Unsupported Nova Prime calibration file");
    const profiles = clone(payload.calibrations);
    const ids = new Set();
    for (const profile of profiles) {
      if (!profile.id || ids.has(profile.id)) profile.id = this.idFactory("calibration");
      ids.add(profile.id);
      const result = validateCalibrationProfile(profile);
      if (!result.valid) throw new Error(`Invalid calibration: ${result.issues[0]?.message ?? "validation failed"}`);
    }
    await this.store.replaceAll({ calibrations: profiles });
    return { imported: profiles.length, profiles };
  }

  async #put(profile) {
    const result = validateCalibrationProfile(profile);
    if (!result.valid) throw new Error(result.issues[0]?.message ?? "Calibration validation failed");
    await this.store.put("calibrations", profile);
  }
}
