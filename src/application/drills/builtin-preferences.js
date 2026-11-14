const SETTINGS_ID = "builtin-playback";

function levelKey(level) {
  return String([1, 2, 3].includes(Number(level)) ? Number(level) : 1);
}

function hasMultipleActiveSteps(drill, level) {
  const program = drill?.programs?.[levelKey(level)] ?? drill?.programs?.[1];
  return (program?.steps ?? []).filter((step) => step.enabled).length > 1;
}

export function builtinRandomOrder(drill, level, preferences = {}) {
  if (!drill || drill.source !== "builtin" || !hasMultipleActiveSteps(drill, level)) return false;
  const saved = preferences?.[drill.id]?.[levelKey(level)];
  return typeof saved === "boolean" ? saved : Boolean(drill.random);
}

export class BuiltinPreferencesService {
  constructor(store) {
    this.store = store;
  }

  async load() {
    const record = await this.store.get("settings", SETTINGS_ID);
    return structuredClone(record?.randomByLevel ?? {});
  }

  async setRandom(drill, level, enabled) {
    if (!drill || drill.source !== "builtin") throw new Error("Built-in drill required");
    const preferences = await this.load();
    const drillPreferences = { ...(preferences[drill.id] ?? {}) };
    drillPreferences[levelKey(level)] = Boolean(enabled) && hasMultipleActiveSteps(drill, level);
    preferences[drill.id] = drillPreferences;
    await this.store.put("settings", { id: SETTINGS_ID, randomByLevel: preferences });
    return preferences;
  }

  async reset() {
    await this.store.delete("settings", SETTINGS_ID);
    return {};
  }
}
