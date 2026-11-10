import { createId } from "../../domain/shared/id.js";
import { DRILL_SCHEMA_VERSION } from "../../domain/drills/schema.js";
import { validateDrill } from "../../domain/drills/validation.js";

export const CUSTOM_GROUPS = Object.freeze(["A", "B", "C"]);
export const MAX_CUSTOM_DRILLS_PER_GROUP = 100;
export const CUSTOM_DRILL_FORMAT = "nova-prime-drills";
export const CUSTOM_DRILL_FORMAT_VERSION = 1;
export const LEGACY_CUSTOM_DRILL_FORMATS = Object.freeze(["nova-ultimate-drills"]);

const clone = (value) => structuredClone(value);

function assertGroup(group) {
  if (!CUSTOM_GROUPS.includes(group)) throw new Error("Custom drill group must be A, B, or C");
}

export function sanitizeDrillName(value) {
  return String(value || "New drill")
    .replace(/[;\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40) || "New drill";
}

function defaultPrograms(idFactory) {
  return {
    1: {
      steps: [{
        id: idFactory("step"),
        enabled: true,
        scatter: 0,
        variants: [{ speed: 5, spin: 3, type: "top", height: 40, drop: 0, bpm: 45, repetitions: 1 }],
      }],
      metadata: {},
    },
    2: null,
    3: null,
  };
}

function regenerateStepIds(programs, idFactory) {
  const copy = clone(programs);
  for (const level of [1, 2, 3]) {
    if (!copy[level]) continue;
    copy[level].steps = copy[level].steps.map((step) => ({ ...step, id: idFactory("step") }));
  }
  return copy;
}

export class CustomDrillService {
  constructor(store, { idFactory = (prefix) => createId(prefix), now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.idFactory = idFactory;
    this.now = now;
  }

  async list(group = null) {
    if (group != null) assertGroup(group);
    const records = (await this.store.getAll("drills")).filter((drill) => CUSTOM_GROUPS.includes(drill.group) && ["custom", "imported"].includes(drill.source));
    return records
      .filter((drill) => group == null || drill.group === group)
      .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async get(id) {
    const drill = await this.store.get("drills", id);
    return drill && CUSTOM_GROUPS.includes(drill.group) ? drill : null;
  }

  async create({ name = "New drill", group = "A", robotPosition = "middle" } = {}) {
    assertGroup(group);
    const groupDrills = await this.list(group);
    if (groupDrills.length >= MAX_CUSTOM_DRILLS_PER_GROUP) throw new Error(`Group ${group} already contains ${MAX_CUSTOM_DRILLS_PER_GROUP} drills`);
    const timestamp = this.now();
    const drill = {
      schemaVersion: DRILL_SCHEMA_VERSION,
      id: this.idFactory("drill"),
      source: "custom",
      builtinKey: null,
      name: this.#uniqueName(groupDrills, name),
      group,
      robotPosition,
      random: false,
      programs: defaultPrograms(this.idFactory),
      sortOrder: groupDrills.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.#put(drill);
    return drill;
  }

  async update(id, changes = {}) {
    const drill = await this.get(id);
    if (!drill) throw new Error("Custom drill was not found");
    const targetGroup = changes.group ?? drill.group;
    assertGroup(targetGroup);
    const targetDrills = (await this.list(targetGroup)).filter((entry) => entry.id !== id);
    if (targetGroup !== drill.group && targetDrills.length >= MAX_CUSTOM_DRILLS_PER_GROUP) throw new Error(`Group ${targetGroup} already contains ${MAX_CUSTOM_DRILLS_PER_GROUP} drills`);
    const updated = {
      ...drill,
      name: this.#uniqueName(targetDrills, changes.name ?? drill.name),
      group: targetGroup,
      robotPosition: changes.robotPosition ?? drill.robotPosition,
      sortOrder: targetGroup === drill.group ? drill.sortOrder : targetDrills.length,
      updatedAt: this.now(),
    };
    await this.#put(updated);
    if (targetGroup !== drill.group) await this.#compactGroup(drill.group);
    return updated;
  }

  async saveEditor(id, { programs, random }) {
    const drill = await this.get(id);
    if (!drill) throw new Error("Custom drill was not found");
    const updated = {
      ...drill,
      programs: clone(programs),
      random: Boolean(random),
      updatedAt: this.now(),
    };
    await this.#put(updated);
    return updated;
  }

  async duplicate(id, targetGroup = null) {
    const source = await this.get(id);
    if (!source) throw new Error("Custom drill was not found");
    const group = targetGroup ?? source.group;
    assertGroup(group);
    const groupDrills = await this.list(group);
    if (groupDrills.length >= MAX_CUSTOM_DRILLS_PER_GROUP) throw new Error(`Group ${group} already contains ${MAX_CUSTOM_DRILLS_PER_GROUP} drills`);
    const timestamp = this.now();
    const copy = {
      ...clone(source),
      id: this.idFactory("drill"),
      source: "custom",
      name: this.#uniqueName(groupDrills, `${source.name} copy`),
      group,
      programs: regenerateStepIds(source.programs, this.idFactory),
      sortOrder: groupDrills.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.#put(copy);
    return copy;
  }

  async delete(id) {
    const drill = await this.get(id);
    if (!drill) return false;
    await this.store.delete("drills", id);
    await this.#compactGroup(drill.group);
    return true;
  }

  async move(id, direction) {
    if (![1, -1].includes(direction)) throw new Error("Move direction must be -1 or 1");
    const drill = await this.get(id);
    if (!drill) throw new Error("Custom drill was not found");
    const all = await this.list();
    const group = all.filter((entry) => entry.group === drill.group);
    const index = group.findIndex((entry) => entry.id === id);
    const target = index + direction;
    if (target < 0 || target >= group.length) return false;
    [group[index], group[target]] = [group[target], group[index]];
    const reordered = new Map(group.map((entry, order) => [entry.id, { ...entry, sortOrder: order, updatedAt: this.now() }]));
    await this.store.replaceAll({ drills: all.map((entry) => reordered.get(entry.id) ?? entry) });
    return true;
  }

  async export(ids = null) {
    const records = await this.list();
    const selected = ids == null ? records : records.filter((record) => ids.includes(record.id));
    return {
      format: CUSTOM_DRILL_FORMAT,
      version: CUSTOM_DRILL_FORMAT_VERSION,
      createdAt: this.now(),
      drills: clone(selected),
    };
  }

  async import(payload) {
    if (!payload || ![CUSTOM_DRILL_FORMAT, ...LEGACY_CUSTOM_DRILL_FORMATS].includes(payload.format) || payload.version !== CUSTOM_DRILL_FORMAT_VERSION || !Array.isArray(payload.drills)) {
      throw new Error("Unsupported Nova Prime drill file");
    }
    const existing = await this.list();
    const working = clone(existing);
    const ids = new Set(working.map((drill) => drill.id));
    const added = [];
    for (const raw of payload.drills) {
      const candidate = clone(raw);
      if (!CUSTOM_GROUPS.includes(candidate.group)) throw new Error("Imported drill has an invalid group");
      if (!["custom", "imported"].includes(candidate.source)) throw new Error("Imported file contains a non-custom drill");
      const groupDrills = working.filter((drill) => drill.group === candidate.group);
      if (groupDrills.length >= MAX_CUSTOM_DRILLS_PER_GROUP) throw new Error(`Group ${candidate.group} already contains ${MAX_CUSTOM_DRILLS_PER_GROUP} drills`);
      if (ids.has(candidate.id) || typeof candidate.id !== "string" || !candidate.id) candidate.id = this.idFactory("drill");
      candidate.source = "imported";
      candidate.name = this.#uniqueName(groupDrills, candidate.name);
      candidate.sortOrder = groupDrills.length;
      candidate.createdAt = candidate.createdAt || this.now();
      candidate.updatedAt = this.now();
      const validation = validateDrill(candidate);
      if (!validation.valid) throw new Error(`Invalid imported drill ${candidate.name}: ${validation.issues[0]?.message ?? "validation failed"}`);
      ids.add(candidate.id);
      working.push(candidate);
      added.push(candidate);
    }
    await this.store.replaceAll({ drills: working });
    return { added: added.length, drills: added };
  }

  #uniqueName(records, value) {
    const base = sanitizeDrillName(value);
    const taken = new Set(records.map((drill) => drill.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base.slice(0, Math.max(1, 40 - String(suffix).length - 1))} ${suffix}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  async #put(drill) {
    const validation = validateDrill(drill);
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "Custom drill validation failed");
    await this.store.put("drills", drill);
  }

  async #compactGroup(group) {
    const all = await this.list();
    let order = 0;
    const compacted = all.map((drill) => drill.group === group ? { ...drill, sortOrder: order++ } : drill);
    await this.store.replaceAll({ drills: compacted });
  }
}
