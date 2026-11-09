export function createId(prefix = "nu", cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === "function") {
    return `${prefix}_${cryptoObject.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function isId(value, prefix) {
  return typeof value === "string" && value.startsWith(`${prefix}_`) && value.length > prefix.length + 4;
}
