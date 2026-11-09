import { createBackup, restoreBackup } from "../application/backup/backup-service.js";
import { LocalSessionController } from "../application/sessions/session-controller.js";
import { createSessionSpec } from "../domain/sessions/schema.js";
import { SESSION_STATES } from "../domain/sessions/state-machine.js";
import { IndexedDbStore } from "../infrastructure/storage/indexed-db-store.js";
import { MemoryStore } from "../infrastructure/storage/memory-store.js";
import { detectCapabilities } from "./capabilities.js";
import { FEATURE_FLAGS } from "./feature-flags.js";
import { createRouter } from "./router.js";

const capabilities = detectCapabilities();
const view = document.querySelector("#route-view");
const tabs = [...document.querySelectorAll("[data-route]")];
let activeRoute = "overview";
let storageNotice = "";

const store = await IndexedDbStore.open().catch(() => {
  storageNotice = "Persistent browser storage is unavailable. This visit uses temporary memory only.";
  return new MemoryStore();
});

const controller = new LocalSessionController({
  onRecord: async (record) => {
    await store.put("sessionRecords", record);
    if (activeRoute === "data") await render("data");
  },
});

const yesNo = (value) => (value ? "Available" : "Unavailable");
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function overview() {
  return `
    <div class="card-grid">
      <article class="card"><h3>Local sessions</h3><span class="value">Reps + Time</span><p>Deterministic dry runs exercise countdown, pause, resume, Stop, completion, and session records.</p></article>
      <article class="card"><h3>Recovery</h3><span class="value">JSON backup</span><p>Export and validated restore protect origin-scoped local data.</p></article>
      <article class="card"><h3>Live robot</h3><span class="value">Disabled</span><p>Zero Bluetooth commands exist in this build. Physical execution remains a later safety milestone.</p></article>
    </div>`;
}

function capabilityView() {
  return `<div class="card-grid">${Object.entries(capabilities)
    .map(([name, available]) => `<article class="card"><h3>${escapeHtml(name)}</h3><span class="status-pill">${yesNo(available)}</span></article>`)
    .join("")}</div>`;
}

function roadmap() {
  const releases = [
    ["0.1", "Foundation", "Local persistence, recovery, Reps and Time dry runs"],
    ["0.2", "Music", "Stored tracks, playlists, Quick Music"],
    ["0.3", "MSYNC", "Validation, simulation, safe live scheduling"],
    ["0.4", "Connected", "Sharing and stable voice commands"],
  ];
  return `<div class="card-grid">${releases
    .map(([version, name, description]) => `<article class="card"><span class="value">${version}</span><h3>${name}</h3><p>${description}</p></article>`)
    .join("")}</div>`;
}

function trainView() {
  const session = controller.snapshot();
  const configurationLocked = session.state !== SESSION_STATES.IDLE;
  const stoppable = [SESSION_STATES.PREPARING, SESSION_STATES.ARMED, SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING, SESSION_STATES.PAUSED, SESSION_STATES.ERROR].includes(session.state);
  const amount = session.spec?.mode === "time" ? session.spec.durationSeconds : session.spec?.repetitions;
  const progress = Math.round(session.progress * 100);
  const metric = session.spec?.mode === "time"
    ? `${Math.round(session.elapsedSeconds)} / ${amount ?? 0} seconds`
    : `${session.completedCycles} / ${amount ?? 0} repetitions`;

  return `
    <div class="train-layout">
      <form id="session-form" class="card session-form">
        <p class="eyebrow">LOCAL DRY RUN</p>
        <h3>Configure session</h3>
        <label>Mode
          <select name="mode" ${configurationLocked ? "disabled" : ""}>
            <option value="reps" ${session.spec?.mode !== "time" ? "selected" : ""}>Reps</option>
            <option value="time" ${session.spec?.mode === "time" ? "selected" : ""}>Time</option>
          </select>
        </label>
        <label>Amount
          <input name="amount" type="number" min="1" max="3600" value="${amount ?? 10}" ${configurationLocked ? "disabled" : ""} required>
        </label>
        <label>Countdown
          <select name="countdown" ${configurationLocked ? "disabled" : ""}>
            <option value="3">3 seconds</option>
            <option value="5">5 seconds</option>
            <option value="0">None</option>
          </select>
        </label>
        <button class="primary-button" type="submit" ${configurationLocked ? "disabled" : ""}>Start dry run</button>
        <p class="form-note">The dry-run drill controls no hardware and records zero dispatched balls.</p>
      </form>

      <section class="card session-console" aria-label="Session console">
        <div class="session-heading"><div><p class="eyebrow">SESSION STATE</p><h3>${session.state}</h3></div><span class="simulation-badge">Simulation</span></div>
        <div class="session-metric">${session.state === SESSION_STATES.COUNTDOWN ? `Starting in ${Math.ceil(session.countdownRemaining)}` : metric}</div>
        <div class="progress-track" aria-label="Session progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" role="progressbar"><span style="width:${progress}%"></span></div>
        <div class="session-actions">
          <button type="button" data-command="pause" ${session.state !== SESSION_STATES.RUNNING ? "disabled" : ""}>Pause</button>
          <button type="button" data-command="resume" ${session.state !== SESSION_STATES.PAUSED ? "disabled" : ""}>Resume</button>
          <button type="button" class="stop-button" data-command="stop" ${stoppable ? "" : "disabled"}>Stop</button>
          <button type="button" data-command="reset" ${![SESSION_STATES.COMPLETED, SESSION_STATES.ERROR].includes(session.state) ? "disabled" : ""}>New session</button>
        </div>
      </section>
    </div>`;
}

async function dataView() {
  const records = (await store.getAll("sessionRecords")).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const rows = records.length
    ? records.map((record) => `<li><strong>${escapeHtml(record.mode.toUpperCase())}</strong><span>${escapeHtml(record.outcome)} · ${record.completedCycles} cycles · ${record.durationSeconds}s</span><time>${escapeHtml(new Date(record.startedAt).toLocaleString())}</time></li>`).join("")
    : "<li class=\"empty-state\">No local sessions recorded yet.</li>";
  return `
    ${storageNotice ? `<div class="notice" role="alert">${escapeHtml(storageNotice)}</div>` : ""}
    <div class="data-layout">
      <section class="card"><p class="eyebrow">LOCAL HISTORY</p><h3>${records.length} saved session${records.length === 1 ? "" : "s"}</h3><ul class="history-list">${rows}</ul></section>
      <section class="card"><p class="eyebrow">RECOVERY</p><h3>Backup and restore</h3><p>Backups contain local Nova Ultimate data. Restore validates the complete file before replacing stored collections.</p><div class="backup-actions"><button id="export-backup" class="primary-button">Export backup</button><label class="file-button">Restore backup<input id="import-backup" type="file" accept="application/json,.json"></label></div><p id="backup-result" class="form-note" aria-live="polite"></p></section>
    </div>`;
}

const renderers = { train: trainView, data: dataView, overview, capabilities: capabilityView, roadmap };

async function render(route) {
  activeRoute = route;
  tabs.forEach((tab) => tab.dataset.route === route ? tab.setAttribute("aria-current", "page") : tab.removeAttribute("aria-current"));
  view.innerHTML = await renderers[route]();
  document.title = `Nova Ultimate · ${route[0].toUpperCase()}${route.slice(1)}`;
  bindRouteActions(route);
}

function bindRouteActions(route) {
  if (route === "train") {
    document.querySelector("#session-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const mode = data.get("mode");
      const amount = Number(data.get("amount"));
      const spec = createSessionSpec({
        mode,
        drillId: "foundation-dry-run",
        repetitions: mode === "reps" ? amount : 10,
        durationSeconds: mode === "time" ? amount : 60,
      });
      controller.start(spec, { countdownSeconds: Number(data.get("countdown")) });
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
      link.download = `nova-ultimate-backup-${backup.createdAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      document.querySelector("#backup-result").textContent = "Backup exported.";
    });
    document.querySelector("#import-backup")?.addEventListener("change", async (event) => {
      const result = document.querySelector("#backup-result");
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        const restored = await restoreBackup(store, JSON.parse(await file.text()));
        result.textContent = `Restore complete: ${restored.restored} records.`;
        await render("data");
      } catch (error) {
        result.textContent = `Restore blocked: ${error.message}`;
      }
    });
  }
}

createRouter({ onRoute: (route) => void render(route) }).start();
document.querySelector("#build-version").textContent = "v0.1.0-local-sessions.0";

setInterval(() => {
  if ([SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING].includes(controller.state)) {
    controller.tick(1);
    if (activeRoute === "train") void render("train");
  }
}, 1000);

globalThis.NOVA_ULTIMATE_FOUNDATION = Object.freeze({ capabilities, featureFlags: FEATURE_FLAGS, storage: store.kind });

