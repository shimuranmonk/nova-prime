import { AdaptiveCalibrationPlan } from "../domain/calibration/adaptive-plan.js";
import { CENTERED_SETUP } from "../domain/calibration/trainer-physics.js";
import { createBall } from "../domain/drills/schema.js";
import { STANDARD_CALIBRATION_PLAN, summarizeQuickCheck } from "../domain/calibration/calculation.js";
import { previewCalibratedBall } from "../domain/drills/preview.js";
import { createId } from "../domain/shared/id.js";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const xPercent = (x) => clamp(((x + 76.25) / 152.5) * 100, 2, 98);
const yPercent = (y) => clamp(((137 - y) / 137) * 100, 2, 98);

function predictedPoint(test, robotPosition, profile = null) {
  const result = previewCalibratedBall(test.ball, robotPosition, profile);
  if (result.ok && Number.isFinite(result.xCm) && Number.isFinite(result.yCm)) return { xCm: result.xCm, yCm: result.yCm };
  return null;
}

function tableHtml(predicted, actual = null, enabled = true) {
  return `<div class="calibration-table ${enabled ? "interactive" : ""}" data-calibration-table role="img" aria-label="Player half of the table; ${enabled ? "tap the observed landing" : "landing comparison"}">
    <span class="calibration-net">Net</span><span class="calibration-centre"></span><span class="calibration-player">Your end line</span>
    ${predicted ? `<span class="calibration-target" style="left:${xPercent(predicted.xCm)}%;top:${yPercent(predicted.yCm)}%" title="Predicted landing"></span>` : ""}
    ${actual ? `<span class="calibration-actual" style="left:${xPercent(actual.xCm)}%;top:${yPercent(actual.yCm)}%" title="Observed landing"></span>` : ""}
  </div>`;
}

export function createCalibrationWizard({ dialog, root, service, onFire, onStop, onSaved }) {
  let profile = null;
  let quick = false;
  let stage = "setup";
  let mode = "standard";
  let setup = { name: "Default calibration", robotPosition: "middle", ballNotes: "", headOffset: 0 };
  let tests = [];
  let planner = null;
  let pending = null;
  let saving = false;
  let shotState = "ready";
  let shotMessage = "";
  let index = 0;
  let observations = [];
  let actual = null;
  let outcome = "landed";
  let dirty = false;

  function current() {
    if (!planner) return { ...tests[index], ball: createBall({ ...tests[index].ball, bpm: 60 }) };
    return { id: `trainer-${pending.step}-${pending.n}`, name: pending.label,
      ball: createBall({ ...pending.ball, bpm: 60 }), kind: pending.kind };
  }
  function currentPrediction() {
    if (!planner) {
      const test = current();
      const prediction = predictedPoint(test, setup.robotPosition, profile);
      return profile?.physicsModel ? prediction : prediction ?? clone(test.target);
    }
    return pending.pred.ok ? { xCm: pending.pred.x, yCm: pending.pred.y } : null;
  }
  function nextObservation() {
    shotState = "ready";
    shotMessage = "";
    if (planner) pending = planner.next();
    stage = (planner ? pending : tests[index]) ? "observe" : "review";
    render();
  }
  function undoObservation() {
    const previous = observations.pop();
    if (!previous) return;
    index--;
    if (planner) pending = planner.undo();
    actual = previous.actual;
    outcome = previous.outcome;
    stage = "observe";
    shotState = "observe";
    shotMessage = "";
    render();
  }

  async function requestClose() {
    if (saving || shotState === "stopping") return;
    if (dirty && !globalThis.confirm("Close calibration without saving these observations?")) return;
    if (shotState === "firing" && !(await stopShot())) return;
    dirty = false;
    dialog.close();
  }

  function renderSetup() {
    root.innerHTML = `<div class="calibration-shell">
      <header class="editor-header"><div><span class="eyebrow">GUIDED CALIBRATION</span><h2>Set up the table</h2><p>One ball per tap</p></div><button class="icon-button" type="button" data-cal-close aria-label="Close calibration">×</button></header>
      <main class="calibration-setup">
        <section class="calibration-intro"><strong>Nova Prime will guide the measurements.</strong><p>Connect your Nova S Pro before opening calibration. Place it centered and flush with the end line, facing straight ahead with its head at 0°. Use that setup for training.</p></section>
        <div class="calibration-form-grid">
          <label><span>Profile name</span><input data-cal-name maxlength="50" value="${escapeHtml(setup.name)}"></label>
          <label><span>Serve tests</span><select data-cal-serves><option value="include">Include serves</option><option value="skip">Skip serves</option></select></label>
          <label class="calibration-notes"><span>Ball notes</span><input data-cal-notes maxlength="160" value="${escapeHtml(setup.ballNotes)}" placeholder="Brand, material, size, condition"></label>
        </div>
        <aside class="calibration-safety"><strong>Before starting</strong><span>Clear the table area, keep the physical power control reachable, and stop immediately if ball delivery is unexpected.</span></aside>
        <div class="calibration-mode-grid">
          <button type="button" data-cal-mode="standard"><strong>Start Standard</strong><span>Alignment, net and long limits, loops, and center targets</span></button>
          <button type="button" data-cal-mode="complete"><strong>Start Complete</strong><span>Standard plus up to 15 tests across a wider range</span></button>
        </div>
      </main>
      <footer class="editor-footer"><span>Stored locally on this device</span><div><button type="button" data-cal-cancel>Cancel</button></div></footer>
    </div>`;
    bind();
  }

  function renderObservation(preserveScroll) {
    const scrollTop = preserveScroll ? root.querySelector(".calibration-observation").scrollTop : 0;
    const test = current();
    const predicted = currentPrediction();
    const ball = test.ball;
    const canRecord = shotState === "observe";
    root.innerHTML = `<div class="calibration-shell">
      <header class="editor-header"><div><span class="eyebrow">${quick ? "QUICK CHECK" : `${mode.toUpperCase()} CALIBRATION`}</span><h2>${escapeHtml(test.name)}</h2><p>${planner ? `Task ${pending.step} of ${pending.of} · shot ${index + 1}` : `Observation ${index + 1} of ${tests.length}`}</p></div><button class="icon-button" type="button" data-cal-close aria-label="Close calibration">×</button></header>
      <div class="calibration-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${planner ? pending.of : tests.length}" aria-valuenow="${planner ? pending.step - 1 : index}"><span style="width:${Math.round((planner ? (pending.step - 1) / pending.of : index / tests.length) * 100)}%"></span></div>
      <main class="calibration-observation">
        <section class="calibration-ball-card"><span class="eyebrow">NEXT BALL</span><div class="calibration-ball-values"><span><b>${ball.speed}</b> Speed</span><span><b>${ball.spin}</b> ${ball.type === "back" ? "Backspin" : "Topspin"}</span><span><b>${ball.height}</b> Height</span><span><b>${ball.drop}</b> Drop</span><span><b>${ball.bpm}</b> BPM</span></div><p>Tap Fire one ball, then record the first bounce on your half.</p>${planner ? `<p>${escapeHtml(pending.why)}</p>` : ""}${predicted ? "" : "<p>The model does not currently predict a landing on your half.</p>"}</section>
        <section class="calibration-landing"><div class="editor-section-heading"><div><span class="eyebrow">OBSERVED LANDING</span><h3>Tap where it landed</h3></div><span class="calibration-legend"><i></i> Predicted <i></i> Observed</span></div>${tableHtml(predicted, actual, canRecord)}
          <div class="calibration-coordinate-grid"><label><span>From centre (cm)</span><input data-cal-x ${canRecord ? "" : "disabled"} type="number" min="-76" max="76" step="1" value="${actual?.xCm ?? ""}" placeholder="−76 to 76"></label><label><span>From your end line (cm)</span><input data-cal-y ${canRecord ? "" : "disabled"} type="number" min="0" max="137" step="1" value="${actual?.yCm ?? ""}" placeholder="0 to 137"></label></div>
        </section>
        <section class="calibration-outcomes"><span>If it did not land on the table:</span><div>${["landed", "net", "long", "wide", "unseen"].map((value) => `<button type="button" data-cal-outcome="${value}" ${canRecord ? "" : "disabled"} class="${outcome === value ? "selected" : ""}">${value === "landed" ? "Landed" : value === "unseen" ? "Not seen" : value[0].toUpperCase() + value.slice(1)}</button>`).join("")}</div></section>
        <p class="dialog-result" role="alert">${escapeHtml(shotMessage)}</p>
      </main>
      <footer class="editor-footer"><span>${observations.length} recorded</span><div><button type="button" data-cal-undo ${observations.length && ["ready", "observe"].includes(shotState) ? "" : "disabled"}>Undo</button>${canRecord
      ? '<button class="primary-button" type="button" data-cal-record>Record & continue</button>'
      : shotState === "ready"
        ? '<button class="primary-button" type="button" data-cal-fire>Fire one ball</button>'
        : `<button class="danger-button" type="button" data-cal-stop ${shotState === "stopping" ? "disabled" : ""}>${shotState === "stopping" ? "Stopping…" : "Stop"}</button>`}</div></footer>
    </div>`;
    root.querySelector(".calibration-observation").scrollTop = scrollTop;
    bind();
  }

  function renderReview() {
    const summary = quick ? summarizeQuickCheck(observations) : null;
    const landed = observations.filter((entry) => entry.outcome === "landed").length;
    root.innerHTML = `<div class="calibration-shell">
      <header class="editor-header"><div><span class="eyebrow">${quick ? "QUICK CHECK COMPLETE" : "CALIBRATION REVIEW"}</span><h2>${quick ? (summary.landedCount ? `${summary.meanErrorCm} cm mean error` : "No comparable landings") : "Save this profile"}</h2><p>${landed} of ${observations.length} observations landed</p></div><button class="icon-button" type="button" data-cal-close aria-label="Close calibration">×</button></header>
      <main class="calibration-review">
        <div class="calibration-review-grid">${observations.map((entry, entryIndex) => `<article><span>${entryIndex + 1}</span><div><strong>${escapeHtml(entry.label)}</strong><small>${entry.outcome === "landed" && Number.isFinite(entry.predicted?.xCm) ? `${Math.round(Math.hypot(entry.actual.xCm - entry.predicted.xCm, entry.actual.yCm - entry.predicted.yCm))} cm from prediction` : entry.outcome}</small></div></article>`).join("")}</div>
        ${quick ? `<section class="calibration-suggestions"><h3>Quick Check guidance</h3>${summary.comparison ? `<p>${summary.comparison.paired} paired landings of ${summary.comparison.measured} measured${summary.comparison.paired ? ` · mean error ${summary.comparison.baselineMeanCm} cm baseline, ${summary.comparison.calibratedMeanCm} cm calibrated` : ""}.</p><p>Baseline predicted a miss on ${summary.comparison.baselineMisses} measured landings. Calibrated physics predicted a miss on ${summary.comparison.calibratedMisses}.</p>` : ""}${summary.suggestions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>` : `<section class="calibration-intro"><strong>What saving changes</strong><p>The fitted physics will update the Visual Editor landing marker and target placement for this centered setup. Run Quick Check afterward with fresh shots.</p></section>`}
        <p class="dialog-result" role="alert"></p>
      </main>
      <footer class="editor-footer"><span>${quick ? "The saved calibration is not refitted" : "One validated local write"}</span><div><button type="button" data-cal-back>Back</button><button class="primary-button" type="button" data-cal-save>${quick ? "Save Quick Check" : "Save calibration"}</button></div></footer>
    </div>`;
    bind();
  }

  function render(preserveScroll = false) {
    if (stage === "setup") renderSetup();
    else if (stage === "observe") renderObservation(preserveScroll);
    else renderReview();
  }

  function setActualFromFields() {
    const xValue = root.querySelector("[data-cal-x]")?.value ?? "";
    const yValue = root.querySelector("[data-cal-y]")?.value ?? "";
    const x = Number(xValue), y = Number(yValue);
    actual = xValue !== "" && yValue !== "" && Number.isFinite(x) && Number.isFinite(y) ? { xCm: clamp(x, -76.25, 76.25), yCm: clamp(y, 0, 137) } : null;
  }

  async function fireShot() {
    if (shotState !== "ready") return;
    const ball = current().ball;
    shotState = "firing";
    shotMessage = "Firing one ball. Watch for the first bounce.";
    render(true);
    try {
      const completed = await onFire(ball);
      if (shotState !== "firing") return;
      shotState = completed ? "observe" : "ready";
      shotMessage = completed ? "Mark the landing or select a miss." : "Shot interrupted. Check the robot before retrying.";
    } catch (error) {
      if (shotState !== "firing") return;
      shotState = "ready";
      shotMessage = error.message;
    }
    render(true);
  }

  async function stopShot() {
    shotState = "stopping";
    shotMessage = "Sending Stop…";
    render(true);
    try {
      const result = await onStop();
      if (result?.status !== "EXECUTED") throw new Error("Stop could not be verified.");
      shotMessage = "Stop sent. Check that the robot is stationary.";
      return true;
    } catch (error) {
      shotMessage = `${error.message} Check the robot before retrying.`;
      return false;
    } finally {
      shotState = "ready";
      render(true);
    }
  }

  function bind() {
    root.querySelector("[data-cal-close]")?.addEventListener("click", requestClose);
    root.querySelector("[data-cal-cancel]")?.addEventListener("click", requestClose);
    root.querySelectorAll("[data-cal-mode]").forEach((button) => button.addEventListener("click", () => {
      mode = button.dataset.calMode;
      setup.name = root.querySelector("[data-cal-name]").value;
      const serves = root.querySelector("[data-cal-serves]").value === "include";
      setup.ballNotes = root.querySelector("[data-cal-notes]").value;
      planner = new AdaptiveCalibrationPlan({ setup: CENTERED_SETUP, serves, cover: mode === "complete" ? 15 : 0 });
      nextObservation();
    }));
    root.querySelector("[data-cal-fire]")?.addEventListener("click", fireShot);
    root.querySelector("[data-cal-stop]")?.addEventListener("click", stopShot);
    root.querySelector(".calibration-table.interactive")?.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      actual = { xCm: Math.round(((event.clientX - rect.left) / rect.width) * 152.5 - 76.25), yCm: Math.round((1 - (event.clientY - rect.top) / rect.height) * 137) };
      outcome = "landed"; render(true);
    });
    root.querySelectorAll("[data-cal-x], [data-cal-y]").forEach((input) => input.addEventListener("input", () => { setActualFromFields(); outcome = "landed"; root.querySelectorAll("[data-cal-outcome]").forEach((button) => button.classList.toggle("selected", button.dataset.calOutcome === outcome)); }));
    root.querySelectorAll("[data-cal-outcome]").forEach((button) => button.addEventListener("click", () => { outcome = button.dataset.calOutcome; render(true); }));
    root.querySelector("[data-cal-record]")?.addEventListener("click", () => {
      if (shotState !== "observe") return;
      if (outcome === "landed" && !actual) { root.querySelector("[role=alert]").textContent = "Tap the table or enter landing coordinates first."; return; }
      const test = current();
      const predicted = currentPrediction();
      if (planner) planner.record({ result: ({ landed: "ok", wide: "side" })[outcome] ?? outcome, x: actual?.xCm, y: actual?.yCm });
      const compareBaseline = quick && Boolean(profile?.physicsModel);
      const baseline = compareBaseline ? predictedPoint(test, setup.robotPosition) : null;
      observations.push({ id: createId("observation"), testId: test.id, label: test.name, kind: test.kind, ball: clone(test.ball), predicted, ...(compareBaseline ? { baseline } : {}), actual: outcome === "landed" ? clone(actual) : null, outcome, recordedAt: new Date().toISOString() });
      dirty = true; index += 1; actual = null; outcome = "landed"; nextObservation();
    });
    root.querySelector("[data-cal-undo]")?.addEventListener("click", undoObservation);
    root.querySelector("[data-cal-back]")?.addEventListener("click", undoObservation);
    root.querySelector("[data-cal-save]")?.addEventListener("click", async () => {
      const button = root.querySelector("[data-cal-save]");
      saving = true;
      button.disabled = true;
      button.textContent = quick ? "Saving…" : "Fitting physics…";
      root.querySelector("[data-cal-back]").disabled = true;
      try {
        if (!quick && observations.filter(entry => entry.outcome === "landed").length < 3) {
          throw new Error("Record at least three measured landings before saving");
        }
        await new Promise(resolve => setTimeout(resolve, 32));
        const saved = quick
          ? await service.saveQuickCheck(profile.id, observations)
          : await service.save({ id: profile?.physicsModel ? profile.id : null, name: setup.name, mode, tableSetup: setup, observations, physicsParameters: planner.finish() });
        dirty = false; dialog.close(); await onSaved?.(saved, quick);
      } catch (error) { button.disabled = false; button.textContent = quick ? "Save Quick Check" : "Save calibration"; root.querySelector("[role=alert]").textContent = error.message; }
      finally { saving = false; root.querySelector("[data-cal-back]").disabled = false; }
    });
  }

  dialog.addEventListener("cancel", (event) => { event.preventDefault(); requestClose(); });

  return Object.freeze({
    open(activeProfile = null, isQuick = false) {
      profile = activeProfile ? clone(activeProfile) : null;
      quick = Boolean(isQuick);
      planner = null; pending = null;
      shotState = "ready"; shotMessage = "";
      dirty = false; observations = []; actual = null; outcome = "landed"; index = 0;
      if (quick) {
        if (!profile) throw new Error("Save a calibration before running Quick Check");
        setup = { name: profile.name, ...clone(profile.tableSetup) };
        mode = profile.mode; tests = profile.physicsModel ? STANDARD_CALIBRATION_PLAN : STANDARD_CALIBRATION_PLAN.slice(0, 3); stage = "observe";
      } else {
        mode = profile?.mode ?? "standard";
        setup = { name: profile?.name ?? "Default calibration", robotPosition: "middle", ballNotes: profile?.tableSetup?.ballNotes ?? "", headOffset: 0 };
        stage = "setup";
      }
      render(); dialog.showModal();
    },
  });
}
