import { calibrationPlan, STANDARD_CALIBRATION_PLAN, summarizeQuickCheck } from "../domain/calibration/calculation.js";
import { applyCalibration, previewBall } from "../domain/drills/preview.js";
import { createId } from "../domain/shared/id.js";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const xPercent = (x) => clamp(((x + 76.25) / 152.5) * 100, 2, 98);
const yPercent = (y) => clamp(((137 - y) / 137) * 100, 2, 98);

function predictedPoint(test, robotPosition, profile = null) {
  const result = applyCalibration(previewBall(test.ball, robotPosition), profile, test.ball);
  if (result.ok && Number.isFinite(result.xCm) && Number.isFinite(result.yCm)) return { xCm: result.xCm, yCm: result.yCm };
  return clone(test.target);
}

function tableHtml(predicted, actual = null, enabled = true) {
  return `<div class="calibration-table ${enabled ? "interactive" : ""}" data-calibration-table role="img" aria-label="Player half of the table; ${enabled ? "tap the observed landing" : "landing comparison"}">
    <span class="calibration-net">Net</span><span class="calibration-centre"></span><span class="calibration-player">Your end line</span>
    <span class="calibration-target" style="left:${xPercent(predicted.xCm)}%;top:${yPercent(predicted.yCm)}%" title="Predicted landing"></span>
    ${actual ? `<span class="calibration-actual" style="left:${xPercent(actual.xCm)}%;top:${yPercent(actual.yCm)}%" title="Observed landing"></span>` : ""}
  </div>`;
}

export function createCalibrationWizard({ dialog, root, service, onSaved }) {
  let profile = null;
  let quick = false;
  let stage = "setup";
  let mode = "standard";
  let setup = { name: "Default calibration", robotPosition: "middle", ballNotes: "", headOffset: 0 };
  let tests = [];
  let index = 0;
  let observations = [];
  let actual = null;
  let outcome = "landed";
  let dirty = false;

  const current = () => tests[index] ?? null;
  const currentPrediction = () => predictedPoint(current(), setup.robotPosition, quick ? profile : null);

  function requestClose() {
    if (dirty && !globalThis.confirm("Close calibration without saving these observations?")) return;
    dirty = false;
    dialog.close();
  }

  function renderSetup() {
    root.innerHTML = `<div class="calibration-shell">
      <header class="editor-header"><div><span class="eyebrow">GUIDED CALIBRATION</span><h2>Set up the table</h2><p>Manual observation · no robot commands</p></div><button class="icon-button" type="button" data-cal-close aria-label="Close calibration">×</button></header>
      <main class="calibration-setup">
        <section class="calibration-intro"><strong>Nova Prime will guide the measurements.</strong><p>Use the robot’s own controls or another safe controller to send each displayed ball. Prime only records where it landed and will not connect to or command the robot.</p></section>
        <div class="calibration-form-grid">
          <label><span>Profile name</span><input data-cal-name maxlength="50" value="${escapeHtml(setup.name)}"></label>
          <label><span>Robot position</span><select data-cal-position><option value="middle" ${setup.robotPosition === "middle" ? "selected" : ""}>Middle</option><option value="left" ${setup.robotPosition === "left" ? "selected" : ""}>Left corner</option><option value="right" ${setup.robotPosition === "right" ? "selected" : ""}>Right corner</option></select></label>
          <label class="calibration-notes"><span>Ball notes</span><input data-cal-notes maxlength="160" value="${escapeHtml(setup.ballNotes)}" placeholder="Brand, material, size, condition"></label>
        </div>
        <div class="calibration-mode-grid">
          <button type="button" data-cal-mode="standard" class="${mode === "standard" ? "selected" : ""}"><strong>Standard</strong><span>5 guided balls · top, no-spin, backspin and serve</span></button>
          <button type="button" data-cal-mode="complete" class="${mode === "complete" ? "selected" : ""}"><strong>Complete</strong><span>10 guided balls · repeated observations for scatter</span></button>
        </div>
        <aside class="calibration-safety"><strong>Before starting</strong><span>Clear the table area, keep the physical power control reachable, and stop immediately if ball delivery is unexpected.</span></aside>
      </main>
      <footer class="editor-footer"><span>Stored locally on this device</span><div><button type="button" data-cal-cancel>Cancel</button><button class="primary-button" type="button" data-cal-start>Start ${mode === "complete" ? "10" : "5"} observations</button></div></footer>
    </div>`;
    bind();
  }

  function renderObservation() {
    const test = current();
    const predicted = currentPrediction();
    const ball = test.ball;
    root.innerHTML = `<div class="calibration-shell">
      <header class="editor-header"><div><span class="eyebrow">${quick ? "QUICK CHECK" : `${mode.toUpperCase()} CALIBRATION`}</span><h2>${escapeHtml(test.name)}</h2><p>Observation ${index + 1} of ${tests.length} · no robot commands</p></div><button class="icon-button" type="button" data-cal-close aria-label="Close calibration">×</button></header>
      <div class="calibration-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${tests.length}" aria-valuenow="${index}"><span style="width:${Math.round(index / tests.length * 100)}%"></span></div>
      <main class="calibration-observation">
        <section class="calibration-ball-card"><span class="eyebrow">SET THIS BALL MANUALLY</span><div class="calibration-ball-values"><span><b>${ball.speed}</b> Speed</span><span><b>${ball.spin}</b> ${ball.type === "back" ? "Backspin" : "Topspin"}</span><span><b>${ball.height}</b> Height</span><span><b>${ball.drop}</b> Drop</span><span><b>${ball.bpm}</b> BPM</span></div><p>Send one ball only. Then record the first bounce on your half.</p></section>
        <section class="calibration-landing"><div class="editor-section-heading"><div><span class="eyebrow">OBSERVED LANDING</span><h3>Tap where it landed</h3></div><span class="calibration-legend"><i></i> Predicted <i></i> Observed</span></div>${tableHtml(predicted, actual)}
          <div class="calibration-coordinate-grid"><label><span>From centre (cm)</span><input data-cal-x type="number" min="-76" max="76" step="1" value="${actual?.xCm ?? ""}" placeholder="−76 to 76"></label><label><span>From your end line (cm)</span><input data-cal-y type="number" min="0" max="137" step="1" value="${actual?.yCm ?? ""}" placeholder="0 to 137"></label></div>
        </section>
        <section class="calibration-outcomes"><span>If it did not land on the table:</span><div>${["landed", "net", "long", "wide", "unseen"].map((value) => `<button type="button" data-cal-outcome="${value}" class="${outcome === value ? "selected" : ""}">${value === "landed" ? "Landed" : value === "unseen" ? "Not seen" : value[0].toUpperCase() + value.slice(1)}</button>`).join("")}</div></section>
        <p class="dialog-result" role="alert"></p>
      </main>
      <footer class="editor-footer"><span>${observations.length} recorded</span><div><button type="button" data-cal-undo ${observations.length ? "" : "disabled"}>Undo</button><button class="primary-button" type="button" data-cal-record>Record & continue</button></div></footer>
    </div>`;
    bind();
  }

  function renderReview() {
    const summary = quick ? summarizeQuickCheck(observations) : null;
    const landed = observations.filter((entry) => entry.outcome === "landed").length;
    root.innerHTML = `<div class="calibration-shell">
      <header class="editor-header"><div><span class="eyebrow">${quick ? "QUICK CHECK COMPLETE" : "CALIBRATION REVIEW"}</span><h2>${quick ? `${summary.meanErrorCm} cm mean error` : "Save this profile"}</h2><p>${landed} of ${observations.length} observations landed</p></div><button class="icon-button" type="button" data-cal-close aria-label="Close calibration">×</button></header>
      <main class="calibration-review">
        <div class="calibration-review-grid">${observations.map((entry, entryIndex) => `<article><span>${entryIndex + 1}</span><div><strong>${escapeHtml(entry.label)}</strong><small>${entry.outcome === "landed" ? `${Math.round(Math.hypot(entry.actual.xCm - entry.predicted.xCm, entry.actual.yCm - entry.predicted.yCm))} cm from prediction` : entry.outcome}</small></div></article>`).join("")}</div>
        ${quick ? `<section class="calibration-suggestions"><h3>Quick Check guidance</h3>${summary.suggestions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>` : `<section class="calibration-intro"><strong>What saving changes</strong><p>The average left/right and depth difference will adjust visual drill previews. Accuracy describes the remaining variation after that correction. Robot commands stay disabled.</p></section>`}
        <p class="dialog-result" role="alert"></p>
      </main>
      <footer class="editor-footer"><span>${quick ? "The saved calibration is not refitted" : "One validated local write"}</span><div><button type="button" data-cal-back>Back</button><button class="primary-button" type="button" data-cal-save>${quick ? "Save Quick Check" : "Save calibration"}</button></div></footer>
    </div>`;
    bind();
  }

  function render() {
    if (stage === "setup") renderSetup();
    else if (stage === "observe") renderObservation();
    else renderReview();
  }

  function setActualFromFields() {
    const xValue = root.querySelector("[data-cal-x]")?.value ?? "";
    const yValue = root.querySelector("[data-cal-y]")?.value ?? "";
    const x = Number(xValue), y = Number(yValue);
    actual = xValue !== "" && yValue !== "" && Number.isFinite(x) && Number.isFinite(y) ? { xCm: clamp(x, -76.25, 76.25), yCm: clamp(y, 0, 137) } : null;
  }

  function bind() {
    root.querySelector("[data-cal-close]")?.addEventListener("click", requestClose);
    root.querySelector("[data-cal-cancel]")?.addEventListener("click", requestClose);
    root.querySelectorAll("[data-cal-mode]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.calMode; render(); }));
    root.querySelector("[data-cal-start]")?.addEventListener("click", () => {
      setup.name = root.querySelector("[data-cal-name]").value;
      setup.robotPosition = root.querySelector("[data-cal-position]").value;
      setup.ballNotes = root.querySelector("[data-cal-notes]").value;
      tests = calibrationPlan(mode); index = 0; observations = []; actual = null; outcome = "landed"; stage = "observe"; render();
    });
    root.querySelector("[data-calibration-table]")?.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      actual = { xCm: Math.round(((event.clientX - rect.left) / rect.width) * 152.5 - 76.25), yCm: Math.round((1 - (event.clientY - rect.top) / rect.height) * 137) };
      outcome = "landed"; render();
    });
    root.querySelectorAll("[data-cal-x], [data-cal-y]").forEach((input) => input.addEventListener("change", () => { setActualFromFields(); outcome = "landed"; render(); }));
    root.querySelectorAll("[data-cal-outcome]").forEach((button) => button.addEventListener("click", () => { outcome = button.dataset.calOutcome; render(); }));
    root.querySelector("[data-cal-record]")?.addEventListener("click", () => {
      if (outcome === "landed" && !actual) { root.querySelector("[role=alert]").textContent = "Tap the table or enter landing coordinates first."; return; }
      const test = current();
      observations.push({ id: createId("observation"), testId: test.id, label: test.name, kind: test.kind, ball: clone(test.ball), predicted: currentPrediction(), actual: outcome === "landed" ? clone(actual) : null, outcome, recordedAt: new Date().toISOString() });
      dirty = true; index += 1; actual = null; outcome = "landed"; stage = index >= tests.length ? "review" : "observe"; render();
    });
    root.querySelector("[data-cal-undo]")?.addEventListener("click", () => { const previous = observations.pop(); if (!previous) return; index = Math.max(0, index - 1); actual = previous.actual; outcome = previous.outcome; render(); });
    root.querySelector("[data-cal-back]")?.addEventListener("click", () => { index = tests.length - 1; const previous = observations.pop(); actual = previous?.actual ?? null; outcome = previous?.outcome ?? "landed"; stage = "observe"; render(); });
    root.querySelector("[data-cal-save]")?.addEventListener("click", async () => {
      const button = root.querySelector("[data-cal-save]"); button.disabled = true; button.textContent = "Saving…";
      try {
        const saved = quick
          ? await service.saveQuickCheck(profile.id, observations)
          : await service.save({ id: profile?.id, name: setup.name, mode, tableSetup: setup, observations });
        dirty = false; dialog.close(); await onSaved?.(saved, quick);
      } catch (error) { button.disabled = false; button.textContent = quick ? "Save Quick Check" : "Save calibration"; root.querySelector("[role=alert]").textContent = error.message; }
    });
  }

  dialog.addEventListener("cancel", (event) => { event.preventDefault(); requestClose(); });

  return Object.freeze({
    open(activeProfile = null, isQuick = false) {
      profile = activeProfile ? clone(activeProfile) : null;
      quick = Boolean(isQuick);
      dirty = false; observations = []; actual = null; outcome = "landed"; index = 0;
      if (quick) {
        if (!profile) throw new Error("Save a calibration before running Quick Check");
        setup = { name: profile.name, ...clone(profile.tableSetup) };
        mode = profile.mode; tests = STANDARD_CALIBRATION_PLAN.slice(0, 3); stage = "observe";
      } else {
        mode = profile?.mode ?? "standard";
        setup = { name: profile?.name ?? "Default calibration", robotPosition: profile?.tableSetup?.robotPosition ?? "middle", ballNotes: profile?.tableSetup?.ballNotes ?? "", headOffset: profile?.tableSetup?.headOffset ?? 0 };
        stage = "setup";
      }
      render(); dialog.showModal();
    },
  });
}
