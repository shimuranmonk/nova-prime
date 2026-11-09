import { STORE_NAMES } from "./indexed-db-store.js";

export class MemoryStore {
  constructor(seed = {}) {
    this.kind = "memory";
    this.data = new Map(STORE_NAMES.map((name) => [name, new Map()]));
    for (const [name, values] of Object.entries(seed)) {
      if (!this.data.has(name)) throw new Error(`Unknown store: ${name}`);
      for (const value of values) this.data.get(name).set(value.id, structuredClone(value));
    }
  }

  #collection(name) {
    const collection = this.data.get(name);
    if (!collection) throw new Error(`Unknown store: ${name}`);
    return collection;
  }

  async get(name, id) {
    const value = this.#collection(name).get(id);
    return value === undefined ? undefined : structuredClone(value);
  }

  async getAll(name) {
    return [...this.#collection(name).values()].map((value) => structuredClone(value));
  }

  async put(name, value) {
    if (!value?.id) throw new Error("Stored records require an id");
    this.#collection(name).set(value.id, structuredClone(value));
    return value;
  }

  async delete(name, id) {
    this.#collection(name).delete(id);
  }

  async replaceAll(collections) {
    const replacement = new Map([...this.data].map(([name, values]) => [name, new Map(values)]));
    for (const [name, values] of Object.entries(collections)) {
      if (!replacement.has(name)) throw new Error(`Unknown store: ${name}`);
      replacement.set(name, new Map(values.map((value) => [value.id, structuredClone(value)])));
    }
    this.data = replacement;
  }
}

