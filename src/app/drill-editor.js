import { createBall, createStep, DRILL_STEP_LIMIT } from "../domain/drills/schema.js";
import { applyCalibration, fitBallToTarget, previewBall, previewPosition, tablePointFromPosition } from "../domain/drills/preview.js";
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

function programCopy(program) {
  return {
    steps: program.steps.map((step) => ({ ...mutableStep(step), id: createId("step") })),
    metadata: clone(program.metadata ?? {}),
  };
}

function outcomeLabel(result) {
  if (result.ok) return result.secondBounce ? "Short · second bounce on table" : "In · single bounce";
  return ({ net: "Net", long: "Long", side: "Wide", short: "Short" })[result.outcome] ?? "Outside preview";
}

function rangeControl(label, field, value, minimum, maximum, step = 1, suffix = "") {
  return `
    <label class="editor-range">
      <span>${label}<output>${escapeHtml(value)}${suffix}</output></span>
      <input type="range" min="${minimum}" max="${maximum}" step="${step}" value="${escapeHtml(value)}" data-ball-field="${field}">
    </label>`;
}

export function createDrillEditor({ dialog, root, service, getCalibration = async () => null, onSaved }) {
  let stored = null;
  let draft = null;
  let level = 1;
  let activeStepId = null;
  let activeVariant = 0;
  let dirty = false;
  let calibration = null;
  let placementTarget = null;
  let placementMessage = "";
  const ballPreview = (ball) => applyCalibration(previewBall(ball, draft.robotPosition), calibration);

  const currentProgram = () => draft?.programs?.[level] ?? null;
  const currentStep = () => currentProgram()?.steps.find((step) => step.id === activeStepId) ?? currentProgram()?.steps[0] ?? null;

  function setActiveFromProgram() {
    const step = currentProgram()?.steps[0] ?? null;
    activeStepId = step?.id ?? null;
    activeVariant = 0;
    placementTarget = null;
    placementMessage = "";
  }

  function markDirty() {
    dirty = true;
  }

  function renderTable(program, selectedStep, selectedVariant) {
    const markers = [];
    let selectedPosition = { x: 50, y: 75 };
    for (const [stepIndex, step] of program.steps.entries()) {
      for (const [variantIndex, ball] of step.variants.entries()) {
        const result = ballPreview(ball);
        const position = previewPosition(result);
        const selected = step.id === selectedStep?.id && variantIndex === selectedVariant;
        if (selected) selectedPosition = position;
        markers.push(`<button type="button" class="preview-marker ${ball.type === "back" ? "back" : "top"} ${step.enabled ? "" : "disabled"} ${selected ? "selected" : ""} ${result.ok ? "" : "warning"}" style="left:${position.x}%;top:${position.y}%" data-preview-step="${escapeHtml(step.id)}" data-preview-variant="${variantIndex}" aria-label="Edit step ${stepIndex + 1}, ball ${variantIndex + 1}: ${escapeHtml(outcomeLabel(result))}">${stepIndex + 1}</button>`);
      }
    }
    const requested = placementTarget?.stepId === selectedStep?.id && placementTarget?.variant === selectedVariant
      ? placementTarget.position
      : selectedPosition;
    const point = tablePointFromPosition(requested);
    const side = point.xCm < -1 ? "Backhand" : point.xCm > 1 ? "Forehand" : "Middle";
    const depth = point.yCm < 46 ? "Deep" : point.yCm > 91 ? "Short" : "Half-long";
    return `
      <section class="preview-panel" aria-labelledby="preview-title">
        <div class="editor-section-heading"><div><span class="eyebrow">${calibration ? "CALIBRATED PLACEMENT" : "ESTIMATED PLACEMENT"}</span><h3 id="preview-title">Aim on the table</h3></div><span class="preview-key"><i></i> Top <i class="back"></i> Back</span></div>
        <div class="table-stage">
          <div class="table-preview" data-placement-table role="group" aria-label="Interactive table. Drag the selected ball or tap the player half to choose a landing target.">
            <span class="table-landing-zone"><small>Tap or drag here</small></span><span class="table-net"></span><span class="table-label player">Player</span><span class="table-label robot">Robot</span>
            <svg class="placement-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="3" x2="${requested.x}" y2="${requested.y}" data-placement-line></line></svg>
            <span class="placement-target ${placementTarget ? "requested" : ""}" style="left:${requested.x}%;top:${requested.y}%" data-placement-target aria-hidden="true"></span>
            ${markers.join("")}
          </div>
        </div>
        <div class="placement-readout"><strong>${depth} · ${side}</strong><span>${Math.abs(point.xCm).toFixed(0)} cm ${point.xCm < -1 ? "left" : point.xCm > 1 ? "right" : "centre"} · ${point.yCm.toFixed(0)} cm from player end</span></div>
        <p class="helper-text">${escapeHtml(placementMessage || (calibration ? `Adjusted with ${calibration.name} · accuracy ±${calibration.accuracy} cm. Dragging changes Speed and Direction only.` : "Drag the selected ball or tap a target. Height, spin, tempo, repeats, and scatter stay unchanged."))}</p>
      </section>`;
  }

  function renderStepList(program, selectedStep) {
    return `
      <section class="step-panel" aria-labelledby="steps-title">
        <div class="editor-section-heading program-heading"><div><span class="eyebrow">PROGRAM ORDER</span><h3 id="steps-title">Steps</h3></div><div class="program-options"><label class="editor-switch"><input type="checkbox" data-editor-random ${draft.random ? "checked" : ""}><span>${draft.random ? "Random" : "Sequential"}</span></label><span class="step-count">${program.steps.length}/${DRILL_STEP_LIMIT}</span></div></div>
        <div class="step-list">${program.steps.map((step, index) => {
          const ball = step.variants[0];
          return `<button type="button" class="step-row ${step.id === selectedStep?.id ? "selected" : ""} ${step.enabled ? "" : "disabled"}" data-editor-step="${escapeHtml(step.id)}" aria-pressed="${step.id === selectedStep?.id}"><span class="step-number">${index + 1}</span><span><strong>${ball.type === "back" ? "Backspin" : "Topspin"}</strong><small>${step.variants.length} ball${step.variants.length === 1 ? "" : "s"} · ${ball.bpm} BPM</small></span></button>`;
        }).join("")}</div>
        <button class="editor-add-button" type="button" data-editor-add-step ${program.steps.length >= DRILL_STEP_LIMIT ? "disabled" : ""}>＋ Add step</button>
      </section>`;
  }

  function renderBallControls(program, step) {
    const stepIndex = program.steps.findIndex((entry) => entry.id === step.id);
    activeVariant = Math.min(activeVariant, step.variants.length - 1);
    const ball = step.variants[activeVariant];
    const result = ballPreview(ball);
    const scatterMaximum = Math.max(0, 10 - Math.abs(Number(ball.drop)));
    return `
      <section class="ball-panel" aria-labelledby="ball-title">
        <div class="editor-section-heading ball-panel-heading"><div><span class="eyebrow">STEP ${stepIndex + 1}</span><h3 id="ball-title">Ball parameters</h3></div><div class="ball-heading-controls"><div class="level-selector editor-levels" role="group" aria-label="Program level">${[1, 2, 3].map((entry) => `<button type="button" data-editor-level="${entry}" class="level-button ${entry === level ? "selected" : ""}" aria-pressed="${entry === level}">${entry}${draft.programs[entry] ? "" : "·"}</button>`).join("")}</div><label class="editor-switch"><input type="checkbox" data-step-enabled ${step.enabled ? "checked" : ""}><span>Enabled</span></label></div></div>
        ${level !== 1 ? `<div class="editor-level-actions"><button type="button" data-editor-copy-level="1">Copy Level 1</button><button type="button" class="danger-button" data-editor-clear-level>Clear Level ${level}</button></div>` : ""}
        <div class="step-actions">
          <button type="button" data-step-move="-1" ${stepIndex === 0 ? "disabled" : ""}>↑ Up</button>
          <button type="button" data-step-move="1" ${stepIndex === program.steps.length - 1 ? "disabled" : ""}>↓ Down</button>
          <button type="button" data-step-duplicate ${program.steps.length >= DRILL_STEP_LIMIT ? "disabled" : ""}>Duplicate</button>
          <button type="button" class="danger-button" data-step-delete ${program.steps.length === 1 ? "disabled" : ""}>Delete</button>
        </div>
        <label class="editor-range"><span>Scatter<output>${step.scatter}</output></span><input type="range" min="0" max="${scatterMaximum}" step="0.5" value="${Math.min(step.scatter, scatterMaximum)}" data-step-scatter></label>
        <div class="variant-heading"><div class="variant-tabs" role="tablist" aria-label="Ball variants">${step.variants.map((_, index) => `<button type="button" role="tab" data-editor-variant="${index}" class="${index === activeVariant ? "selected" : ""}" aria-selected="${index === activeVariant}">Ball ${index + 1}</button>`).join("")}</div><button type="button" class="small-button" data-variant-add>＋ Ball</button></div>
        <div class="variant-actions"><button type="button" data-variant-duplicate>Duplicate ball</button><button type="button" data-variant-delete ${step.variants.length === 1 ? "disabled" : ""}>Remove ball</button></div>
        <div class="ball-kind" role="group" aria-label="Spin type"><button type="button" data-ball-type="top" class="${ball.type === "top" ? "selected" : ""}" aria-pressed="${ball.type === "top"}">Topspin</button><button type="button" data-ball-type="back" class="${ball.type === "back" ? "selected" : ""}" aria-pressed="${ball.type === "back"}">Backspin</button></div>
        <div class="parameter-grid">
          ${rangeControl("Speed", "speed", ball.speed, 0, 10, 0.5)}
          ${rangeControl("Spin", "spin", ball.spin, 0, 10, 0.5)}
          ${rangeControl("Height", "height", ball.height, 0, 100, 1)}
          ${rangeControl("Direction", "drop", ball.drop, -10, 10, 0.5)}
          ${rangeControl("Tempo", "bpm", ball.bpm, 1, 120, 1, " BPM")}
          ${rangeControl("Repeats", "repetitions", ball.repetitions, 1, 100, 1)}
        </div>
        <p class="preview-outcome ${result.ok ? "ok" : "warning"}"><strong>${escapeHtml(outcomeLabel(result))}</strong>${Number.isFinite(result.netClearanceCm) ? ` · net ${result.netClearanceCm.toFixed(1)} cm` : ""}</p>
      </section>`;
  }

  function render() {
    if (!draft) return;
    const program = currentProgram();
    if (program && !program.steps.some((step) => step.id === activeStepId)) setActiveFromProgram();
    const step = currentStep();
    const validation = validateDrill(draft);
    const populatedLevels = [1, 2, 3].filter((entry) => draft.programs[entry]);
    const sourceLevel = populatedLevels[0] ?? 1;
    root.innerHTML = `
      <div class="editor-shell">
        <header class="editor-header"><div class="editor-title-line"><span class="eyebrow">VISUAL DRILL EDITOR</span><h2>${escapeHtml(draft.name)}</h2></div><button class="icon-button" type="button" data-editor-close aria-label="Close visual drill editor">×</button></header>
        ${program ? `
          <div class="editor-workspace">${renderTable(program, step, activeVariant)}${renderStepList(program, step)}${renderBallControls(program, step)}</div>
        ` : `<section class="editor-empty"><span class="editor-empty-icon">${level}</span><h3>Level ${level} has no program yet</h3><p>Start from Level ${sourceLevel}, then adjust its steps and ball parameters.</p><button class="primary-button" type="button" data-editor-create-level="${sourceLevel}">Create from Level ${sourceLevel}</button></section>`}
        <p class="dialog-result" role="alert">${validation.valid ? "" : escapeHtml(validation.issues[0]?.message ?? "Program is invalid")}</p>
        <footer class="editor-footer"><span>${dirty ? "Unsaved changes" : "No unsaved changes"}</span><div><button type="button" data-editor-cancel>Cancel</button><button class="primary-button" type="button" data-editor-save ${validation.valid && dirty ? "" : "disabled"}>Save program</button></div></footer>
      </div>`;
    bind();
  }

  function updateBall(field, value) {
    const step = currentStep();
    if (!step) return;
    const ball = step.variants[activeVariant];
    const ranges = { speed: [0, 10], spin: [0, 10], height: [0, 100], drop: [-10, 10], bpm: [1, 120], repetitions: [1, 100] };
    ball[field] = clamp(value, ...ranges[field]);
    if (["bpm", "repetitions", "height"].includes(field)) ball[field] = Math.round(ball[field]);
    placementTarget = null;
    placementMessage = "";
    markDirty();
    render();
  }

  function placeActiveBall(position) {
    const step = currentStep();
    if (!step) return;
    const point = tablePointFromPosition(position);
    const fit = fitBallToTarget(step.variants[activeVariant], point, draft.robotPosition, { scatter: step.scatter, calibration });
    step.variants[activeVariant] = mutableBall(fit.ball);
    placementTarget = { stepId: step.id, variant: activeVariant, position: { x: Math.min(98, Math.max(2, position.x)), y: Math.min(98, Math.max(52, position.y)) } };
    placementMessage = fit.reachable
      ? `Target fitted within ${fit.errorCm.toFixed(0)} cm · Speed ${fit.ball.speed} · Direction ${fit.ball.drop}.`
      : `Closest safe estimate is ${fit.errorCm.toFixed(0)} cm away · Speed ${fit.ball.speed} · Direction ${fit.ball.drop}.`;
    if (!fit.result.ok) placementMessage = `That target is outside the current ball envelope. Closest safe controls: Speed ${fit.ball.speed} · Direction ${fit.ball.drop}.`;
    markDirty();
    render();
  }

  function requestClose() {
    if (dirty && !globalThis.confirm("Close the visual editor without saving your changes?")) return;
    dirty = false;
    dialog.close();
  }

  function bind() {
    root.querySelector("[data-editor-close]")?.addEventListener("click", requestClose);
    root.querySelector("[data-editor-cancel]")?.addEventListener("click", requestClose);
    root.querySelectorAll("[data-editor-level]").forEach((button) => button.addEventListener("click", () => { level = Number(button.dataset.editorLevel); setActiveFromProgram(); render(); }));
    root.querySelector("[data-editor-random]")?.addEventListener("change", (event) => { draft.random = event.target.checked; markDirty(); render(); });
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
    root.querySelectorAll("[data-editor-step]").forEach((button) => button.addEventListener("click", () => { activeStepId = button.dataset.editorStep; activeVariant = 0; placementTarget = null; placementMessage = ""; render(); }));
    root.querySelectorAll("[data-preview-step]").forEach((button) => {
      button.addEventListener("click", () => { activeStepId = button.dataset.previewStep; activeVariant = Number(button.dataset.previewVariant); placementTarget = null; placementMessage = ""; render(); });
      button.addEventListener("keydown", (event) => {
        if (button.dataset.previewStep !== activeStepId || Number(button.dataset.previewVariant) !== activeVariant || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const result = ballPreview(currentStep().variants[activeVariant]);
        const requested = placementTarget?.stepId === activeStepId && placementTarget?.variant === activeVariant
          ? placementTarget.position
          : previewPosition(result);
        const position = { ...requested };
        const delta = event.shiftKey ? 5 : 2;
        if (event.key === "ArrowLeft") position.x -= delta;
        if (event.key === "ArrowRight") position.x += delta;
        if (event.key === "ArrowUp") position.y -= delta;
        if (event.key === "ArrowDown") position.y += delta;
        placeActiveBall(position);
      });
    });
    const table = root.querySelector("[data-placement-table]");
    if (table) {
      let dragging = false;
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
        return { x, y };
      };
      table.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const marker = event.target.closest?.("[data-preview-step]");
        if (marker && (marker.dataset.previewStep !== activeStepId || Number(marker.dataset.previewVariant) !== activeVariant)) return;
        event.preventDefault(); dragging = true; table.setPointerCapture?.(event.pointerId); showTarget(positionFromEvent(event));
      });
      table.addEventListener("pointermove", (event) => { if (dragging) showTarget(positionFromEvent(event)); });
      table.addEventListener("pointerup", (event) => {
        if (!dragging) return;
        dragging = false; event.preventDefault(); placeActiveBall(showTarget(positionFromEvent(event)));
      });
      table.addEventListener("pointercancel", () => { dragging = false; });
    }
    root.querySelector("[data-editor-add-step]")?.addEventListener("click", () => {
      const program = currentProgram();
      const sourceBall = currentStep()?.variants?.[activeVariant] ?? createBall();
      const step = mutableStep({ id: createId("step"), variants: [mutableBall(sourceBall)] });
      program.steps.push(step); activeStepId = step.id; activeVariant = 0; markDirty(); render();
    });
    root.querySelector("[data-step-enabled]")?.addEventListener("change", (event) => { currentStep().enabled = event.target.checked; markDirty(); render(); });
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
    root.querySelector("[data-step-delete]")?.addEventListener("click", () => {
      const program = currentProgram();
      const index = program.steps.findIndex((step) => step.id === activeStepId);
      program.steps.splice(index, 1); activeStepId = program.steps[Math.min(index, program.steps.length - 1)].id; activeVariant = 0; markDirty(); render();
    });
    root.querySelectorAll("[data-editor-variant]").forEach((button) => button.addEventListener("click", () => { activeVariant = Number(button.dataset.editorVariant); placementTarget = null; placementMessage = ""; render(); }));
    root.querySelector("[data-variant-add]")?.addEventListener("click", () => { const step = currentStep(); step.variants.push(mutableBall()); activeVariant = step.variants.length - 1; markDirty(); render(); });
    root.querySelector("[data-variant-duplicate]")?.addEventListener("click", () => { const step = currentStep(); step.variants.splice(activeVariant + 1, 0, clone(step.variants[activeVariant])); activeVariant += 1; markDirty(); render(); });
    root.querySelector("[data-variant-delete]")?.addEventListener("click", () => { const step = currentStep(); step.variants.splice(activeVariant, 1); activeVariant = Math.min(activeVariant, step.variants.length - 1); markDirty(); render(); });
    root.querySelectorAll("[data-ball-type]").forEach((button) => button.addEventListener("click", () => { currentStep().variants[activeVariant].type = button.dataset.ballType; markDirty(); render(); }));
    root.querySelectorAll("[data-ball-field]").forEach((input) => input.addEventListener("input", () => updateBall(input.dataset.ballField, input.value)));
    root.querySelector("[data-editor-save]")?.addEventListener("click", async () => {
      const button = root.querySelector("[data-editor-save]");
      button.disabled = true; button.textContent = "Saving…";
      try {
        const saved = await service.saveEditor(stored.id, { programs: draft.programs, random: draft.random });
        stored = saved; draft = clone(saved); dirty = false; dialog.close(); await onSaved?.(saved);
      } catch (error) {
        button.disabled = false; button.textContent = "Save program";
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
      dirty = false;
      setActiveFromProgram();
      render();
      dialog.showModal();
    },
  });
}
