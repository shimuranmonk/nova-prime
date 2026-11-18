import assert from "node:assert/strict";
import test from "node:test";
import { ThemeController } from "../src/app/theme-controller.js";

function harness(saved = null, dark = false) {
  const attributes = new Map();
  const storage = { value: saved, getItem: () => storage.value, setItem: (_key, value) => { storage.value = value; } };
  const root = { setAttribute: (name, value) => attributes.set(`root:${name}`, value) };
  const meta = { setAttribute: (name, value) => attributes.set(`meta:${name}`, value) };
  const controller = new ThemeController({ documentObject: { documentElement: root, querySelector: () => meta }, storage, matchMedia: () => ({ matches: dark, addEventListener() {} }) });
  return { controller, storage, attributes };
}

test("theme controller defaults safely to Nova Plus light appearance", () => {
  const { controller, attributes } = harness("unexpected", true);
  assert.equal(controller.load(), "light");
  assert.equal(attributes.get("root:data-theme"), "light");
  assert.equal(attributes.get("meta:content"), "#f4f5f8");
});

test("theme controller persists supported themes and rejects unknown values", () => {
  const { controller, storage, attributes } = harness("light");
  controller.load();
  assert.equal(controller.set("court"), "court");
  assert.equal(storage.value, "court");
  assert.equal(attributes.get("root:data-theme"), "court");
  assert.throws(() => controller.set("neon"), /Unsupported/);
});
