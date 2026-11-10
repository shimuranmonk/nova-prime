const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidCustomDrillId(value) {
  return typeof value === "string" && (UUID_PATTERN.test(value) || /^drill_[a-z0-9_-]{5,}$/i.test(value));
}

export function findCustomDrillById(collections, id) {
  const normalized = String(id ?? "").toLowerCase();
  for (const entries of Object.values(collections ?? {})) {
    if (!Array.isArray(entries)) continue;
    const found = entries.find((drill) => String(drill.id).toLowerCase() === normalized);
    if (found) return found;
  }
  return null;
}
