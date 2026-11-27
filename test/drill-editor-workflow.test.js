import assert from "node:assert/strict";
import test from "node:test";
import { createDrillEditor, inheritedStep } from "../src/app/drill-editor.js";

test("Add Step inherits the preceding single ball and scatter", () => {
  const step = inheritedStep({
    enabled: false,
    scatter: 2.5,
    variants: [{ speed: 7, spin: 2, type: "back", height: 65, drop: -4, bpm: 72, repetitions: 3 }],
  });
  assert.equal(step.enabled, true);
  assert.equal(step.scatter, 2.5);
  assert.deepEqual(step.variants[0], { speed: 7, spin: 2, type: "back", height: 65, drop: -4, bpm: 72, repetitions: 3 });
});

test("Add Step converts an inherited Serve to a normal ball and avoids ambiguous scatter", () => {
  const serve = { speed: 2, spin: 5, type: "back", height: -30, drop: 3, bpm: 45, repetitions: 1 };
  const step = inheritedStep({ scatter: 4, variants: [serve, { ...serve, drop: -3 }] });
  assert.equal(step.variants[0].height, 40);
  assert.equal(step.variants[0].drop, 3);
  assert.equal(step.scatter, 0);
});

test("placement and parameter controls edit and save the same variant", async () => {
  const first = inheritedStep();
  const second = inheritedStep(first);
  second.variants.push({ ...second.variants[0], bpm: 75 });
  const drill = {
    id: "editor-test", name: "Editor test", group: "custom", robotPosition: "middle",
    programs: { 1: { steps: [first, second] } },
  };
  const controls = new Map();
  const root = {
    innerHTML: "",
    querySelector: (selector) => controls.get(selector)?.[0] ?? null,
    querySelectorAll: (selector) => controls.get(selector) ?? [],
  };
  function control(selector, props = {}) {
    const listeners = new Map();
    const item = {
      ...props,
      addEventListener: (type, callback) => listeners.set(type, callback),
      fire: (type, event = {}) => listeners.get(type)?.({ preventDefault() {}, ...event }),
    };
    controls.set(selector, [item]);
    return item;
  }
  const marker = control("[data-preview-step]", {
    dataset: { previewStep: second.id, previewVariant: "1" }, style: {},
  });
  const firstSelector = control("[data-first-ball]", {
    dataset: { previewStep: first.id, previewVariant: "0" },
  });
  controls.get("[data-preview-step]").push(firstSelector);
  const table = control("[data-placement-table]", {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const bpm = control("[data-ball-field]", { dataset: { ballField: "bpm" }, value: "80" });
  const save = control("[data-editor-save]");
  let saved;
  const editor = createDrillEditor({
    dialog: { addEventListener() {}, showModal() {}, close() {} },
    root,
    service: {
      get: async () => drill,
      saveEditor: async (_, draft) => { saved = draft; return draft; },
    },
  });

  await editor.open(drill.id);
  assert.match(root.innerHTML, /Ball 2a/);
  assert.match(root.innerHTML, /Ball 2b/);
  table.fire("pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 75, target: { closest: () => marker } });
  table.fire("pointermove", { pointerId: 1, clientX: 25, clientY: 80 });
  table.fire("pointerup", { pointerId: 1, clientX: 25, clientY: 80 });
  assert.match(root.innerHTML, /aria-selected="true">Ball 2b/);
  firstSelector.fire("click");
  assert.match(root.innerHTML, /style="left:25%;top:80%"[^>]*aria-pressed="false" aria-label="Ball 2b/);
  marker.fire("click");
  bpm.fire("change");
  await save.fire("click");
  const edited = saved.programs[1].steps;
  assert.deepEqual(edited[0], first);
  assert.deepEqual(edited[1].variants[0], second.variants[0]);
  assert.equal(edited[1].variants[1].bpm, 80);
  assert.notEqual(edited[1].variants[1].drop, second.variants[1].drop);
});
