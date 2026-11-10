import { createBackup, restoreBackup } from "../application/backup/backup-service.js";
import { CUSTOM_GROUPS, CustomDrillService } from "../application/drills/custom-drill-service.js";
import { LocalSessionController } from "../application/sessions/session-controller.js";
import { BUILTIN_DRILLS, BUILTIN_GROUPS, getBuiltinDrill, getBuiltinDrills } from "../domain/drills/builtin-catalog.js";
import { createSessionSpec } from "../domain/sessions/schema.js";
import { SESSION_STATES } from "../domain/sessions/state-machine.js";
import { IndexedDbStore } from "../infrastructure/storage/indexed-db-store.js";
import { MemoryStore } from "../infrastructure/storage/memory-store.js";
import { detectCapabilities } from "./capabilities.js";
import { createDrillEditor } from "./drill-editor.js";
import { FEATURE_FLAGS } from "./feature-flags.js";
import { createRouter } from "./router.js";

const capabilities = detectCapabilities();
const view = document.querySelector("#route-view");
const menu = document.querySelector("#app-menu");
const menuScrim = document.querySelector("#menu-scrim");
const menuToggle = document.querySelector("#menu-toggle");
const drillDialog = document.querySelector("#drill-dialog");
const drillForm = document.querySelector("#drill-form");
const drillDialogResult = document.querySelector("#drill-dialog-result");
const editorDialog = document.querySelector("#editor-dialog");
const editorRoot = document.querySelector("#editor-root");
let activeRoute = "train";
let storageNotice = "";
let dataMessage = "";
let customMessage = "";
let customCache = [];

const uiState = {
  mode: "reps",
  level: 1,
  amount: 10,
  pauseSeconds: 0,
  countdownSeconds: 3,
  category: "basic",
  group: "A",
  customArrange: false,
  drillId: BUILTIN_DRILLS[0].id,
};

const store = await IndexedDbStore.open().catch(() => {
  storageNotice = "Persistent browser storage is unavailable. This visit uses temporary memory only.";
  return new MemoryStore();
});
const customDrillService = new CustomDrillService(store);
const drillEditor = createDrillEditor({
  dialog: editorDialog,
  root: editorRoot,
  service: customDrillService,
  onSaved: async (saved) => {
    uiState.drillId = saved.id;
    uiState.group = saved.group;
    customMessage = "Ball program saved.";
    await refreshCustomCache();
    if (activeRoute === "train") await render("train");
  },
});

async function refreshCustomCache() {
  customCache = await customDrillService.list();
}

function resolveDrill(id) {
  return getBuiltinDrill(id) ?? customCache.find((drill) => drill.id === id) ?? null;
}

function programForDrill(drill) {
  return drill?.programs?.[uiState.level] ?? drill?.programs?.[1] ?? null;
}

const controller = new LocalSessionController({
  onRecord: async (record) => {
    await store.put("sessionRecords", record);
    await refreshFooter();
    if (activeRoute === "data") await render("data");
  },
});

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function connectionCard() {
  return `
    <section class="app-card status-card" aria-labelledby="connection-title">
      <div class="status-copy"><span class="connection-dot"></span><div><h2 id="connection-title">Not connected</h2><p>Live robot control unlocks after safety verification.</p></div></div>
      <button class="outline-button" type="button" disabled title="Bluetooth is disabled in this milestone">Connect later</button>
    </section>`;
}

function calibrationCard() {
  return `
    <section class="app-card calibration-card" aria-labelledby="calibration-title">
      <div><h2 id="calibration-title">Calibration</h2><p>Not calibrated · canonical profile ready</p><details><summary>More</summary><p>Guided calibration, Quick Check, and physical placement arrive with the robot safety layer.</p></details></div>
      <button class="outline-button" type="button" disabled>Coming next</button>
    </section>`;
}

function modeButton(mode, label, available = true, locked = false) {
  const selected = uiState.mode === mode;
  return `<button type="button" class="segment ${selected ? "selected" : ""}" data-ui-mode="${mode}" ${available && !locked ? "" : "disabled"} aria-pressed="${selected}">${label}${available ? "" : "<small>Soon</small>"}</button>`;
}

function sessionConsole(session) {
  if (session.state === SESSION_STATES.IDLE) return "";
  const target = session.spec?.mode === "time" ? session.spec.durationSeconds : session.spec?.repetitions;
  let metric = session.spec?.mode === "time"
    ? `${Math.round(session.elapsedSeconds)} / ${target} seconds`
    : `${session.completedCycles} / ${target} repetitions`;
  if (session.state === SESSION_STATES.COUNTDOWN) metric = `Starting in ${Math.ceil(session.countdownRemaining)}`;
  if (session.state === SESSION_STATES.PAUSED) metric = `Paused · ${metric}`;
  if (session.state === SESSION_STATES.RUNNING && session.cyclePauseRemaining > 0) metric = `Resting ${Math.ceil(session.cyclePauseRemaining)}s · ${metric}`;
  const progress = Math.round(session.progress * 100);
  const drill = resolveDrill(session.spec?.drillId);
  const stoppable = [SESSION_STATES.PREPARING, SESSION_STATES.ARMED, SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING, SESSION_STATES.PAUSED, SESSION_STATES.ERROR].includes(session.state);
  return `
    <section class="app-card session-console" aria-label="Active session">
      <div class="console-heading"><div><span class="eyebrow">SESSION</span><h2>${session.state}</h2><p>${escapeHtml(drill?.name ?? "Local session")}</p></div><span class="simulation-pill">Simulation</span></div>
      <strong class="session-metric">${metric}</strong>
      <div class="progress-track" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <div class="console-actions">
        <button type="button" data-command="pause" ${session.state === SESSION_STATES.RUNNING ? "" : "disabled"}>Pause</button>
        <button type="button" data-command="resume" ${session.state === SESSION_STATES.PAUSED ? "" : "disabled"}>Resume</button>
        <button type="button" class="stop-button" data-command="stop" ${stoppable ? "" : "disabled"}>Stop</button>
        <button type="button" data-command="reset" ${[SESSION_STATES.COMPLETED, SESSION_STATES.ERROR].includes(session.state) ? "" : "disabled"}>New session</button>
      </div>
    </section>`;
}

function setupCard(session) {
  const locked = session.state !== SESSION_STATES.IDLE;
  const amountLabel = uiState.mode === "time" ? "Duration (s)" : "Count";
  const selectedDrill = resolveDrill(uiState.drillId);
  return `
    <section class="app-card setup-card" aria-labelledby="setup-title">
      <div class="section-heading"><div><span class="eyebrow">QUICK TRAINING</span><h2 id="setup-title">Session setup</h2></div><span class="simulation-pill">Dry run</span></div>

      <div class="control-group">
        <span class="control-label">Difficulty level</span>
        <div class="level-selector" role="group" aria-label="Difficulty level">
          ${[1, 2, 3].map((level) => `<button type="button" data-level="${level}" class="level-button ${uiState.level === level ? "selected" : ""}" aria-pressed="${uiState.level === level}" ${locked ? "disabled" : ""}>${level}</button>`).join("")}
        </div>
      </div>

      <div class="mode-selector" role="group" aria-label="Training mode">
        ${modeButton("reps", "Reps", true, locked)}
        ${modeButton("time", "Time", true, locked)}
        ${modeButton("music", "Music", false, locked)}
        ${modeButton("msync", "MSYNC", false, locked)}
      </div>

      <form id="session-form" class="session-form">
        <label><span>${amountLabel}</span><input name="amount" type="number" min="1" max="3600" value="${uiState.amount}" ${locked ? "disabled" : ""} required></label>
        <label><span>Pause (s)</span><input name="pause" type="number" min="0" max="30" step="1" value="${uiState.pauseSeconds}" ${locked ? "disabled" : ""} required></label>
        <label><span>Countdown</span><select name="countdown" ${locked ? "disabled" : ""}><option value="3" ${uiState.countdownSeconds === 3 ? "selected" : ""}>3 seconds</option><option value="5" ${uiState.countdownSeconds === 5 ? "selected" : ""}>5 seconds</option><option value="0" ${uiState.countdownSeconds === 0 ? "selected" : ""}>None</option></select></label>
        <button class="primary-button" type="submit" ${locked ? "disabled" : ""}>Start dry run</button>
      </form>
      <p class="helper-text">Selected: <strong>${escapeHtml(selectedDrill?.name ?? "Choose a drill")}</strong>. Uses the canonical lifecycle, sends no robot commands, and records zero dispatched balls.</p>
    </section>`;
}

function drillCard(drill, locked) {
  const steps = drill.programs[uiState.level].steps.filter((step) => step.enabled);
  const dots = steps.slice(0, 8).map((step) => {
    const ball = step.variants[0];
    const kind = ball.height < 0 ? "serve" : ball.type === "back" ? "back" : "top";
    return `<i class="ball-dot ${kind}"></i>`;
  }).join("");
  const selected = uiState.drillId === drill.id;
  return `<button class="drill-tile ${selected ? "selected" : ""}" type="button" data-drill-id="${escapeHtml(drill.id)}" aria-pressed="${selected}" ${locked ? "disabled" : ""}><span><strong>${escapeHtml(drill.name)}</strong>${drill.random ? '<small class="random-tag">Random</small>' : ""}</span><span class="ball-detail"><span class="ball-dots">${dots}</span>${steps.length} ball${steps.length === 1 ? "" : "s"}</span></button>`;
}

function drillLibrary(session) {
  const locked = session.state !== SESSION_STATES.IDLE;
  const drills = getBuiltinDrills(uiState.category);
  return `
    <section class="app-card library-card" aria-labelledby="library-title">
      <div class="section-heading"><div><h2 id="library-title">Built-in drills</h2><p>${BUILTIN_DRILLS.length} drills · level ${uiState.level}</p></div><button class="small-button" type="button" disabled>Fixed order</button></div>
      <div class="pill-row" role="group" aria-label="Drill category">${BUILTIN_GROUPS.map(({ id, label, count }) => `<button type="button" data-category="${id}" class="pill ${uiState.category === id ? "selected" : ""}" aria-pressed="${uiState.category === id}" ${locked ? "disabled" : ""}>${label} <small>${count}</small></button>`).join("")}</div>
      <div class="drill-grid">${drills.map((drill) => drillCard(drill, locked)).join("")}</div>
    </section>`;
}

function customDrillCard(drill, locked, index, groupLength) {
  const program = programForDrill(drill);
  const steps = program?.steps?.filter((step) => step.enabled) ?? [];
  const selected = uiState.drillId === drill.id;
  return `
    <article class="custom-drill-card ${selected ? "selected" : ""}">
      <button class="custom-drill-select" type="button" data-custom-select="${escapeHtml(drill.id)}" aria-pressed="${selected}" ${locked ? "disabled" : ""}>
        <strong>${escapeHtml(drill.name)}</strong>
        <span>${steps.length} ball${steps.length === 1 ? "" : "s"} · ${escapeHtml(drill.robotPosition)}</span>
      </button>
      <div class="custom-drill-actions">
        ${uiState.customArrange ? `<button type="button" data-custom-move="${escapeHtml(drill.id)}" data-direction="-1" aria-label="Move ${escapeHtml(drill.name)} up" ${locked || index === 0 ? "disabled" : ""}>↑</button><button type="button" data-custom-move="${escapeHtml(drill.id)}" data-direction="1" aria-label="Move ${escapeHtml(drill.name)} down" ${locked || index === groupLength - 1 ? "disabled" : ""}>↓</button>` : ""}
        <button class="manage-button" type="button" data-custom-edit="${escapeHtml(drill.id)}" aria-label="Manage ${escapeHtml(drill.name)}" ${locked ? "disabled" : ""}>✎</button>
      </div>
    </article>`;
}

function customDrills(session) {
  const locked = session.state !== SESSION_STATES.IDLE;
  const groupDrills = customCache.filter((drill) => drill.group === uiState.group);
  const counts = Object.fromEntries(CUSTOM_GROUPS.map((group) => [group, customCache.filter((drill) => drill.group === group).length]));
  return `
    <section class="app-card library-card" aria-labelledby="custom-title">
      <div class="section-heading"><div><h2 id="custom-title">My drills</h2><p>${customCache.length} drill${customCache.length === 1 ? "" : "s"}</p></div></div>
      <div class="custom-toolbar">
        <button type="button" data-custom-arrange class="small-button ${uiState.customArrange ? "active" : ""}" ${locked || groupDrills.length < 2 ? "disabled" : ""}>${uiState.customArrange ? "Done" : "Arrange"}</button>
        <button id="custom-export-all" type="button" class="small-button" ${locked || customCache.length === 0 ? "disabled" : ""}>Export all</button>
        <label class="small-button import-button ${locked ? "disabled" : ""}">Import<input id="custom-import" type="file" accept="application/json,.json" ${locked ? "disabled" : ""}></label>
      </div>
      <div class="pill-row" role="group" aria-label="Custom drill group">${CUSTOM_GROUPS.map((group) => `<button type="button" data-group="${group}" class="pill ${uiState.group === group ? "selected" : ""}" aria-pressed="${uiState.group === group}" ${locked ? "disabled" : ""}>Group ${group} <small>${counts[group]}</small></button>`).join("")}</div>
      ${customMessage ? `<p class="custom-message" role="status">${escapeHtml(customMessage)}</p>` : ""}
      <div class="custom-drill-grid">${groupDrills.map((drill, index) => customDrillCard(drill, locked, index, groupDrills.length)).join("")}</div>
      ${groupDrills.length === 0 ? `<div class="empty-library"><strong>Group ${uiState.group} is empty</strong><span>Create a drill here or import a Nova Prime drill file.</span></div>` : ""}
      <button class="new-drill" type="button" data-custom-new ${locked ? "disabled" : ""}><span>＋</span><strong>New drill</strong><small>Group ${uiState.group}</small></button>
    </section>`;
}

async function trainView() {
  await refreshCustomCache();
  const session = controller.snapshot();
  return `<div class="training-screen">${connectionCard()}${calibrationCard()}${setupCard(session)}${sessionConsole(session)}${drillLibrary(session)}${customDrills(session)}</div>`;
}

async function dataView() {
  await refreshCustomCache();
  const records = (await store.getAll("sessionRecords")).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const rows = records.length
    ? records.map((record) => `<li><div><strong>${escapeHtml(record.mode.toUpperCase())}</strong><span>${escapeHtml(record.outcome)}</span></div><span>${escapeHtml(resolveDrill(record.drillId)?.name ?? "Local drill")} · ${record.completedCycles} cycles · ${record.durationSeconds}s</span><time>${escapeHtml(new Date(record.startedAt).toLocaleString())}</time></li>`).join("")
    : `<li class="empty-row">No local sessions recorded yet.</li>`;
  return `
    <div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">LOCAL-FIRST</span><h1>Data and recovery</h1></div>
    ${storageNotice ? `<div class="notice" role="alert">${escapeHtml(storageNotice)}</div>` : ""}
    <div class="data-layout">
      <section class="app-card"><div class="section-heading"><div><h2>Session history</h2><p>${records.length} saved</p></div></div><ul class="history-list">${rows}</ul></section>
      <section class="app-card recovery-card"><h2>Backup and restore</h2><p>Restore validates the complete file before atomically replacing local collections.</p><div class="backup-actions"><button id="export-backup" class="primary-button" type="button">Export backup</button><label class="file-button">Restore backup<input id="import-backup" type="file" accept="application/json,.json"></label></div><p id="backup-result" class="helper-text" aria-live="polite">${escapeHtml(dataMessage)}</p></section>
    </div>`;
}

function overview() {
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">ABOUT</span><h1>Nova Prime</h1><p>Nova Trainer’s practical structure with Nova Plus modes, built on one local-first safety architecture.</p></div><div class="info-grid"><article class="app-card"><h2>Integrated</h2><strong class="large-value">34 built-in drills</strong><p>The verified Trainer catalogue, three levels, Reps, Time, history, backup, and recovery are available in simulation.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">Custom drill editor</strong><p>Build Levels 1–3 with ordered steps, ball variants, spin, speed, placement, tempo, scatter, and an estimated table preview.</p></article><article class="app-card"><h2>Next</h2><strong class="large-value">Guided calibration</strong><p>Turn estimated placement into a profile tuned to the table, balls, and robot position.</p></article><article class="app-card"><h2>Safety</h2><strong class="large-value">Bluetooth off</strong><p>Live commands remain blocked until the executor and physical tests pass.</p></article></div>`;
}

function capabilityView() {
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">DIAGNOSTICS</span><h1>Browser capabilities</h1></div><div class="info-grid">${Object.entries(capabilities).map(([name, available]) => `<article class="app-card capability-row"><span>${escapeHtml(name)}</span><strong class="${available ? "available" : "unavailable"}">${available ? "Available" : "Unavailable"}</strong></article>`).join("")}</div>`;
}

function roadmap() {
  const releases = [["0.1", "Foundation", "App shell, local data, drills, calibration, and safe sessions"], ["0.2", "Music", "Stored tracks, playlists, and Quick Music"], ["0.3", "MSYNC", "Validation, simulation, and safe synchronization"], ["0.4", "Connected", "Sharing and stable voice commands"]];
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">JEWELFLOW</span><h1>Roadmap</h1></div><div class="info-grid">${releases.map(([version, name, description]) => `<article class="app-card"><span class="release-number">${version}</span><h2>${name}</h2><p>${description}</p></article>`).join("")}</div>`;
}

const renderers = { train: trainView, data: dataView, overview, capabilities: capabilityView, roadmap };

async function render(route) {
  activeRoute = route;
  document.querySelectorAll("[data-menu-route]").forEach((link) => link.toggleAttribute("aria-current", link.dataset.menuRoute === route));
  view.innerHTML = await renderers[route]();
  document.title = `Nova Prime · ${route[0].toUpperCase()}${route.slice(1)}`;
  bindRouteActions(route);
  closeMenu();
}

function downloadJson(payload, filename) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openDrillDialog(drill = null) {
  drillForm.reset();
  drillForm.elements.id.value = drill?.id ?? "";
  drillForm.elements.name.value = drill?.name ?? "";
  drillForm.elements.group.value = drill?.group ?? uiState.group;
  drillForm.elements.robotPosition.value = drill?.robotPosition ?? "middle";
  document.querySelector("#drill-dialog-title").textContent = drill ? "Manage drill" : "New drill";
  document.querySelector("#drill-edit-actions").hidden = !drill;
  drillDialogResult.textContent = "";
  drillDialog.showModal();
  drillForm.elements.name.focus();
}

function bindRouteActions(route) {
  if (route === "train") {
    document.querySelectorAll("[data-level]").forEach((button) => button.addEventListener("click", () => { uiState.level = Number(button.dataset.level); void render("train"); }));
    document.querySelectorAll("[data-ui-mode]:not(:disabled)").forEach((button) => button.addEventListener("click", () => { uiState.mode = button.dataset.uiMode; uiState.amount = uiState.mode === "time" ? 60 : 10; void render("train"); }));
    document.querySelectorAll("[data-category]:not(:disabled)").forEach((button) => button.addEventListener("click", () => { uiState.category = button.dataset.category; uiState.drillId = getBuiltinDrills(uiState.category)[0].id; void render("train"); }));
    document.querySelectorAll("[data-drill-id]:not(:disabled)").forEach((button) => button.addEventListener("click", () => { uiState.drillId = button.dataset.drillId; void render("train"); }));
    document.querySelectorAll("[data-group]:not(:disabled)").forEach((button) => button.addEventListener("click", () => { uiState.group = button.dataset.group; uiState.customArrange = false; void render("train"); }));
    document.querySelectorAll("[data-custom-select]:not(:disabled)").forEach((button) => button.addEventListener("click", () => { uiState.drillId = button.dataset.customSelect; void render("train"); }));
    document.querySelectorAll("[data-custom-edit]:not(:disabled)").forEach((button) => button.addEventListener("click", () => openDrillDialog(resolveDrill(button.dataset.customEdit))));
    document.querySelector("[data-custom-new]:not(:disabled)")?.addEventListener("click", () => openDrillDialog());
    document.querySelector("[data-custom-arrange]:not(:disabled)")?.addEventListener("click", () => { uiState.customArrange = !uiState.customArrange; void render("train"); });
    document.querySelectorAll("[data-custom-move]:not(:disabled)").forEach((button) => button.addEventListener("click", async () => {
      await customDrillService.move(button.dataset.customMove, Number(button.dataset.direction));
      customMessage = "Drill order saved.";
      await render("train");
    }));
    document.querySelector("#custom-export-all:not(:disabled)")?.addEventListener("click", async () => {
      downloadJson(await customDrillService.export(), `nova-prime-drills-${new Date().toISOString().slice(0, 10)}.json`);
      customMessage = "All custom drills exported.";
      await render("train");
    });
    document.querySelector("#custom-import:not(:disabled)")?.addEventListener("change", async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        const result = await customDrillService.import(JSON.parse(await file.text()));
        if (result.drills[0]) {
          uiState.group = result.drills[0].group;
          uiState.drillId = result.drills[0].id;
        }
        customMessage = `Imported ${result.added} drill${result.added === 1 ? "" : "s"}.`;
      } catch (error) {
        customMessage = `Import blocked: ${error.message}`;
      }
      await render("train");
    });
    document.querySelector("#session-form")?.addEventListener("input", (event) => {
      const form = new FormData(event.currentTarget);
      uiState.amount = Number(form.get("amount"));
      uiState.pauseSeconds = Number(form.get("pause"));
      uiState.countdownSeconds = Number(form.get("countdown"));
    });
    document.querySelector("#session-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      uiState.amount = Number(form.get("amount"));
      uiState.pauseSeconds = Number(form.get("pause"));
      uiState.countdownSeconds = Number(form.get("countdown"));
      const spec = createSessionSpec({ mode: uiState.mode, level: uiState.level, drillId: uiState.drillId, repetitions: uiState.mode === "reps" ? uiState.amount : 10, durationSeconds: uiState.mode === "time" ? uiState.amount : 60, pauseSeconds: uiState.pauseSeconds });
      controller.start(spec, { countdownSeconds: uiState.countdownSeconds });
      void render("train");
    });
    document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => {
      const command = button.dataset.command;
      if (command === "pause") controller.pause();
      if (command === "resume") controller.resume();
      if (command === "stop") controller.stop();
      if (command === "reset") controller.reset();
      void render("train");
    }));
  }

  if (route === "data") {
    document.querySelector("#export-backup")?.addEventListener("click", async () => {
      const backup = await createBackup(store);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `nova-prime-backup-${backup.createdAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      dataMessage = "Backup exported.";
      await render("data");
    });
    document.querySelector("#import-backup")?.addEventListener("change", async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        const restored = await restoreBackup(store, JSON.parse(await file.text()));
        dataMessage = `Restore complete: ${restored.restored} records.`;
        await refreshFooter();
      } catch (error) {
        dataMessage = `Restore blocked: ${error.message}`;
      }
      await render("data");
    });
  }
}

function openMenu() {
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");
  menu.removeAttribute("inert");
  menuToggle.setAttribute("aria-expanded", "true");
  menuScrim.hidden = false;
}

function closeMenu() {
  menu.classList.remove("open");
  menu.setAttribute("aria-hidden", "true");
  menu.setAttribute("inert", "");
  menuToggle.setAttribute("aria-expanded", "false");
  menuScrim.hidden = true;
}

async function refreshFooter() {
  const records = await store.getAll("sessionRecords");
  const cycles = records.reduce((total, record) => total + (Number(record.completedCycles) || 0), 0);
  document.querySelector("#training-total").textContent = `${records.length} session${records.length === 1 ? "" : "s"} · ${cycles} cycles`;
}

menuToggle.addEventListener("click", openMenu);
document.querySelector("#menu-close").addEventListener("click", closeMenu);
menuScrim.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
document.querySelector("#drill-dialog-close").addEventListener("click", () => drillDialog.close());
document.querySelector("#drill-cancel").addEventListener("click", () => drillDialog.close());
document.querySelector("#drill-edit-balls").addEventListener("click", async () => {
  const id = drillForm.elements.id.value;
  drillDialog.close();
  try {
    await drillEditor.open(id, uiState.level);
  } catch (error) {
    drillDialogResult.textContent = error.message;
    drillDialog.showModal();
  }
});
drillForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  drillDialogResult.textContent = "";
  try {
    const values = new FormData(drillForm);
    const input = { name: values.get("name"), group: values.get("group"), robotPosition: values.get("robotPosition") };
    const saved = values.get("id") ? await customDrillService.update(values.get("id"), input) : await customDrillService.create(input);
    uiState.group = saved.group;
    uiState.drillId = saved.id;
    uiState.customArrange = false;
    customMessage = values.get("id") ? "Drill changes saved." : "Custom drill created and selected.";
    drillDialog.close();
    await render("train");
  } catch (error) {
    drillDialogResult.textContent = error.message;
  }
});
document.querySelector("#drill-duplicate").addEventListener("click", async () => {
  try {
    const copy = await customDrillService.duplicate(drillForm.elements.id.value);
    uiState.group = copy.group;
    uiState.drillId = copy.id;
    customMessage = "Drill duplicated and selected.";
    drillDialog.close();
    await render("train");
  } catch (error) {
    drillDialogResult.textContent = error.message;
  }
});
document.querySelector("#drill-export-one").addEventListener("click", async () => {
  try {
    const payload = await customDrillService.export([drillForm.elements.id.value]);
    const name = payload.drills[0]?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-drill";
    downloadJson(payload, `nova-prime-${name}.json`);
    drillDialogResult.textContent = "Drill exported.";
  } catch (error) {
    drillDialogResult.textContent = error.message;
  }
});
document.querySelector("#drill-delete").addEventListener("click", async () => {
  const id = drillForm.elements.id.value;
  const drill = resolveDrill(id);
  if (!drill || !globalThis.confirm(`Delete “${drill.name}”? This cannot be undone.`)) return;
  await customDrillService.delete(id);
  if (uiState.drillId === id) uiState.drillId = BUILTIN_DRILLS[0].id;
  customMessage = "Custom drill deleted.";
  drillDialog.close();
  await render("train");
});

createRouter({ onRoute: (route) => void render(route) }).start();
document.querySelector("#build-version").textContent = "v0.1.0-editor.0";
await refreshFooter();

setInterval(() => {
  if ([SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING].includes(controller.state)) {
    controller.tick(1);
    if (activeRoute === "train") void render("train");
  }
}, 1000);

globalThis.NOVA_PRIME_FOUNDATION = Object.freeze({ capabilities, featureFlags: FEATURE_FLAGS, storage: store.kind });
