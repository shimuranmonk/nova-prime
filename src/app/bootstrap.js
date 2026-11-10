import { createBackup, restoreBackup } from "../application/backup/backup-service.js";
import { CalibrationService } from "../application/calibration/calibration-service.js";
import { CUSTOM_GROUPS, CustomDrillService } from "../application/drills/custom-drill-service.js";
import { MsyncService } from "../application/msync/msync-service.js";
import { MsyncSimulator } from "../application/msync/msync-simulator.js";
import { AudioPlayer } from "../application/music/audio-player.js";
import { MusicLibraryService } from "../application/music/music-library-service.js";
import { LocalSessionController } from "../application/sessions/session-controller.js";
import { SharingService } from "../application/sharing/sharing-service.js";
import { BUILTIN_DRILLS, BUILTIN_GROUPS, getBuiltinDrill, getBuiltinDrills } from "../domain/drills/builtin-catalog.js";
import { createSessionSpec } from "../domain/sessions/schema.js";
import { SESSION_STATES } from "../domain/sessions/state-machine.js";
import { buildStatistics } from "../domain/statistics/analytics.js";
import { MAX_SHARE_BYTES } from "../domain/sharing/package.js";
import { IndexedDbStore } from "../infrastructure/storage/indexed-db-store.js";
import { MemoryStore } from "../infrastructure/storage/memory-store.js";
import { detectCapabilities } from "./capabilities.js";
import { createCalibrationWizard } from "./calibration-wizard.js";
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
const calibrationDialog = document.querySelector("#calibration-dialog");
const calibrationRoot = document.querySelector("#calibration-root");
let activeRoute = "train";
let storageNotice = "";
let dataMessage = "";
let customMessage = "";
let customCache = [];
let calibrationProfile = null;
let calibrationMessage = "";
let musicMessage = "";
let trackCache = [];
let playlistCache = [];
let musicSnapshot = null;
let msyncMessage = "";
let msyncCache = [];
let msyncIssues = [];
let msyncSnapshot = null;
let sharingMessage = "";
let sharingImportPreview = null;
let appReady = false;

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
  playlistId: null,
  quickTrackIds: [],
  msyncTrackId: null,
  robotLeadSeconds: 1.3,
  statisticsPeriod: 30,
  sharingTitle: "My Nova Prime drills",
  sharingNote: "",
  sharingDrillIds: [],
};

const store = await IndexedDbStore.open().catch(() => {
  storageNotice = "Persistent browser storage is unavailable. This visit uses temporary memory only.";
  return new MemoryStore();
});
const customDrillService = new CustomDrillService(store);
const sharingService = new SharingService(customDrillService);
const calibrationService = new CalibrationService(store);
const musicLibrary = new MusicLibraryService(store);
const audioPlayer = new AudioPlayer();
const msyncService = new MsyncService(store);
const msyncSimulator = new MsyncSimulator();
const drillEditor = createDrillEditor({
  dialog: editorDialog,
  root: editorRoot,
  service: customDrillService,
  getCalibration: () => calibrationService.active(),
  onSaved: async (saved) => {
    uiState.drillId = saved.id;
    uiState.group = saved.group;
    customMessage = "Ball program saved.";
    await refreshCustomCache();
    if (activeRoute === "train") await render("train");
  },
});
const calibrationWizard = createCalibrationWizard({
  dialog: calibrationDialog,
  root: calibrationRoot,
  service: calibrationService,
  onSaved: async (saved, quick) => {
    calibrationProfile = saved;
    calibrationMessage = quick ? "Quick Check saved." : "Calibration saved and visual previews updated.";
    if (activeRoute === "train") await render("train");
  },
});

async function refreshCustomCache() {
  customCache = await customDrillService.list();
}

async function refreshCalibrationProfile() {
  calibrationProfile = await calibrationService.active();
}

async function refreshMusicCache() {
  [trackCache, playlistCache] = await Promise.all([musicLibrary.tracks(), musicLibrary.playlists()]);
  if (uiState.playlistId && !playlistCache.some((playlist) => playlist.id === uiState.playlistId)) uiState.playlistId = null;
  uiState.quickTrackIds = uiState.quickTrackIds.filter((id) => trackCache.some((track) => track.id === id));
}

async function refreshMsyncCache() {
  msyncCache = await msyncService.list();
  const attachedTracks = trackCache.filter((track) => msyncCache.some((attachment) => attachment.id === track.msyncAttachmentId));
  if (!attachedTracks.some((track) => track.id === uiState.msyncTrackId)) uiState.msyncTrackId = attachedTracks[0]?.id ?? null;
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
    if (["data", "statistics"].includes(activeRoute)) await render(activeRoute);
  },
});

audioPlayer.subscribe((snapshot) => {
  const previousState = musicSnapshot?.state;
  musicSnapshot = snapshot;
  const activeMode = controller.snapshot().spec?.mode;
  const activeMusic = activeMode === "music";
  const activeMsync = activeMode === "msync";
  if (snapshot.state === "completed" && previousState !== "completed" && activeMusic) {
    controller.complete({ completedCycles: snapshot.completedTracks });
  }
  if (snapshot.state === "error" && previousState !== "error" && activeMusic) {
    musicMessage = snapshot.error;
    controller.fail("AUDIO_PLAYBACK_FAILED");
  }
  if (activeMsync && snapshot.state === "playing") msyncSimulator.advance(snapshot.currentTime * 1000);
  if (activeMsync && snapshot.state === "completed" && previousState !== "completed") msyncSimulator.advance(msyncSnapshot?.durationMs ?? 0);
  if (snapshot.state === "error" && previousState !== "error" && activeMsync) {
    msyncMessage = snapshot.error;
    msyncSimulator.stop();
    controller.fail("MSYNC_AUDIO_PLAYBACK_FAILED");
  }
  if (appReady && ["train", "music", "msync"].includes(activeRoute)) void render(activeRoute);
});

msyncSimulator.subscribe((snapshot) => {
  const previousState = msyncSnapshot?.state;
  msyncSnapshot = snapshot;
  const activeMsync = controller.snapshot().spec?.mode === "msync";
  if (activeMsync && snapshot.state === "completed" && previousState !== "completed") {
    audioPlayer.stop();
    controller.complete({ completedCycles: snapshot.activations });
  }
  if (appReady && activeRoute === "train") void render("train");
});

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatTrainingTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${total}s`;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function selectedMusicSummary() {
  if (uiState.playlistId) {
    const playlist = playlistCache.find((item) => item.id === uiState.playlistId);
    if (playlist) {
      const durationMs = playlist.items.reduce((total, item) => total + (trackCache.find((track) => track.id === item.trackId)?.durationMs ?? 0), 0);
      return { label: playlist.name, count: playlist.items.length, durationMs };
    }
  }
  const tracks = uiState.quickTrackIds.map((id) => trackCache.find((track) => track.id === id)).filter(Boolean);
  return { label: "Quick Music", count: tracks.length, durationMs: tracks.reduce((total, track) => total + track.durationMs, 0) };
}

function selectedMsync() {
  const track = trackCache.find((item) => item.id === uiState.msyncTrackId) ?? null;
  const attachment = msyncCache.find((item) => item.id === track?.msyncAttachmentId) ?? null;
  return { track, attachment };
}

function connectionCard() {
  return `
    <section class="app-card status-card" aria-labelledby="connection-title">
      <div class="status-copy"><span class="connection-dot"></span><div><h2 id="connection-title">Not connected</h2><p>Live robot control unlocks after safety verification.</p></div></div>
      <button class="outline-button" type="button" disabled title="Bluetooth is disabled in this milestone">Connect later</button>
    </section>`;
}

function calibrationCard() {
  const profile = calibrationProfile;
  const quick = profile?.quickCheck;
  return `
    <section class="app-card calibration-card" aria-labelledby="calibration-title">
      <div><h2 id="calibration-title">Calibration</h2><p>${profile ? `${escapeHtml(profile.name)} · accuracy ±${profile.accuracy} cm` : "Not calibrated · guided setup ready"}</p><details><summary>More</summary><p>${profile ? `Mode: ${escapeHtml(profile.mode)} · ${profile.observations.length} observations${profile.scatterEstimate == null ? "" : ` · scatter ${profile.scatterEstimate} cm`}${quick ? ` · Quick Check ${quick.meanErrorCm} cm` : ""}.` : "Record observed landings without enabling Bluetooth or robot commands."}</p><div class="calibration-file-actions">${profile ? `<button type="button" data-calibration-export>Export</button>` : ""}<label>Import<input data-calibration-import type="file" accept="application/json,.json"></label></div></details>${calibrationMessage ? `<span class="calibration-message" role="status">${escapeHtml(calibrationMessage)}</span>` : ""}</div>
      <div class="calibration-card-actions">${profile ? `<button class="outline-button" type="button" data-calibration-quick>Quick Check</button>` : ""}<button class="outline-button" type="button" data-calibration-open>${profile ? "Recalibrate" : "Calibrate"}</button></div>
    </section>`;
}

function modeButton(mode, label, available = true, locked = false) {
  const selected = uiState.mode === mode;
  return `<button type="button" class="segment ${selected ? "selected" : ""}" data-ui-mode="${mode}" ${available && !locked ? "" : "disabled"} aria-pressed="${selected}">${label}${available ? "" : "<small>Soon</small>"}</button>`;
}

function sessionConsole(session) {
  if (session.state === SESSION_STATES.IDLE) return "";
  const target = session.spec?.mode === "time" ? session.spec.durationSeconds : session.spec?.repetitions;
  const isMsync = session.spec?.mode === "msync";
  let metric = session.spec?.mode === "music"
    ? `${musicSnapshot?.completedTracks ?? 0} / ${musicSnapshot?.trackCount ?? 0} tracks · ${formatDuration((musicSnapshot?.currentTime ?? 0) * 1000)} / ${formatDuration((musicSnapshot?.duration ?? 0) * 1000)}`
    : isMsync
      ? `${formatDuration(msyncSnapshot?.positionMs ?? 0)} / ${formatDuration(msyncSnapshot?.durationMs ?? 0)}${msyncSnapshot?.resting ? " · REST" : msyncSnapshot?.active ? ` · ${msyncSnapshot.active.type} ${escapeHtml(msyncSnapshot.active.name)}` : " · IDLE"}`
    : session.spec?.mode === "time" ? `${Math.round(session.elapsedSeconds)} / ${target} seconds` : `${session.completedCycles} / ${target} repetitions`;
  if (session.state === SESSION_STATES.COUNTDOWN) metric = `Starting in ${Math.ceil(session.countdownRemaining)}`;
  if (session.state === SESSION_STATES.PAUSED) metric = `Paused · ${metric}`;
  if (session.state === SESSION_STATES.RUNNING && session.cyclePauseRemaining > 0) metric = `Resting ${Math.ceil(session.cyclePauseRemaining)}s · ${metric}`;
  const progress = Math.round((session.spec?.mode === "music" ? musicSnapshot?.progress ?? 0 : isMsync ? msyncSnapshot?.progress ?? 0 : session.progress) * 100);
  const drill = resolveDrill(session.spec?.drillId);
  const trackLabel = ["music", "msync"].includes(session.spec?.mode) && musicSnapshot?.currentTrack ? ` · ${escapeHtml(musicSnapshot.currentTrack.displayName)}` : "";
  const stoppable = [SESSION_STATES.PREPARING, SESSION_STATES.ARMED, SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING, SESSION_STATES.PAUSED, SESSION_STATES.ERROR].includes(session.state);
  return `
    <section class="app-card session-console" aria-label="Active session">
      <div class="console-heading"><div><span class="eyebrow">SESSION</span><h2>${session.state}</h2><p>${isMsync ? "MSYNC timeline" : escapeHtml(drill?.name ?? "Local session")}${trackLabel}</p></div><span class="simulation-pill">${isMsync ? "Timeline simulation" : session.spec?.mode === "music" ? "Local audio" : "Simulation"}</span></div>
      <strong class="session-metric">${metric}</strong>
      ${isMsync ? `<p class="helper-text">Robot Lead ${((msyncSnapshot?.robotLeadMs ?? 1300) / 1000).toFixed(3)}s · planned robot cues are displayed only and never transmitted.</p>` : ""}
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
  const music = selectedMusicSummary();
  const msync = selectedMsync();
  const sourceOptions = [
    ...(uiState.quickTrackIds.length ? [`<option value="quick" ${uiState.playlistId ? "" : "selected"}>Quick Music · ${uiState.quickTrackIds.length} tracks</option>`] : []),
    ...playlistCache.map((playlist) => `<option value="${escapeHtml(playlist.id)}" ${uiState.playlistId === playlist.id ? "selected" : ""}>${escapeHtml(playlist.name)} · ${playlist.items.length} tracks</option>`),
  ].join("");
  const musicForm = `
      <form id="session-form" class="session-form music-session-form">
        <label><span>Music source</span><select name="musicSource" ${locked ? "disabled" : ""} required>${sourceOptions || '<option value="">No music saved</option>'}</select></label>
        <div class="music-source-summary"><strong>${escapeHtml(music.label)}</strong><span>${music.count} track${music.count === 1 ? "" : "s"} · ${formatDuration(music.durationMs)}</span></div>
        <a class="manage-music-link" href="#music">Manage music</a>
        <button class="primary-button" type="submit" ${locked || music.count === 0 ? "disabled" : ""}>Start Music session</button>
      </form>`;
  const msyncOptions = trackCache.filter((track) => msyncCache.some((attachment) => attachment.id === track.msyncAttachmentId))
    .map((track) => `<option value="${escapeHtml(track.id)}" ${uiState.msyncTrackId === track.id ? "selected" : ""}>${escapeHtml(track.displayName)}</option>`).join("");
  const msyncForm = `
      <form id="session-form" class="session-form music-session-form">
        <label><span>Validated timeline</span><select name="msyncTrack" ${locked ? "disabled" : ""} required>${msyncOptions || '<option value="">No validated MSYNC timeline</option>'}</select></label>
        <label><span>Robot Lead (s)</span><input name="robotLead" type="number" min="0" max="5" step="0.001" value="${uiState.robotLeadSeconds}" ${locked ? "disabled" : ""} required></label>
        <div class="music-source-summary"><strong>${escapeHtml(msync.track?.displayName ?? "No timeline selected")}</strong><span>${msync.attachment ? `${msync.attachment.validationReceipt.summary.cues} cues · ${formatDuration(msync.attachment.validationReceipt.summary.durationMs)}` : "Attach an MSYNC file first"}</span></div>
        <a class="manage-music-link" href="#msync">Manage MSYNC</a>
        <button class="primary-button" type="submit" ${locked || !msync.attachment ? "disabled" : ""}>Start MSYNC simulation</button>
      </form>`;
  const standardForm = `
      <form id="session-form" class="session-form">
        <label><span>${amountLabel}</span><input name="amount" type="number" min="1" max="3600" value="${uiState.amount}" ${locked ? "disabled" : ""} required></label>
        <label><span>Pause (s)</span><input name="pause" type="number" min="0" max="30" step="1" value="${uiState.pauseSeconds}" ${locked ? "disabled" : ""} required></label>
        <label><span>Countdown</span><select name="countdown" ${locked ? "disabled" : ""}><option value="3" ${uiState.countdownSeconds === 3 ? "selected" : ""}>3 seconds</option><option value="5" ${uiState.countdownSeconds === 5 ? "selected" : ""}>5 seconds</option><option value="0" ${uiState.countdownSeconds === 0 ? "selected" : ""}>None</option></select></label>
        <button class="primary-button" type="submit" ${locked ? "disabled" : ""}>Start dry run</button>
      </form>`;
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
        ${modeButton("music", "Music", true, locked)}
        ${modeButton("msync", "MSYNC", true, locked)}
      </div>

      ${uiState.mode === "music" ? musicForm : uiState.mode === "msync" ? msyncForm : standardForm}
      <p class="helper-text">${uiState.mode === "msync" ? "MSYNC controls the drill timeline from validated cues." : `Selected: <strong>${escapeHtml(selectedDrill?.name ?? "Choose a drill")}</strong>. ${uiState.mode === "music" ? "Audio stays on this device and completes automatically." : "Uses the canonical lifecycle."}`} Sends no robot commands and records zero dispatched balls.</p>
      ${(uiState.mode === "msync" ? msyncMessage : musicMessage) ? `<p class="custom-message" role="status">${escapeHtml(uiState.mode === "msync" ? msyncMessage : musicMessage)}</p>` : ""}
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

function playlistCard(playlist) {
  const ordered = [...playlist.items].sort((a, b) => a.order - b.order);
  const durationMs = ordered.reduce((total, item) => total + (trackCache.find((track) => track.id === item.trackId)?.durationMs ?? 0), 0);
  const items = ordered.map((item, index) => {
    const track = trackCache.find((entry) => entry.id === item.trackId);
    return `<li><div><strong>${escapeHtml(track?.displayName ?? "Missing track")}</strong><span>${track ? formatDuration(track.durationMs) : "Unavailable"}</span></div><div class="music-row-actions"><button type="button" data-playlist-move="${escapeHtml(playlist.id)}" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Move track up">↑</button><button type="button" data-playlist-move="${escapeHtml(playlist.id)}" data-index="${index}" data-direction="1" ${index === ordered.length - 1 ? "disabled" : ""} aria-label="Move track down">↓</button><button type="button" data-playlist-remove="${escapeHtml(playlist.id)}" data-index="${index}" aria-label="Remove track">×</button></div></li>`;
  }).join("");
  return `<article class="app-card playlist-card">
    <form data-playlist-rename="${escapeHtml(playlist.id)}" class="playlist-heading"><label><span>Playlist name</span><input name="name" maxlength="80" value="${escapeHtml(playlist.name)}" required></label><button type="submit">Save name</button></form>
    <p>${ordered.length} track${ordered.length === 1 ? "" : "s"} · ${formatDuration(durationMs)}</p>
    <ol class="playlist-items">${items}</ol>
    <div class="playlist-add"><select data-playlist-add-select="${escapeHtml(playlist.id)}" aria-label="Track to add">${trackCache.map((track) => `<option value="${escapeHtml(track.id)}">${escapeHtml(track.displayName)}</option>`).join("")}</select><button type="button" data-playlist-add="${escapeHtml(playlist.id)}" ${trackCache.length ? "" : "disabled"}>Add track</button></div>
    <div class="playlist-actions"><button class="primary-button" type="button" data-playlist-use="${escapeHtml(playlist.id)}">Use in training</button><button class="danger-button" type="button" data-playlist-delete="${escapeHtml(playlist.id)}">Delete playlist</button></div>
  </article>`;
}

async function musicView() {
  await refreshMusicCache();
  const trackRows = trackCache.map((track) => `<article class="track-row">
    <input type="checkbox" data-quick-track="${escapeHtml(track.id)}" aria-label="Select ${escapeHtml(track.displayName)} for Quick Music" ${uiState.quickTrackIds.includes(track.id) ? "checked" : ""}>
    <div class="track-copy"><strong>${escapeHtml(track.displayName)}</strong><span>${formatDuration(track.durationMs)} · ${formatBytes(track.byteSize)} · stored locally</span></div>
    <form data-track-rename="${escapeHtml(track.id)}" class="track-rename"><input name="name" value="${escapeHtml(track.displayName)}" maxlength="80" aria-label="Rename ${escapeHtml(track.displayName)}"><button type="submit">Rename</button></form>
    <button class="danger-button" type="button" data-track-delete="${escapeHtml(track.id)}">Delete</button>
  </article>`).join("");
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">LOCAL MUSIC</span><h1>Music library</h1><p>Import audio once, build playlists, or select a few tracks for Quick Music. Audio remains in this browser and can play without internet or Wi-Fi.</p></div>
    ${storageNotice ? `<div class="notice" role="alert">${escapeHtml(storageNotice)}</div>` : ""}
    <section class="app-card music-import-card"><div><h2>Tracks</h2><p>${trackCache.length} stored · duplicate files are skipped by content identity</p></div><label class="primary-button music-import">Import audio<input id="music-import" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac" multiple></label></section>
    ${musicMessage ? `<p class="notice music-notice" role="status">${escapeHtml(musicMessage)}</p>` : ""}
    <section class="music-track-list" aria-label="Stored tracks">${trackRows || '<div class="app-card empty-library"><strong>No music stored yet</strong><span>Import audio files from this device. Nova Prime stores them locally and does not upload them.</span></div>'}</section>
    <section class="app-card quick-music-card"><div><h2>Quick Music</h2><p>Select tracks above for a one-off training queue.</p></div><div><button id="quick-music-use" class="primary-button" type="button" ${uiState.quickTrackIds.length ? "" : "disabled"}>Use ${uiState.quickTrackIds.length} selected</button></div></section>
    <section class="app-card playlist-create"><div><h2>New playlist</h2><p>Create a reusable playlist from the tracks currently selected for Quick Music.</p></div><form id="playlist-create"><input name="name" maxlength="80" placeholder="Playlist name" required><button class="primary-button" type="submit" ${uiState.quickTrackIds.length ? "" : "disabled"}>Create from selected</button></form></section>
    <div class="playlist-grid">${playlistCache.map(playlistCard).join("")}</div>`;
}

function msyncIssueList() {
  if (!msyncIssues.length) return "";
  return `<section class="app-card msync-issues" aria-label="MSYNC validation results"><h2>Validation details</h2><ul>${msyncIssues.map((item) => `<li class="${item.severity === "ERROR" ? "msync-error" : "msync-warning"}"><strong>${escapeHtml(item.code)}</strong><span>${item.line ? `Line ${item.line} · ` : ""}${escapeHtml(item.section ?? "MSYNC")} · ${escapeHtml(item.message)}</span></li>`).join("")}</ul></section>`;
}

async function msyncView() {
  await refreshMusicCache();
  await refreshMsyncCache();
  const attachments = msyncCache.map((attachment) => {
    const track = trackCache.find((item) => item.id === attachment.trackId);
    const summary = attachment.validationReceipt.summary;
    return `<article class="app-card msync-attachment-card">
      <div><span class="eyebrow">VALIDATED V1</span><h2>${escapeHtml(track?.displayName ?? "Missing audio")}</h2><p>${escapeHtml(attachment.sourceFilename)} · ${summary.cues} cues · ${formatDuration(summary.durationMs)} · ${summary.warnings} warning${summary.warnings === 1 ? "" : "s"}</p></div>
      <div class="msync-card-actions"><button class="primary-button" type="button" data-msync-use="${escapeHtml(track?.id ?? "")}" ${track ? "" : "disabled"}>Use in training</button><button type="button" data-msync-export="${escapeHtml(attachment.id)}">Export source</button><button class="danger-button" type="button" data-msync-remove="${escapeHtml(attachment.trackId)}">Remove</button></div>
    </article>`;
  }).join("");
  const trackOptions = trackCache.map((track) => `<option value="${escapeHtml(track.id)}">${escapeHtml(track.displayName)} · ${formatDuration(track.durationMs)}</option>`).join("");
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">FROZEN FORMAT V1</span><h1>MSYNC timelines</h1><p>Validate a timeline against its exact local audio file, then simulate synchronized cues. Nova Prime never repairs a file silently and sends no robot commands in this release.</p></div>
    ${storageNotice ? `<div class="notice" role="alert">${escapeHtml(storageNotice)}</div>` : ""}
    <section class="app-card msync-import-card"><div><h2>Validate and attach</h2><p>The selected track’s SHA-256 identity and measured duration must match the MSYNC file.</p></div><form id="msync-import-form"><label><span>Audio track</span><select name="trackId" required>${trackOptions || '<option value="">Import audio in Music first</option>'}</select></label><label class="file-button">Choose MSYNC<input name="msyncFile" type="file" accept=".ini,.msync,text/plain" required></label><button class="primary-button" type="submit" ${trackCache.length ? "" : "disabled"}>Validate and attach</button></form></section>
    ${msyncMessage ? `<p class="notice music-notice" role="status">${escapeHtml(msyncMessage)}</p>` : ""}
    ${msyncIssueList()}
    <section class="msync-list" aria-label="Validated MSYNC timelines">${attachments || '<div class="app-card empty-library"><strong>No validated timeline yet</strong><span>Import audio in Music, then attach its matching MSYNC v1 file here.</span></div>'}</section>`;
}

async function trainView() {
  await Promise.all([refreshCustomCache(), refreshCalibrationProfile(), refreshMusicCache()]);
  await refreshMsyncCache();
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

async function statisticsView() {
  await Promise.all([refreshCustomCache(), refreshCalibrationProfile()]);
  const records = await store.getAll("sessionRecords");
  const statistics = buildStatistics(records, { days: uiState.statisticsPeriod, calibrationProfile });
  const { summary } = statistics;
  const maxDailySessions = Math.max(1, ...statistics.daily.map((day) => day.sessions));
  const trend = statistics.daily.length
    ? statistics.daily.map((day) => `<li title="${day.sessions} sessions · ${day.completedCycles} cycles"><span class="trend-bar"><i style="height:${Math.max(10, Math.round((day.sessions / maxDailySessions) * 100))}%"></i></span><strong>${day.sessions}</strong><time>${escapeHtml(new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }))}</time></li>`).join("")
    : '<li class="statistics-empty">Complete a simulation session to begin the activity trend.</li>';
  const modes = statistics.modes.map((mode) => `<article class="mode-stat"><div><strong>${escapeHtml(mode.label)}</strong><span>${mode.sessions} session${mode.sessions === 1 ? "" : "s"} · ${formatTrainingTime(mode.durationSeconds)}</span></div><b>${mode.share}%</b><span class="share-track"><i style="width:${mode.share}%"></i></span></article>`).join("");
  const drills = statistics.drills.length
    ? statistics.drills.map((drill, index) => `<li><span>${index + 1}</span><div><strong>${escapeHtml(resolveDrill(drill.drillId)?.name ?? "Saved drill")}</strong><small>${drill.sessions} session${drill.sessions === 1 ? "" : "s"} · ${drill.completedCycles} cycles</small></div></li>`).join("")
    : '<li class="statistics-empty">No drill activity is recorded for this period.</li>';
  const guidance = statistics.guidance.map((item) => `<article class="guidance-item guidance-${item.tone}"><span class="eyebrow">PLAN GUIDANCE</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p><strong>${escapeHtml(item.action)}</strong></article>`).join("");
  return `<div class="page-heading statistics-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">DEVICE-LOCAL</span><h1>Statistics</h1><p>Review training consistency and receive transparent plan suggestions based only on session records saved on this device.</p></div>
    ${storageNotice ? `<div class="notice" role="alert">${escapeHtml(storageNotice)}</div>` : ""}
    <div class="statistics-boundary"><strong>Activity analytics—not skill scoring</strong><span>Simulation records do not prove physical ball delivery or playing performance. Nothing is uploaded.</span></div>
    <div class="statistics-period" role="group" aria-label="Statistics period">${[[7, "7 days"], [30, "30 days"], ["all", "All"]].map(([value, label]) => `<button type="button" data-statistics-period="${value}" class="${String(uiState.statisticsPeriod) === String(value) ? "selected" : ""}" aria-pressed="${String(uiState.statisticsPeriod) === String(value)}">${label}</button>`).join("")}</div>
    <section class="statistics-summary" aria-label="Training activity summary">
      <article><span>Sessions</span><strong>${summary.sessions}</strong></article>
      <article><span>Training time</span><strong>${formatTrainingTime(summary.durationSeconds)}</strong></article>
      <article><span>Completed cycles</span><strong>${summary.completedCycles}</strong></article>
      <article><span>Completion</span><strong>${summary.completionRate}%</strong></article>
      <article><span>Active days</span><strong>${summary.activeDays}</strong></article>
      <article><span>Current streak</span><strong>${summary.currentStreak} day${summary.currentStreak === 1 ? "" : "s"}</strong></article>
    </section>
    <div class="statistics-grid">
      <section class="app-card trend-card"><div class="section-heading"><div><h2>Activity trend</h2><p>Latest 14 active days in this period</p></div></div><ol class="trend-chart">${trend}</ol></section>
      <section class="app-card"><div class="section-heading"><div><h2>Mode mix</h2><p>Share of local sessions</p></div></div><div class="mode-stat-list">${modes}</div></section>
      <section class="app-card"><div class="section-heading"><div><h2>Most used drills</h2><p>Ranked by sessions</p></div></div><ol class="drill-stat-list">${drills}</ol></section>
      <section class="app-card guidance-card"><div class="section-heading"><div><h2>Adaptive plan guidance</h2><p>Rule-based and explainable</p></div></div><div class="guidance-list">${guidance}</div></section>
    </div>`;
}

async function sharingView() {
  await refreshCustomCache();
  const availableIds = new Set(customCache.map((drill) => drill.id));
  uiState.sharingDrillIds = uiState.sharingDrillIds.filter((id) => availableIds.has(id));
  const selected = new Set(uiState.sharingDrillIds);
  const rows = customCache.length
    ? customCache.map((drill) => `<label class="share-drill-row"><input type="checkbox" data-share-drill="${escapeHtml(drill.id)}" ${selected.has(drill.id) ? "checked" : ""}><span><strong>${escapeHtml(drill.name)}</strong><small>Group ${escapeHtml(drill.group)} · ${[1, 2, 3].filter((level) => drill.programs[level]).length} level${[1, 2, 3].filter((level) => drill.programs[level]).length === 1 ? "" : "s"}</small></span><b>${escapeHtml(drill.source)}</b></label>`).join("")
    : '<div class="empty-library"><strong>No custom drills to share</strong><span>Create a drill in Training, then return here to make a versioned pack.</span><a class="manage-music-link" href="#train">Go to Training</a></div>';
  const preview = sharingImportPreview?.summary;
  const previewCard = preview ? `<section class="app-card share-preview-card" aria-label="Validated import preview">
      <div class="section-heading"><div><span class="eyebrow">VALIDATED PREVIEW</span><h2>${escapeHtml(preview.title)}</h2><p>${preview.drills} drill${preview.drills === 1 ? "" : "s"} · ${preview.programs} level programs · ${preview.steps} steps · ${formatBytes(preview.bytes)}</p></div></div>
      ${preview.note ? `<p class="share-note">${escapeHtml(preview.note)}</p>` : ""}
      <div class="share-group-summary"><span>Group A <strong>${preview.groups.A}</strong></span><span>Group B <strong>${preview.groups.B}</strong></span><span>Group C <strong>${preview.groups.C}</strong></span></div>
      <ul class="share-name-list">${preview.names.slice(0, 8).map((name) => `<li>${escapeHtml(name)}</li>`).join("")}${preview.names.length > 8 ? `<li>+ ${preview.names.length - 8} more</li>` : ""}</ul>
      <div class="share-actions"><button id="share-import-confirm" class="primary-button" type="button">Import ${preview.drills} drill${preview.drills === 1 ? "" : "s"}</button><button id="share-import-clear" type="button">Cancel preview</button></div>
      <p class="helper-text">Nothing has been imported yet. Names and identities are resolved safely only after you confirm.</p>
    </section>` : "";
  return `<div class="page-heading sharing-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">EXPLICIT · VERSIONED · LOCAL-FIRST</span><h1>Share custom drills</h1><p>Create a validated Nova Prime drill pack, save it as a file, or open your device’s share sheet. Import always shows a preview before changing local data.</p></div>
    ${storageNotice ? `<div class="notice" role="alert">${escapeHtml(storageNotice)}</div>` : ""}
    <div class="sharing-boundary"><strong>You choose when data leaves this device</strong><span>Nova Prime has no sharing account or background upload. The system share button sends a file only to the destination you select.</span></div>
    ${sharingMessage ? `<p class="notice sharing-notice" role="status">${escapeHtml(sharingMessage)}</p>` : ""}
    <div class="sharing-layout">
      <section class="app-card share-create-card"><div class="section-heading"><div><h2>Create a drill pack</h2><p>${uiState.sharingDrillIds.length} of ${customCache.length} selected</p></div><div class="share-selection-actions"><button data-share-select-all type="button" ${customCache.length ? "" : "disabled"}>Select all</button><button data-share-clear type="button" ${uiState.sharingDrillIds.length ? "" : "disabled"}>Clear</button></div></div>
        <div class="share-drill-list">${rows}</div>
        <form id="share-create-form" class="share-metadata"><label><span>Pack title</span><input name="title" maxlength="80" value="${escapeHtml(uiState.sharingTitle)}" required></label><label><span>Optional note</span><textarea name="note" maxlength="280" rows="3" placeholder="What should the recipient know?">${escapeHtml(uiState.sharingNote)}</textarea></label></form>
        <div class="share-actions"><button data-share-download class="primary-button" type="button" ${uiState.sharingDrillIds.length ? "" : "disabled"}>Download pack</button><button data-share-native type="button" ${uiState.sharingDrillIds.length && capabilities.webShare ? "" : "disabled"}>Share with device…</button></div>
        <p class="helper-text">${capabilities.webShare ? "Your browser provides a system share sheet." : "System sharing is unavailable here; downloading the same validated pack always works."}</p>
      </section>
      <section class="app-card share-import-card"><div><h2>Preview an incoming pack</h2><p>Select a <code>.nova-share.json</code> file. Nova Prime validates its version, size, drill types, identities, and every ball parameter before showing the confirmation step.</p></div><label class="file-button">Choose drill pack<input id="share-import-file" type="file" accept="application/json,.json,.nova-share.json"></label><small>Maximum file size: ${formatBytes(MAX_SHARE_BYTES)}</small></section>
      ${previewCard}
    </div>`;
}

function overview() {
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">ABOUT</span><h1>Nova Prime</h1><p>Nova Trainer’s practical structure with Nova Plus modes, built on one local-first safety architecture.</p></div><div class="info-grid"><article class="app-card"><h2>Integrated</h2><strong class="large-value">34 built-in drills</strong><p>The verified Trainer catalogue, three levels, Reps, Time, history, backup, and recovery are available in simulation.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">Custom drill editor</strong><p>Build Levels 1–3 with ordered steps, ball variants, spin, speed, placement, tempo, scatter, and a calibrated table preview.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">Guided calibration</strong><p>Standard and Complete observation plans, local profiles, import/export, and Quick Check are available without robot commands.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">Local Music</strong><p>Store deduplicated audio, build playlists, use Quick Music, and run automatically completing Music sessions offline.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">MSYNC v1</strong><p>Validate exact audio identity, attach timelines atomically, and simulate cues with adjustable Robot Lead without transport.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">Local statistics</strong><p>Review activity trends, mode mix, drill use, and explainable plan guidance without uploading training history.</p></article><article class="app-card"><h2>Integrated</h2><strong class="large-value">Versioned sharing</strong><p>Create validated custom-drill packs, use explicit device sharing, and preview every incoming file before import.</p></article><article class="app-card"><h2>Safety</h2><strong class="large-value">Bluetooth off</strong><p>Live commands remain blocked until the executor and physical tests pass.</p></article></div>`;
}

function capabilityView() {
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">DIAGNOSTICS</span><h1>Browser capabilities</h1></div><div class="info-grid">${Object.entries(capabilities).map(([name, available]) => `<article class="app-card capability-row"><span>${escapeHtml(name)}</span><strong class="${available ? "available" : "unavailable"}">${available ? "Available" : "Unavailable"}</strong></article>`).join("")}</div>`;
}

function roadmap() {
  const releases = [["0.1", "Foundation", "App shell, local data, drills, calibration, and safe sessions"], ["0.2", "Music", "Stored tracks, playlists, and Quick Music"], ["0.3", "MSYNC", "Validation, simulation, and safe synchronization"], ["0.4", "Insights", "Local statistics and explainable plan guidance"], ["0.5", "Connected", "Versioned drill sharing; stable voice commands next"]];
  return `<div class="page-heading"><a href="#train" class="back-link">← Training</a><span class="eyebrow">JEWELFLOW</span><h1>Roadmap</h1></div><div class="info-grid">${releases.map(([version, name, description]) => `<article class="app-card"><span class="release-number">${version}</span><h2>${name}</h2><p>${description}</p></article>`).join("")}</div>`;
}

const renderers = { train: trainView, music: musicView, msync: msyncView, statistics: statisticsView, sharing: sharingView, data: dataView, overview, capabilities: capabilityView, roadmap };

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

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
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
  if (route === "sharing") {
    const titleInput = document.querySelector("#share-create-form [name=title]");
    const noteInput = document.querySelector("#share-create-form [name=note]");
    titleInput?.addEventListener("input", () => { uiState.sharingTitle = titleInput.value; });
    noteInput?.addEventListener("input", () => { uiState.sharingNote = noteInput.value; });
    document.querySelectorAll("[data-share-drill]").forEach((input) => input.addEventListener("change", () => {
      const chosen = new Set(uiState.sharingDrillIds);
      if (input.checked) chosen.add(input.dataset.shareDrill); else chosen.delete(input.dataset.shareDrill);
      uiState.sharingDrillIds = customCache.filter((drill) => chosen.has(drill.id)).map((drill) => drill.id);
      void render("sharing");
    }));
    document.querySelector("[data-share-select-all]:not(:disabled)")?.addEventListener("click", () => {
      uiState.sharingDrillIds = customCache.map((drill) => drill.id);
      void render("sharing");
    });
    document.querySelector("[data-share-clear]:not(:disabled)")?.addEventListener("click", () => {
      uiState.sharingDrillIds = [];
      void render("sharing");
    });
    document.querySelector("[data-share-download]:not(:disabled)")?.addEventListener("click", async () => {
      try {
        const bundle = await sharingService.create({ ids: uiState.sharingDrillIds, title: uiState.sharingTitle, note: uiState.sharingNote });
        downloadJson(bundle.payload, bundle.filename);
        sharingMessage = `Downloaded ${bundle.summary.drills} validated drill${bundle.summary.drills === 1 ? "" : "s"} as ${bundle.filename}.`;
      } catch (error) { sharingMessage = `Share pack blocked: ${error.message}`; }
      await render("sharing");
    });
    document.querySelector("[data-share-native]:not(:disabled)")?.addEventListener("click", async () => {
      try {
        const bundle = await sharingService.create({ ids: uiState.sharingDrillIds, title: uiState.sharingTitle, note: uiState.sharingNote });
        await sharingService.share(bundle);
        sharingMessage = `Shared ${bundle.filename} through the device share sheet.`;
      } catch (error) {
        sharingMessage = error.name === "AbortError" ? "Sharing cancelled; no file was sent by Nova Prime." : `System sharing blocked: ${error.message}`;
      }
      await render("sharing");
    });
    document.querySelector("#share-import-file")?.addEventListener("change", async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_SHARE_BYTES) throw new Error("File exceeds the 1 MB safety limit");
        const payload = JSON.parse(await file.text());
        const summary = sharingService.preview(payload);
        sharingImportPreview = { payload, summary, filename: file.name };
        sharingMessage = `Validated ${file.name}. Review the preview before importing.`;
      } catch (error) {
        sharingImportPreview = null;
        sharingMessage = `Import preview blocked: ${error.message}`;
      }
      await render("sharing");
    });
    document.querySelector("#share-import-clear")?.addEventListener("click", () => {
      sharingImportPreview = null;
      sharingMessage = "Import preview cancelled; no local data changed.";
      void render("sharing");
    });
    document.querySelector("#share-import-confirm")?.addEventListener("click", async () => {
      if (!sharingImportPreview) return;
      try {
        const result = await sharingService.import(sharingImportPreview.payload);
        sharingMessage = `Imported ${result.added} drill${result.added === 1 ? "" : "s"}. Conflicting identities and names were resolved safely.`;
        sharingImportPreview = null;
        await refreshCustomCache();
      } catch (error) { sharingMessage = `Import blocked without changes: ${error.message}`; }
      await render("sharing");
    });
  }
  if (route === "statistics") {
    document.querySelectorAll("[data-statistics-period]").forEach((button) => button.addEventListener("click", () => {
      uiState.statisticsPeriod = button.dataset.statisticsPeriod === "all" ? "all" : Number(button.dataset.statisticsPeriod);
      void render("statistics");
    }));
  }
  if (route === "train") {
    document.querySelector("[data-calibration-open]")?.addEventListener("click", () => calibrationWizard.open(calibrationProfile, false));
    document.querySelector("[data-calibration-quick]")?.addEventListener("click", () => calibrationWizard.open(calibrationProfile, true));
    document.querySelector("[data-calibration-export]")?.addEventListener("click", async () => downloadJson(await calibrationService.export(), `nova-prime-calibration-${new Date().toISOString().slice(0, 10)}.json`));
    document.querySelector("[data-calibration-import]")?.addEventListener("change", async (event) => {
      try {
        const file = event.target.files?.[0]; if (!file) return;
        const result = await calibrationService.import(JSON.parse(await file.text()));
        calibrationProfile = result.profiles[0] ?? null;
        calibrationMessage = `Imported ${result.imported} calibration profile${result.imported === 1 ? "" : "s"}.`;
      } catch (error) { calibrationMessage = `Import blocked: ${error.message}`; }
      await render("train");
    });
    document.querySelectorAll("[data-level]").forEach((button) => button.addEventListener("click", () => { uiState.level = Number(button.dataset.level); void render("train"); }));
    document.querySelectorAll("[data-ui-mode]:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
      uiState.mode = button.dataset.uiMode;
      uiState.amount = uiState.mode === "time" ? 60 : 10;
      if (uiState.mode === "music" && !uiState.playlistId && uiState.quickTrackIds.length === 0) uiState.playlistId = playlistCache[0]?.id ?? null;
      if (uiState.mode === "msync" && !uiState.msyncTrackId) uiState.msyncTrackId = trackCache.find((track) => track.msyncAttachmentId)?.id ?? null;
      musicMessage = "";
      msyncMessage = "";
      void render("train");
    }));
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
      if (form.has("amount")) uiState.amount = Number(form.get("amount"));
      if (form.has("pause")) uiState.pauseSeconds = Number(form.get("pause"));
      if (form.has("countdown")) uiState.countdownSeconds = Number(form.get("countdown"));
      if (form.has("robotLead")) uiState.robotLeadSeconds = Number(form.get("robotLead"));
      if (event.target.name === "msyncTrack") {
        uiState.msyncTrackId = form.get("msyncTrack");
        const attachment = msyncCache.find((item) => item.id === trackCache.find((track) => track.id === uiState.msyncTrackId)?.msyncAttachmentId);
        uiState.robotLeadSeconds = attachment?.parsed?.session?.robotLead ?? uiState.robotLeadSeconds;
        void render("train");
      }
      if (event.target.name === "musicSource") {
        uiState.playlistId = form.get("musicSource") === "quick" ? null : form.get("musicSource");
        void render("train");
      }
    });
    document.querySelector("#session-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (uiState.mode === "msync") {
        uiState.msyncTrackId = form.get("msyncTrack");
        uiState.robotLeadSeconds = Number(form.get("robotLead"));
        const track = trackCache.find((item) => item.id === uiState.msyncTrackId);
        try {
          if (!track?.msyncAttachmentId) throw new Error("Choose a track with a validated MSYNC timeline");
          const checked = await msyncService.revalidate(track.msyncAttachmentId);
          if (!checked.valid) {
            msyncIssues = checked.validation.issues;
            throw new Error(checked.validation.errors[0]?.message ?? "MSYNC revalidation failed");
          }
          const spec = createSessionSpec({ mode: "msync", level: uiState.level, msyncAttachmentId: checked.attachment.id, pauseSeconds: 0 });
          const result = controller.start(spec, { countdownSeconds: 0 });
          if (result.status !== "EXECUTED") throw new Error("MSYNC simulation could not start");
          msyncSimulator.start(checked.validation.parsed, { robotLeadSeconds: uiState.robotLeadSeconds });
          msyncMessage = `Simulating ${track.displayName}.`;
          await audioPlayer.start([checked.track]);
        } catch (error) {
          msyncMessage = error.message;
          msyncSimulator.stop();
          if (controller.snapshot().spec?.mode === "msync") controller.fail("MSYNC_START_FAILED");
        }
      } else if (uiState.mode === "music") {
        uiState.playlistId = form.get("musicSource") === "quick" ? null : form.get("musicSource");
        try {
          const selection = await musicLibrary.resolve({ playlistId: uiState.playlistId, quickTrackIds: uiState.playlistId ? [] : uiState.quickTrackIds });
          const spec = createSessionSpec({ mode: "music", level: uiState.level, drillId: uiState.drillId, playlistId: uiState.playlistId, quickTrackIds: uiState.playlistId ? [] : uiState.quickTrackIds, pauseSeconds: 0 });
          const result = controller.start(spec, { countdownSeconds: 0 });
          if (result.status !== "EXECUTED") throw new Error("Music session could not start");
          musicMessage = `Playing ${selection.label}.`;
          await audioPlayer.start(selection.tracks);
        } catch (error) {
          musicMessage = error.message;
          if (controller.snapshot().spec?.mode === "music") controller.fail("AUDIO_START_FAILED");
        }
      } else {
        uiState.amount = Number(form.get("amount"));
        uiState.pauseSeconds = Number(form.get("pause"));
        uiState.countdownSeconds = Number(form.get("countdown"));
        const spec = createSessionSpec({ mode: uiState.mode, level: uiState.level, drillId: uiState.drillId, repetitions: uiState.mode === "reps" ? uiState.amount : 10, durationSeconds: uiState.mode === "time" ? uiState.amount : 60, pauseSeconds: uiState.pauseSeconds });
        controller.start(spec, { countdownSeconds: uiState.countdownSeconds });
      }
      await render("train");
    });
    document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", async () => {
      const command = button.dataset.command;
      const musicSession = controller.snapshot().spec?.mode === "music";
      const msyncSession = controller.snapshot().spec?.mode === "msync";
      if (command === "pause") { if (musicSession || msyncSession) audioPlayer.pause(); if (msyncSession) msyncSimulator.pause(); controller.pause(); }
      if (command === "resume") { if (musicSession || msyncSession) await audioPlayer.resume(); if (msyncSession) msyncSimulator.resume(); controller.resume(); }
      if (command === "stop") { if (musicSession || msyncSession) audioPlayer.stop(); if (msyncSession) msyncSimulator.stop(); controller.stop(); }
      if (command === "reset") { if (musicSession || msyncSession) audioPlayer.stop(); if (msyncSession) msyncSimulator.stop(); controller.reset(); }
      await render("train");
    }));
  }

  if (route === "msync") {
    document.querySelector("#msync-import-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const file = form.get("msyncFile");
      try {
        const result = await msyncService.attach(file, form.get("trackId"));
        msyncIssues = result.validation.issues;
        if (!result.attached) {
          msyncMessage = `Not attached: ${result.validation.errors.length} validation error${result.validation.errors.length === 1 ? "" : "s"}.`;
        } else {
          uiState.msyncTrackId = result.track.id;
          uiState.robotLeadSeconds = result.attachment.parsed.session.robotLead;
          msyncMessage = `Validated and attached ${file.name}.`;
        }
      } catch (error) {
        msyncIssues = [];
        msyncMessage = `Import blocked: ${error.message}`;
      }
      await render("msync");
    });
    document.querySelectorAll("[data-msync-use]").forEach((button) => button.addEventListener("click", () => {
      uiState.mode = "msync";
      uiState.msyncTrackId = button.dataset.msyncUse;
      const attachment = msyncCache.find((item) => item.id === trackCache.find((track) => track.id === uiState.msyncTrackId)?.msyncAttachmentId);
      uiState.robotLeadSeconds = attachment?.parsed?.session?.robotLead ?? 1.3;
      location.hash = "#train";
    }));
    document.querySelectorAll("[data-msync-export]").forEach((button) => button.addEventListener("click", () => {
      const attachment = msyncCache.find((item) => item.id === button.dataset.msyncExport);
      if (attachment) downloadText(attachment.sourceText, attachment.sourceFilename);
    }));
    document.querySelectorAll("[data-msync-remove]").forEach((button) => button.addEventListener("click", async () => {
      const track = trackCache.find((item) => item.id === button.dataset.msyncRemove);
      if (!track || !globalThis.confirm(`Remove the MSYNC timeline from “${track.displayName}”? The audio will remain stored.`)) return;
      await msyncService.remove(track.id);
      msyncIssues = [];
      msyncMessage = "MSYNC timeline removed; audio remains stored.";
      await render("msync");
    }));
  }

  if (route === "music") {
    document.querySelector("#music-import")?.addEventListener("change", async (event) => {
      try {
        const result = await musicLibrary.importFiles(event.target.files);
        musicMessage = `Imported ${result.imported.length} track${result.imported.length === 1 ? "" : "s"}${result.duplicates.length ? `; skipped ${result.duplicates.length} duplicate${result.duplicates.length === 1 ? "" : "s"}` : ""}.`;
      } catch (error) { musicMessage = `Import blocked: ${error.message}`; }
      await render("music");
    });
    document.querySelectorAll("[data-quick-track]").forEach((input) => input.addEventListener("change", () => {
      const selected = new Set(uiState.quickTrackIds);
      input.checked ? selected.add(input.dataset.quickTrack) : selected.delete(input.dataset.quickTrack);
      uiState.quickTrackIds = trackCache.filter((track) => selected.has(track.id)).map((track) => track.id);
      void render("music");
    }));
    document.querySelector("#quick-music-use")?.addEventListener("click", () => {
      uiState.mode = "music";
      uiState.playlistId = null;
      location.hash = "#train";
    });
    document.querySelector("#playlist-create")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const playlist = await musicLibrary.createPlaylist(new FormData(event.currentTarget).get("name"), uiState.quickTrackIds);
        uiState.playlistId = playlist.id;
        musicMessage = `Created ${playlist.name}.`;
      } catch (error) { musicMessage = error.message; }
      await render("music");
    });
    document.querySelectorAll("[data-track-rename]").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try { await musicLibrary.renameTrack(form.dataset.trackRename, new FormData(form).get("name")); musicMessage = "Track renamed."; }
      catch (error) { musicMessage = error.message; }
      await render("music");
    }));
    document.querySelectorAll("[data-track-delete]").forEach((button) => button.addEventListener("click", async () => {
      const track = trackCache.find((item) => item.id === button.dataset.trackDelete);
      if (!track || !globalThis.confirm(`Delete “${track.displayName}” from this device?`)) return;
      try { await musicLibrary.deleteTrack(track.id); uiState.quickTrackIds = uiState.quickTrackIds.filter((id) => id !== track.id); musicMessage = "Track deleted."; }
      catch (error) { musicMessage = error.message; }
      await render("music");
    }));
    document.querySelectorAll("[data-playlist-rename]").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const playlist = playlistCache.find((item) => item.id === form.dataset.playlistRename);
      try { await musicLibrary.updatePlaylist(playlist.id, { name: new FormData(form).get("name"), trackIds: [...playlist.items].sort((a, b) => a.order - b.order).map((item) => item.trackId) }); musicMessage = "Playlist renamed."; }
      catch (error) { musicMessage = error.message; }
      await render("music");
    }));
    document.querySelectorAll("[data-playlist-move]").forEach((button) => button.addEventListener("click", async () => {
      const playlist = playlistCache.find((item) => item.id === button.dataset.playlistMove);
      const ids = [...playlist.items].sort((a, b) => a.order - b.order).map((item) => item.trackId);
      const from = Number(button.dataset.index); const to = from + Number(button.dataset.direction);
      [ids[from], ids[to]] = [ids[to], ids[from]];
      await musicLibrary.updatePlaylist(playlist.id, { name: playlist.name, trackIds: ids });
      await render("music");
    }));
    document.querySelectorAll("[data-playlist-remove]").forEach((button) => button.addEventListener("click", async () => {
      const playlist = playlistCache.find((item) => item.id === button.dataset.playlistRemove);
      const ids = [...playlist.items].sort((a, b) => a.order - b.order).map((item) => item.trackId);
      ids.splice(Number(button.dataset.index), 1);
      if (ids.length === 0) { musicMessage = "A playlist needs at least one track; delete the playlist instead."; await render("music"); return; }
      await musicLibrary.updatePlaylist(playlist.id, { name: playlist.name, trackIds: ids });
      await render("music");
    }));
    document.querySelectorAll("[data-playlist-add]").forEach((button) => button.addEventListener("click", async () => {
      const playlist = playlistCache.find((item) => item.id === button.dataset.playlistAdd);
      const select = document.querySelector(`[data-playlist-add-select="${CSS.escape(playlist.id)}"]`);
      const ids = [...playlist.items].sort((a, b) => a.order - b.order).map((item) => item.trackId);
      ids.push(select.value);
      await musicLibrary.updatePlaylist(playlist.id, { name: playlist.name, trackIds: ids });
      await render("music");
    }));
    document.querySelectorAll("[data-playlist-use]").forEach((button) => button.addEventListener("click", () => {
      uiState.mode = "music";
      uiState.playlistId = button.dataset.playlistUse;
      location.hash = "#train";
    }));
    document.querySelectorAll("[data-playlist-delete]").forEach((button) => button.addEventListener("click", async () => {
      const playlist = playlistCache.find((item) => item.id === button.dataset.playlistDelete);
      if (!playlist || !globalThis.confirm(`Delete playlist “${playlist.name}”? Audio tracks will remain stored.`)) return;
      await musicLibrary.deletePlaylist(playlist.id);
      if (uiState.playlistId === playlist.id) uiState.playlistId = null;
      musicMessage = "Playlist deleted.";
      await render("music");
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

appReady = true;
createRouter({ onRoute: (route) => void render(route) }).start();
document.querySelector("#build-version").textContent = "v0.5.0-sharing.0";
await refreshFooter();

setInterval(() => {
  if ([SESSION_STATES.COUNTDOWN, SESSION_STATES.RUNNING].includes(controller.state)) {
    controller.tick(1);
    if (controller.snapshot().spec?.mode === "msync" && musicSnapshot?.state === "playing") msyncSimulator.advance((musicSnapshot.currentTime ?? 0) * 1000);
    if (activeRoute === "train") void render("train");
  }
}, 1000);

globalThis.NOVA_PRIME_FOUNDATION = Object.freeze({ capabilities, featureFlags: FEATURE_FLAGS, storage: store.kind });
