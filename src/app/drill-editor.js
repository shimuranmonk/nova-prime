import { createMsyncInlineBlock, createMsyncReference } from "../domain/msync/inline-export.js";
import { createBall, createStep, DRILL_STEP_LIMIT, isServeBall, spinLimitForSpeed } from "../domain/drills/schema.js";
import { fitBallToTarget, previewCalibratedBall, previewPosition, TABLE_DIMENSIONS, tablePointFromPosition } from "../domain/drills/preview.js";
import { validateDrill } from "../domain/drills/validation.js";
import { createId } from "../domain/shared/id.js";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function mutableBall(ball = {}) {
  return { ...createBall(), ...clone(ball) };
}

function mutableStep(step = {}) {
  const base = createStep();
  return {
    id: step.id || base.id,
    enabled: step.enabled ?? true,
    scatter: Number(step.scatter ?? 0),
    variants: (step.variants?.length ? step.variants : base.variants).map(mutableBall),
  };
}

export function inheritedStep(previousStep) {
  const sourceBall = previousStep?.variants?.[0] ?? createBall();
  const ball = mutableBall(sourceBall);
  if (isServeBall(ball)) ball.height = createBall().height;
  return mutableStep({
    id: createId("step"),
    enabled: true,
    scatter: previousStep?.variants?.length === 1 ? Number(previousStep.scatter ?? 0) : 0,
    variants: [ball],
  });
}

function programCopy(program) {
  return {
    steps: program.steps.map((step) => ({ ...mutableStep(step), id: createId("step") })),
    metadata: clone(program.metadata ?? {}),
  };
}

function outcomeLabel(result) {
  if (result.ok) return result.secondBounce ? "Short · second bounce on table" : "In · single bounce";
  return ({ net: "Net", long: "Long", side: "Wide", short: "Short", noserve: "Not a serve · lower Height or Speed" })[result.outcome] ?? "Outside preview";
}

function rangeControl(label, field, value, minimum, maximum, step = 1, suffix = "") {
  return `
    <label class="editor-range">
      <span>${label}<output>${escapeHtml(value)}${suffix}</output></span>
      <input type="range" min="${minimum}" max="${maximum}" step="${step}" value="${escapeHtml(value)}" data-ball-field="${field}">
    </label>`;
}

const editorIcons = {
  ball: '<circle cx="8" cy="12" r="5"/><path d="M18 8v8m-4-4h8"/>',
  variant: '<circle cx="6" cy="12" r="3"/><circle cx="16" cy="5" r="2"/><path d="M9 10l5-4m-5 8 5 4m4-5v8m-4-4h8"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  cancel: '<path d="m6 6 12 12M18 6 6 18"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-7h10v7"/>',
  edit: '<path d="m14 5 5 5M4 20l4.5-1 11-11a2 2 0 0 0-4-4l-11 11L4 20Z"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7"/>',
  sequential: '<path d="M9 5h12M9 12h12M9 19h12M3 4h1v3m-2 4h3v2H2v2h3m-3 2h3v5H2m1-3h2"/>',
  random: '<path d="M3 6h3c4 0 7 12 11 12h4m-3-3 3 3-3 3M3 18h3c1.4 0 2.7-1.6 4-3.6m4-5.8C15 7 16 6 17 6h4m-3-3 3 3-3 3"/>',
  serve: '<path d="M3 20h18M12 15v5M4 7l4 6 5-8 7 8"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/>',
  previous: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
};

export function editorIcon(name) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${editorIcons[name]}</svg>`;
}

function rulerTicks(minimum, maximum, axis) {
  const ticks = [];
  for (let cm = Math.ceil(minimum / 10) * 10; cm <= maximum; cm += 10) {
    const major = cm % 30 === 0;
    const position = axis === "left"
      ? (cm / TABLE_DIMENSIONS.widthCm + .5) * 100
      : cm / TABLE_DIMENSIONS.lengthCm * 100;
    ticks.push(`<span class="ruler-tick${major ? " major" : ""}" style="${axis}:${position}%">${major ? `<small>${cm}</small>` : ""}</span>`);
  }
  return ticks.join("");
}

const horizontalTicks = rulerTicks(-TABLE_DIMENSIONS.widthCm / 2, TABLE_DIMENSIONS.widthCm / 2, "left");
const verticalTicks = rulerTicks(0, TABLE_DIMENSIONS.lengthCm / 2, "bottom");

function positionIcon(position) {
  const x = { left: 5, middle: 12, right: 19 }[position];
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 13.5h18"/><circle cx="${x}" cy="6" r="2.6" fill="currentColor"/></svg>`;
}

export function createDrillEditor({ dialog, root, service, getCalibration = async () => null, onSaved }) {
  let stored = null;
  let draft = null;
  let level = 1;
  let activeStepId = null;
  let activeVariant = 0;
  let dirty = false;
  let editorTab = "placement";
  let calibration = null;
  let requestedPositions = new WeakMap();
  let bulkEditing = false;
  let copyMessage = "";
  let copyFallback = "";
  const placementProfile = () => calibration?.physicsModel && draft.robotPosition !== "middle" ? null : calibration;
  const ballPreview = (ball) => previewCalibratedBall(ball, draft.robotPosition, calibration);

  const currentProgram = () => draft?.programs?.[level] ?? null;
  const currentStep = () => currentProgram()?.steps.find((step) => step.id === activeStepId) ?? currentProgram()?.steps[0] ?? null;

  function setActiveFromProgram() {
    const step = currentProgram()?.steps[0] ?? null;
    activeStepId = step?.id ?? null;
    activeVariant = 0;
  }

  function markDirty() {
    dirty = true;
  }

  function ballLabel(stepIndex, variantIndex, variantCount) {
    let suffix = "";
    if (variantCount > 1) {
      for (let n = variantIndex + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        suffix = String.fromCharCode(97 + (n - 1) % 26) + suffix;
      }
    }
    return `${stepIndex + 1}${suffix}`;
  }

  function renderBallSelector(program, step, variant) {
    return `<div class="placement-picker">
      <button type="button" class="editor-icon-action" data-picker-scroll="-1" aria-label="Scroll to earlier balls" title="Earlier balls">${editorIcon("previous")}</button>
      <div class="variant-tabs placement-ball-selector" role="group" aria-label="Select ball" data-placement-picker>${program.steps.flatMap((entry, stepIndex) =>
      entry.variants.map((_, index) => {
        const selected = entry.id === step.id && index === variant;
        return `<button type="button" data-preview-step="${escapeHtml(entry.id)}" data-preview-variant="${index}" class="${selected ? "selected" : ""}" aria-pressed="${selected}" aria-label="Ball ${ballLabel(stepIndex, index, entry.variants.length)}">${ballLabel(stepIndex, index, entry.variants.length)}</button>`;
      })).join("")}</div>
      <button type="button" class="editor-icon-action" data-picker-scroll="1" aria-label="Scroll to later balls" title="Later balls">${editorIcon("next")}</button>
    </div>`;
  }

  function renderTable(program, selectedStep, selectedVariant, valid) {
    const markers = [];
    let selectedPosition = { x: 50, y: 75 };
    let selectedServePosition = null;
    for (const [stepIndex, step] of program.steps.entries()) {
      for (const [variantIndex, ball] of step.variants.entries()) {
        const result = ballPreview(ball);
        const position = previewPosition(result);
        const selected = step.id === selectedStep?.id && variantIndex === selectedVariant;
        const markerPosition = requestedPositions.get(ball) ?? position;
        const label = ballLabel(stepIndex, variantIndex, step.variants.length);
        if (selected) {
          selectedPosition = markerPosition;
          selectedServePosition = isServeBall(ball) && result.serveBounce ? previewPosition({ ok: true, ...result.serveBounce }) : null;
        }
        markers.push(`<button type="button" class="preview-marker ${ball.type === "back" ? "back" : "top"} ${isServeBall(ball) ? "serve" : ""} ${step.enabled ? "" : "disabled"} ${selected ? "selected" : ""} ${result.ok ? "" : "warning"}" style="left:${markerPosition.x}%;top:${markerPosition.y}%" data-preview-step="${escapeHtml(step.id)}" data-preview-variant="${variantIndex}" aria-pressed="${selected}" aria-label="Ball ${label}: ${escapeHtml(outcomeLabel(result))}">${label}${isServeBall(ball) ? "S" : ""}</button>`);
      }
    }
    const canDelete = selectedStep.variants.length > 1 || canDeleteStep(program, selectedStep);
    const serve = isServeBall(selectedStep.variants[selectedVariant]);
    const requested = selectedPosition;
    const point = tablePointFromPosition(requested);
    const side = point.xCm < -1 ? "Backhand" : point.xCm > 1 ? "Forehand" : "Middle";
    const depth = point.yCm < 46 ? "Deep" : point.yCm > 91 ? "Short" : "Half-long";
    return `
      <section class="preview-panel" aria-labelledby="preview-title">
        <h3 class="eyebrow placement-heading" id="preview-title">${placementProfile() ? "Calibrated Placement" : "Estimated Placement"} – Aim on the table</h3>
        <div class="table-stage">
          <div class="placement-tools">
            <div class="placement-tool-group" role="group" aria-label="Ball actions">
              <button class="editor-icon-action" type="button" data-editor-add-step aria-label="Add ball" title="Add ball" ${program.steps.length >= DRILL_STEP_LIMIT ? "disabled" : ""}>${editorIcon("ball")}</button>
              <button class="editor-icon-action" type="button" data-variant-duplicate aria-label="Add variant" title="Add variant">${editorIcon("variant")}</button>
              <button class="editor-icon-action danger-button" type="button" data-placement-delete aria-label="Delete selected ball" title="Delete selected ball" ${canDelete ? "" : "disabled"}>${editorIcon("delete")}</button>
            </div>
            <div class="placement-tool-group robot-position-tools" role="group" aria-label="Robot position">
              ${["left", "middle", "right"].map((position) => `<button type="button" class="editor-icon-action" data-robot-position="${position}" aria-pressed="${draft.robotPosition === position}" aria-label="Robot position: ${position}" title="Robot position: ${position}">${positionIcon(position)}</button>`).join("")}
            </div>
          </div>
          <div class="table-ruler-y" aria-hidden="true">${verticalTicks}<strong class="placement-coordinate-value coordinate-y" style="top:${requested.y}%">${point.yCm.toFixed(0)}</strong></div>
          <div class="table-preview" data-placement-table role="group" aria-label="Interactive table. Drag a ball or tap the player half to choose a landing target.">
            <span class="table-landing-zone"><small>Tap or drag here</small></span><span class="table-net"></span><span class="table-label player">Player</span><span class="table-label robot">Robot</span>
            <svg class="placement-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line class="placement-direction" x1="50" y1="3" x2="${requested.x}" y2="${requested.y}" data-placement-line></line>
              <line class="placement-coordinate" x1="0" y1="${requested.y}" x2="${requested.x}" y2="${requested.y}"></line>
              <line class="placement-coordinate" x1="${requested.x}" y1="${requested.y}" x2="${requested.x}" y2="100"></line>
            </svg>
            <span class="placement-target ${requestedPositions.has(selectedStep.variants[selectedVariant]) ? "requested" : ""}" style="left:${requested.x}%;top:${requested.y}%" data-placement-target aria-hidden="true"></span>
            ${selectedServePosition ? `<span class="serve-bounce" style="left:${selectedServePosition.x}%;top:${selectedServePosition.y}%" aria-label="Estimated first serve bounce"></span>` : ""}
            ${markers.join("")}
          </div>
          <div class="table-ruler-x" aria-hidden="true">${horizontalTicks}<strong class="placement-coordinate-value coordinate-x" style="left:${requested.x}%">${point.xCm.toFixed(0)}</strong></div>
          <div class="placement-height-tools">
            <button class="editor-icon-action serve-toggle" type="button" data-placement-serve aria-pressed="${serve}" aria-label="Serve ball" title="${serve ? "Switch to normal ball" : "Switch to serve ball"}">${editorIcon("serve")}</button>
            <label class="height-adjuster"><span>Height</span><input type="range" min="-50" max="100" step="1" value="${selectedStep.variants[selectedVariant].height}" data-ball-field="height"><output>${selectedStep.variants[selectedVariant].height}</output></label>
          </div>
        </div>
        <div class="placement-bottom">
          <div class="placement-readout"><strong>${depth} · ${side}</strong><span>${Math.abs(point.xCm).toFixed(0)} cm ${point.xCm < -1 ? "left" : point.xCm > 1 ? "right" : "centre"} · ${point.yCm.toFixed(0)} cm from player end</span></div>
          ${editorTab === "placement" ? renderEditorActions(valid, true) : ""}
        </div>

      </section>`;
  }

  function renderStepList(program, selectedStep) {
    return `
      <section class="step-panel" aria-labelledby="steps-title">
        <div class="editor-section-heading program-heading"><h3 class="eyebrow" id="steps-title">Program Order – Steps</h3><div class="program-options"><button class="editor-icon-action" type="button" data-editor-add-step aria-label="Add step" title="Add step" ${program.steps.length >= DRILL_STEP_LIMIT ? "disabled" : ""}>${editorIcon("ball")}</button><button class="editor-icon-action order-toggle" type="button" data-editor-random aria-pressed="${draft.random}" aria-label="Random order" title="${draft.random ? "Random order · switch to sequential" : "Sequential order · switch to random"}">${editorIcon(draft.random ? "random" : "sequential")}</button></div></div>
        <div class="step-list" tabindex="0" role="group" aria-label="Balls in program order">${program.steps.map((step, index) => {
          const ball = step.variants[0];
          const serve = step.variants.every(isServeBall);
          return `<button type="button" class="step-row ${step.id === selectedStep?.id ? "selected" : ""} ${step.enabled ? "" : "disabled"} ${serve ? "serve" : ""}" data-editor-step="${escapeHtml(step.id)}" aria-pressed="${step.id === selectedStep?.id}"><span class="step-number">${index + 1}${serve ? "S" : ""}</span><span><strong>${serve ? "Serve · " : ""}${ball.type === "back" ? "Backspin" : "Topspin"}</strong><small>${step.enabled ? "Active" : "Inactive"} · ${step.variants.length} ball${step.variants.length === 1 ? "" : "s"} · ${ball.bpm} BPM · ${draft.random ? "RND" : "SEQ"}</small></span></button>`;
        }).join("")}</div>
      </section>`;
  }

  function renderBallControls(program, step) {
    const stepIndex = program.steps.findIndex((entry) => entry.id === step.id);
    activeVariant = Math.min(activeVariant, step.variants.length - 1);
    const ball = step.variants[activeVariant];
    const result = ballPreview(ball);
    const scatterMaximum = Math.min(...step.variants.map((entry) => 10 - Math.abs(entry.drop)));
    const scope = `<div class="parameter-scope-tabs" role="group" aria-label="Parameter editing scope"><button type="button" data-edit-scope="one" aria-pressed="${!bulkEditing}" class="${bulkEditing ? "" : "selected"}">This Ball</button><button type="button" data-edit-scope="all" aria-pressed="${bulkEditing}" class="${bulkEditing ? "selected" : ""}">All Balls</button></div>`;
    const scopeRow = `<div class="parameter-scope-row">${scope}<div class="level-selector editor-levels" role="group" aria-label="Program level">${[1, 2, 3].map((entry) => `<button type="button" data-editor-level="${entry}" aria-label="Difficulty level ${entry}" class="level-button ${entry === level ? "selected" : ""}" aria-pressed="${entry === level}">${entry}${draft.programs[entry] ? "" : "·"}</button>`).join("")}</div></div>`;
    if (bulkEditing) {
      return `<section class="ball-panel" aria-label="All ball parameters">${scopeRow}
        <form data-bulk-parameters>
          <div class="parameter-grid">
            <label>Speed change<input name="speed" type="number" min="-10" max="10" step="0.5" value="0" required></label>
            <label>Spin change<input name="spin" type="number" min="-10" max="10" step="0.5" value="0" required></label>
            <label>BPM change<input name="bpm" type="number" min="-60" max="60" step="1" value="0" required></label>
          </div>
          <button type="submit">Apply to all balls in Level ${level}</button>
        </form></section>`;
    }
    const spinMaximum = spinLimitForSpeed(ball.speed);
    return `
      <section class="ball-panel" aria-labelledby="ball-title">
        <h3 class="eyebrow parameter-heading" id="ball-title">Step ${stepIndex + 1} – Ball Parameters</h3>
        ${scopeRow}
        ${level !== 1 ? `<div class="editor-level-actions"><button type="button" data-editor-copy-level="1">Copy Level 1</button><button type="button" class="danger-button" data-editor-clear-level>Clear Level ${level}</button></div>` : ""}
        <div class="step-actions">
          <button type="button" data-step-move="-1" ${stepIndex === 0 ? "disabled" : ""}>↑ Up</button>
          <button type="button" data-step-move="1" ${stepIndex === program.steps.length - 1 ? "disabled" : ""}>↓ Down</button>
          <button type="button" data-step-duplicate ${program.steps.length >= DRILL_STEP_LIMIT ? "disabled" : ""}>Duplicate</button>
          <button type="button" class="danger-button" data-step-delete ${canDeleteStep(program, step) ? "" : "disabled"}>Delete</button>
        </div>
        <label class="editor-range"><span>Scatter<output>${step.scatter}</output></span><input type="range" min="0" max="${scatterMaximum}" step="0.5" value="${Math.min(step.scatter, scatterMaximum)}" data-step-scatter></label>
        <div class="variant-heading"><div class="variant-tabs" role="tablist" aria-label="Ball variants">${step.variants.map((_, index) => `<button type="button" role="tab" data-editor-variant="${index}" class="${index === activeVariant ? "selected" : ""}" aria-selected="${index === activeVariant}">Ball ${ballLabel(stepIndex, index, step.variants.length)}</button>`).join("")}</div>
        <div class="ball-kind" role="group" aria-label="Spin type"><button type="button" data-ball-type="top" class="${ball.type === "top" ? "selected" : ""}" aria-pressed="${ball.type === "top"}">Topspin</button><button type="button" data-ball-type="back" class="${ball.type === "back" ? "selected" : ""}" aria-pressed="${ball.type === "back"}">Backspin</button></div></div>
        <div class="parameter-grid">
          ${rangeControl("Speed", "speed", ball.speed, 0, 10, 0.5)}
          ${rangeControl("Spin", "spin", ball.spin, 0, spinMaximum, 0.5, ` / ${spinMaximum}`)}
          ${rangeControl("Height", "height", ball.height, -50, 100, 1)}
          ${rangeControl("Drop", "drop", ball.drop, -10, 10, 0.5)}
          ${rangeControl("BPM", "bpm", ball.bpm, 30, 90, 1)}
          ${rangeControl("Reps", "repetitions", ball.repetitions, 1, 100, 1)}
        </div>
        <div class="ball-flags">
          <label class="editor-switch"><input type="checkbox" data-step-enabled ${step.enabled ? "checked" : ""}><span>Active</span></label>
          <label class="editor-switch" title="Serve: first bounce on the robot side"><input type="checkbox" data-ball-serve ${isServeBall(ball) ? "checked" : ""}><span>Serve</span></label>
          <div class="ball-actions" role="group" aria-label="Ball actions">
            <button type="button" disabled title="Test ball unavailable until physical verification passes" aria-label="Test ball unavailable until physical verification passes"><span aria-hidden="true">▶</span></button>
            <button type="button" data-variant-duplicate title="Add a variant by copying this ball" aria-label="Add a variant by copying this ball">${editorIcon("variant")}</button>
            <button type="button" class="danger-button" data-variant-delete title="${step.variants.length === 1 ? "Cannot delete the only ball variant" : "Delete this ball variant"}" aria-label="Delete this ball variant" ${step.variants.length === 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button>
          </div>
        </div>
        <p class="preview-outcome ${result.ok ? "ok" : "warning"}"><strong>${escapeHtml(outcomeLabel(result))}</strong>${Number.isFinite(result.netClearanceCm) ? ` · net ${result.netClearanceCm.toFixed(1)} cm` : ""}</p>
      </section>`;
  }

  function renderEditorActions(valid, compact = false) {
    return `<footer class="editor-footer">${compact ? "" : `<span>${dirty ? "Unsaved changes" : "No unsaved changes"}</span>`}<div>
      <button class="${compact ? "editor-icon-action" : ""}" type="button" data-editor-cancel aria-label="Cancel" title="Cancel">${editorIcon("cancel")}${compact ? "" : "Cancel"}</button>
      <button class="${compact ? "editor-icon-action " : ""}primary-button" type="button" data-editor-save aria-label="Save program" title="Save program" ${valid && dirty ? "" : "disabled"}>${editorIcon("save")}${compact ? "" : '<span data-save-label>Save program</span>'}</button>
    </div></footer>`;
  }

  function render() {
    if (!draft) return;
    const program = currentProgram();
    if (program && !program.steps.some((step) => step.id === activeStepId)) setActiveFromProgram();
    const step = currentStep();
    const validation = validateDrill(draft);
    const populatedLevels = [1, 2, 3].filter((entry) => draft.programs[entry]);
    const sourceLevel = populatedLevels[0] ?? 1;
    const stepScroll = root.querySelector(".step-list")?.scrollTop ?? 0;
    root.innerHTML = `
      <div class="editor-shell ${program && editorTab === "placement" ? "editor-shell-placement" : ""}">
        <header class="editor-header"><span class="eyebrow">VDrill Editor</span><h2>${escapeHtml(draft.name)}</h2><button class="icon-button" type="button" data-editor-close aria-label="Close visual drill editor">×</button>
        <div class="editor-msync-actions" role="group" aria-label="MSYNC copy actions">
          <button type="button" data-msync-copy="inline" title="Copy as MSYNC Inline · current level" aria-label="Copy as MSYNC Inline" ${program ? "" : "disabled"}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M17 2l5 5-10 10-5 1 1-5z"/></svg></button>
          <button type="button" data-msync-copy="reference" title="Copy MSYNC Reference · saved drill ID" aria-label="Copy MSYNC Reference"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>
        </div></header>
        <div class="editor-navigation"><div class="editor-view-tabs" role="tablist" aria-label="Editor view">${["placement", "parameters"].map(tab => `<button type="button" role="tab" id="editor-tab-${tab}" aria-controls="editor-view-${tab}" aria-selected="${editorTab === tab}" tabindex="${editorTab === tab ? 0 : -1}" data-editor-tab="${tab}">${tab === "placement" ? "Placement" : "Parameters"}</button>`).join("")}</div>
          <span data-msync-copy-status role="status">${escapeHtml(copyMessage)}</span>
          <textarea data-msync-copy-fallback aria-label="MSYNC text to copy" readonly ${copyFallback ? "" : "hidden"}>${escapeHtml(copyFallback)}</textarea>
        </div>
        ${program ? `
          <div class="editor-workspace editor-tabbed-workspace">
            <div id="editor-view-placement" class="editor-placement-view" role="tabpanel" aria-labelledby="editor-tab-placement" ${editorTab === "placement" ? "" : "hidden"}>${renderBallSelector(program, step, activeVariant)}${renderTable(program, step, activeVariant, validation.valid)}</div>
            <div id="editor-view-parameters" class="editor-parameters-view" role="tabpanel" aria-labelledby="editor-tab-parameters" ${editorTab === "parameters" ? "" : "hidden"}>${renderStepList(program, step)}${renderBallControls(program, step)}</div>
          </div>
        ` : `<section class="editor-empty"><span class="editor-empty-icon">${level}</span><h3>Level ${level} has no program yet</h3><p>Start from Level ${sourceLevel}, then adjust its steps and ball parameters.</p><button class="primary-button" type="button" data-editor-create-level="${sourceLevel}">Create from Level ${sourceLevel}</button></section>`}
        <p class="dialog-result" role="alert">${validation.valid ? "" : escapeHtml(validation.issues[0]?.message ?? "Program is invalid")}</p>
        ${!program || editorTab === "parameters" ? renderEditorActions(validation.valid) : ""}
      </div>`;
    bind();
    revealSelectedBall();
    if (editorTab === "parameters") {
      const list = root.querySelector(".step-list");
      const selected = list?.querySelector('[aria-pressed="true"]');
      if (selected) {
        list.scrollTop = stepScroll;
        const listBounds = list.getBoundingClientRect();
        const bounds = selected.getBoundingClientRect();
        if (bounds.top < listBounds.top) list.scrollTop += bounds.top - listBounds.top;
        else if (bounds.bottom > listBounds.bottom) list.scrollTop += bounds.bottom - listBounds.bottom;
      }
    }
  }

  function revealSelectedBall() {
    if (editorTab !== "placement") return;
    root.querySelector('[data-placement-picker] [aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updatePickerArrows();
  }

  function updatePickerArrows() {
    const picker = root.querySelector("[data-placement-picker]");
    if (!picker) return;
    const [previous, next] = root.querySelectorAll("[data-picker-scroll]");
    previous.disabled = picker.scrollLeft <= 1;
    next.disabled = picker.scrollLeft + picker.clientWidth >= picker.scrollWidth - 1;
  }

  function updateBall(field, value) {
    const step = currentStep();
    if (!step) return;
    const ball = step.variants[activeVariant];
    const ranges = { speed: [0, 10], spin: [0, spinLimitForSpeed(ball.speed)], height: [-50, 100], drop: [-10, 10], bpm: [30, 90], repetitions: [1, 100] };
    requestedPositions.delete(ball);
    ball[field] = clamp(value, ...ranges[field]);
    if (field === "speed") ball.spin = Math.min(ball.spin, spinLimitForSpeed(ball.speed));
    if (field === "drop") step.scatter = Math.min(step.scatter, Math.max(0, Math.min(...step.variants.map((entry) => 10 - Math.abs(entry.drop)))));
    if (["bpm", "repetitions", "height"].includes(field)) ball[field] = Math.round(ball[field]);
    markDirty();
    render();
  }

  function placeActiveBall(position) {
    const step = currentStep();
    if (!step) return;
    const target = { x: clamp(position.x, 2, 98), y: clamp(position.y, 52, 98) };
    const point = tablePointFromPosition(target);
    const fit = fitBallToTarget(step.variants[activeVariant], point, draft.robotPosition, { scatter: step.scatter, calibration });
    step.variants[activeVariant] = mutableBall(fit.ball);
    requestedPositions.set(step.variants[activeVariant], target);
    markDirty();
    render();
  }

  function requestClose() {
    if (dirty && !globalThis.confirm("Close the visual editor without saving your changes?")) return;
    dirty = false;
    dialog.close();
  }

  function canDeleteStep(program, step) {
    return program.steps.length > 1
      && (!step.enabled || program.steps.some((entry) => entry !== step && entry.enabled));
  }

  function deleteSelection(wholeStep) {
    const program = currentProgram();
    const step = currentStep();
    if (!wholeStep && step.variants.length > 1) {
      step.variants.splice(activeVariant, 1);
      activeVariant = Math.min(activeVariant, step.variants.length - 1);
    } else {
      if (!canDeleteStep(program, step)) return;
      const index = program.steps.indexOf(step);
      program.steps.splice(index, 1);
      activeStepId = program.steps[Math.min(index, program.steps.length - 1)].id;
      activeVariant = 0;
    }
    markDirty();
    render();
  }

  function bind() {
    const picker = root.querySelector("[data-placement-picker]");
    const arrows = root.querySelectorAll("[data-picker-scroll]");
    if (picker) {
      picker.addEventListener("scroll", updatePickerArrows, { passive: true });
      arrows.forEach((button) => button.addEventListener("click", () => {
        picker.scrollBy({ left: Number(button.dataset.pickerScroll) * picker.clientWidth, behavior: "smooth" });
      }));
    }
    root.querySelectorAll("[data-editor-tab]").forEach(button => {
      button.addEventListener("click", () => { editorTab = button.dataset.editorTab; render(); root.querySelector(`[data-editor-tab="${editorTab}"]`)?.focus(); });
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); editorTab = editorTab === "placement" ? "parameters" : "placement"; render(); root.querySelector(`[data-editor-tab="${editorTab}"]`)?.focus();
      });
    });
    root.querySelectorAll("[data-msync-copy]").forEach((button) => button.addEventListener("click", async () => {
      try {
        const text = button.dataset.msyncCopy === "inline" ? createMsyncInlineBlock(draft, level) : createMsyncReference(stored);
        try {
          if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await globalThis.navigator.clipboard.writeText(text);
          copyMessage = "Copied to clipboard"; copyFallback = "";
        } catch {
          copyFallback = text; copyMessage = "Select and copy the text below";
        }
      } catch (error) { copyMessage = error.message; copyFallback = ""; }
      render();
      const fallback = root.querySelector("[data-msync-copy-fallback]");
      if (copyFallback && fallback) { fallback.focus(); fallback.select(); }
    }));
    root.querySelector("[data-editor-close]")?.addEventListener("click", requestClose);
    root.querySelector("[data-editor-cancel]")?.addEventListener("click", requestClose);
    root.querySelectorAll("[data-editor-level]").forEach((button) => button.addEventListener("click", () => { level = Number(button.dataset.editorLevel); setActiveFromProgram(); render(); }));
    root.querySelector("[data-editor-random]")?.addEventListener("click", () => {
      draft.random = !draft.random;
      markDirty();
      render();
      root.querySelector("[data-editor-random]")?.focus?.();
    });
    root.querySelectorAll("[data-robot-position]").forEach((button) => button.addEventListener("click", () => { draft.robotPosition = button.dataset.robotPosition; requestedPositions = new WeakMap(); markDirty(); render(); }));
    root.querySelector("[data-editor-create-level]")?.addEventListener("click", (event) => { draft.programs[level] = programCopy(draft.programs[Number(event.currentTarget.dataset.editorCreateLevel)]); markDirty(); setActiveFromProgram(); render(); });
    root.querySelector("[data-editor-copy-level]")?.addEventListener("click", (event) => {
      const sourceLevel = Number(event.currentTarget.dataset.editorCopyLevel);
      if (!globalThis.confirm(`Replace Level ${level} with a copy of Level ${sourceLevel}?`)) return;
      draft.programs[level] = programCopy(draft.programs[sourceLevel]);
      markDirty(); setActiveFromProgram(); render();
    });
    root.querySelector("[data-editor-clear-level]")?.addEventListener("click", () => {
      if (!globalThis.confirm(`Clear the Level ${level} program?`)) return;
      draft.programs[level] = null;
      markDirty(); setActiveFromProgram(); render();
    });
    root.querySelectorAll("[data-edit-scope]").forEach((button) => button.addEventListener("click", () => {
      bulkEditing = button.dataset.editScope === "all";
      render();
      root.querySelector(`[data-edit-scope="${button.dataset.editScope}"]`)?.focus();
    }));
    root.querySelector("[data-bulk-parameters]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const speed = Number(fields.get("speed"));
      const spin = Number(fields.get("spin"));
      const bpm = Number(fields.get("bpm"));
      if (speed || spin || bpm) {
        for (const step of currentProgram().steps) {
          for (const ball of step.variants) {
            if (speed || spin) requestedPositions.delete(ball);
            ball.speed = clamp(ball.speed + speed, 0, 10);
            ball.spin = clamp(ball.spin + spin, 0, spinLimitForSpeed(ball.speed));
            ball.bpm = clamp(ball.bpm + bpm, 30, 90);
          }
        }
        markDirty();
      }
      bulkEditing = false;
      render();
    });
    root.querySelectorAll("[data-editor-step]").forEach((button) => button.addEventListener("click", () => { activeStepId = button.dataset.editorStep; activeVariant = 0; render(); }));
    root.querySelectorAll("[data-preview-step]").forEach((button) => {
      button.addEventListener("click", () => { activeStepId = button.dataset.previewStep; activeVariant = Number(button.dataset.previewVariant); render(); });
      button.addEventListener("keydown", (event) => {
        if (button.dataset.previewStep !== activeStepId || Number(button.dataset.previewVariant) !== activeVariant || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const result = ballPreview(currentStep().variants[activeVariant]);
        const requested = requestedPositions.get(currentStep().variants[activeVariant]) ?? previewPosition(result);
        const position = { ...requested };
        const delta = event.shiftKey ? 5 : 2;
        if (event.key === "ArrowLeft") position.x -= delta;
        if (event.key === "ArrowRight") position.x += delta;
        if (event.key === "ArrowUp") position.y -= delta;
        if (event.key === "ArrowDown") position.y += delta;
        placeActiveBall(position);
        root.querySelector(`.preview-marker.selected`)?.focus();
      });
    });
    const table = root.querySelector("[data-placement-table]");
    if (table) {
      let drag = null;
      const positionFromEvent = (event) => {
        const bounds = table.getBoundingClientRect();
        return { x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100 };
      };
      const showTarget = (position) => {
        const x = Math.min(98, Math.max(2, position.x));
        const y = Math.min(98, Math.max(52, position.y));
        const target = table.querySelector("[data-placement-target]");
        const line = table.querySelector("[data-placement-line]");
        if (target) { target.style.left = `${x}%`; target.style.top = `${y}%`; target.classList.add("requested"); }
        line?.setAttribute("x2", x); line?.setAttribute("y2", y);
        const [horizontal, vertical] = table.querySelectorAll(".placement-coordinate");
        horizontal?.setAttribute("y1", y); horizontal?.setAttribute("y2", y); horizontal?.setAttribute("x2", x);
        vertical?.setAttribute("x1", x); vertical?.setAttribute("x2", x); vertical?.setAttribute("y1", y);
        const point = tablePointFromPosition({ x, y });
        const xValue = root.querySelector(".coordinate-x");
        const yValue = root.querySelector(".coordinate-y");
        if (xValue) { xValue.style.left = `${x}%`; xValue.textContent = point.xCm.toFixed(0); }
        if (yValue) { yValue.style.top = `${y}%`; yValue.textContent = point.yCm.toFixed(0); }
        return { x, y };
      };
      table.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const marker = event.target.closest?.("[data-preview-step]");
        if (drag) return;
        event.preventDefault();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, marker, moved: false };
        table.setPointerCapture(event.pointerId);
        if (!marker) showTarget(positionFromEvent(event));
      });
      table.addEventListener("pointermove", (event) => {
        if (drag?.id !== event.pointerId) return;
        drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 4;
        if (!drag.moved && drag.marker) return;
        const { x, y } = showTarget(positionFromEvent(event));
        if (drag.marker) {
          drag.marker.style.left = `${x}%`;
          drag.marker.style.top = `${y}%`;
        }
      });
      table.addEventListener("pointerup", (event) => {
        if (drag?.id !== event.pointerId) return;
        const { marker, moved } = drag;
        drag = null;
        event.preventDefault();
        if (marker) {
          activeStepId = marker.dataset.previewStep;
          activeVariant = Number(marker.dataset.previewVariant);
        }
        if (!marker || moved) placeActiveBall(positionFromEvent(event));
        else render();
      });
      for (const type of ["pointercancel", "lostpointercapture"]) {
        table.addEventListener(type, (event) => {
          if (drag?.id !== event.pointerId) return;
          drag = null;
          render();
        });
      }
    }
    root.querySelectorAll("[data-editor-add-step]").forEach((button) => button.addEventListener("click", () => {
      const program = currentProgram();
      const step = inheritedStep(program.steps.at(-1));
      program.steps.push(step); activeStepId = step.id; activeVariant = 0; markDirty(); render();
    }));
    root.querySelector("[data-step-enabled]")?.addEventListener("change", (event) => { currentStep().enabled = event.target.checked; markDirty(); render(); });
    const setServe = (serve) => {
      const ball = currentStep().variants[activeVariant];
      requestedPositions.delete(ball);
      ball.height = serve ? -30 : 35;
      markDirty();
      render();
    };
    root.querySelector("[data-ball-serve]")?.addEventListener("change", (event) => setServe(event.target.checked));
    root.querySelector("[data-placement-serve]")?.addEventListener("click", () => {
      setServe(!isServeBall(currentStep().variants[activeVariant]));
      root.querySelector("[data-placement-serve]")?.focus?.();
    });
    root.querySelector("[data-step-scatter]")?.addEventListener("input", (event) => { currentStep().scatter = clamp(event.target.value, 0, 10); markDirty(); render(); });
    root.querySelectorAll("[data-step-move]").forEach((button) => button.addEventListener("click", () => {
      const program = currentProgram();
      const index = program.steps.findIndex((step) => step.id === activeStepId);
      const target = index + Number(button.dataset.stepMove);
      [program.steps[index], program.steps[target]] = [program.steps[target], program.steps[index]];
      markDirty(); render();
    }));
    root.querySelector("[data-step-duplicate]")?.addEventListener("click", () => {
      const program = currentProgram();
      const index = program.steps.findIndex((step) => step.id === activeStepId);
      const copy = { ...clone(program.steps[index]), id: createId("step") };
      program.steps.splice(index + 1, 0, copy); activeStepId = copy.id; markDirty(); render();
    });
    root.querySelector("[data-step-delete]")?.addEventListener("click", () => deleteSelection(true));
    root.querySelector("[data-placement-delete]")?.addEventListener("click", () => deleteSelection(false));
    root.querySelectorAll("[data-editor-variant]").forEach((button) => button.addEventListener("click", () => { activeVariant = Number(button.dataset.editorVariant); render(); }));
    root.querySelector("[data-variant-add]")?.addEventListener("click", () => { const step = currentStep(); step.variants.push(mutableBall()); activeVariant = step.variants.length - 1; markDirty(); render(); });
    root.querySelectorAll("[data-variant-duplicate]").forEach((button) => button.addEventListener("click", () => {
      const step = currentStep();
      step.variants.push(clone(step.variants[activeVariant]));
      activeVariant = step.variants.length - 1;
      markDirty();
      render();
    }));
    root.querySelector("[data-variant-delete]")?.addEventListener("click", () => deleteSelection(false));
    root.querySelectorAll("[data-ball-type]").forEach((button) => button.addEventListener("click", () => { requestedPositions.delete(currentStep().variants[activeVariant]); currentStep().variants[activeVariant].type = button.dataset.ballType; markDirty(); render(); }));
    root.querySelectorAll("[data-ball-field]").forEach((input) => input.addEventListener("change", () => {
      updateBall(input.dataset.ballField, input.value);
      const view = root.querySelector(`#editor-view-${editorTab}`);
      view?.querySelector(`[data-ball-field="${input.dataset.ballField}"]`)?.focus();
    }));
    root.querySelector("[data-editor-save]")?.addEventListener("click", async () => {
      const button = root.querySelector("[data-editor-save]");
      button.disabled = true; button.setAttribute?.("aria-busy", "true");
      const label = button.querySelector?.("[data-save-label]");
      if (label) label.textContent = "Saving…";
      try {
        const saved = await service.saveEditor(stored.id, { programs: draft.programs, random: draft.random, robotPosition: draft.robotPosition });
        stored = saved; draft = clone(saved); dirty = false; dialog.close(); await onSaved?.(saved);
      } catch (error) {
        button.disabled = false; button.removeAttribute?.("aria-busy");
        if (label) label.textContent = "Save program";
        root.querySelector("[role=alert]").textContent = error.message;
      }
    });
  }

  dialog.addEventListener("cancel", (event) => { event.preventDefault(); requestClose(); });

  return Object.freeze({
    async open(id, initialLevel = 1) {
      stored = await service.get(id);
      if (!stored) throw new Error("Custom drill was not found");
      draft = clone(stored);
      calibration = await getCalibration();
      level = initialLevel;
      requestedPositions = new WeakMap();
      bulkEditing = false;
      dirty = false;
      setActiveFromProgram();
      render();
      dialog.showModal();
      revealSelectedBall();
    },
  });
}
