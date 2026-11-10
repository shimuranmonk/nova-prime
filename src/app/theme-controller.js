export const THEMES = Object.freeze(["auto", "light", "dark", "court"]);
export const THEME_STORAGE_KEY = "nova-prime-theme";

export class ThemeController {
  constructor({ documentObject = globalThis.document, storage = globalThis.localStorage, matchMedia = globalThis.matchMedia?.bind(globalThis) } = {}) {
    this.document = documentObject;
    this.storage = storage;
    this.media = matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    this.value = "auto";
    this.media?.addEventListener?.("change", () => { if (this.value === "auto") this.#apply(); });
  }

  load() {
    try { this.value = this.#valid(this.storage?.getItem?.(THEME_STORAGE_KEY)) ? this.storage.getItem(THEME_STORAGE_KEY) : "auto"; }
    catch { this.value = "auto"; }
    this.#apply();
    return this.value;
  }

  set(value) {
    if (!this.#valid(value)) throw new Error("Unsupported Nova Prime theme");
    this.value = value;
    try { this.storage?.setItem?.(THEME_STORAGE_KEY, value); } catch { /* Theme still applies for this visit. */ }
    this.#apply();
    return value;
  }

  #valid(value) { return THEMES.includes(value); }

  #apply() {
    this.document?.documentElement?.setAttribute("data-theme", this.value);
    const resolved = this.value === "auto" ? (this.media?.matches ? "dark" : "light") : this.value;
    const colors = { light: "#eef3f6", dark: "#101b22", court: "#dfe9d9" };
    this.document?.querySelector?.('meta[name="theme-color"]')?.setAttribute("content", colors[resolved]);
  }
}
