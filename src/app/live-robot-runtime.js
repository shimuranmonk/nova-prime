import { BALL_LIMITS, BALL_TYPES, spinLimitForSpeed } from "../domain/drills/schema.js";
import { LiveMsync } from "../application/msync/live-msync.js";
import { NovaRobotConnection } from "../application/robot/nova-robot-connection.js";
import { RobotDiagnostics } from "../application/robot/robot-diagnostics.js";
import { RobotExecutor } from "../application/robot/robot-executor.js";
import { RobotSafetyMonitor } from "../application/robot/robot-safety-monitor.js";
import { encodeDrillPacket } from "../infrastructure/robot/nova-protocol.js";
import { WebBluetoothTransport } from "../infrastructure/robot/web-bluetooth-transport.js";

function countPacketBalls(packet, amount = 1) {
  if (!packet || packet.length < 31 || (packet.length - 7) % 24 !== 0) return 0;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  let balls = 0;
  for (let offset = 7; offset < packet.length; offset += 24) balls += Math.max(1, view.getUint32(offset + 20, true));
  return balls * Math.max(1, Number(amount) || 1);
}

function toInlineProgram(balls = []) {
  return { steps: balls.map((ball, index) => ({ id: `msync-${index}`, enabled: true, scatter: ball.scatter || 0, variants: [{
    speed: ball.speed, spin: ball.spin, type: ball.type || "top", height: ball.height, drop: ball.drop,
    bpm: ball.bpm, repetitions: ball.reps || 1,
  }] })) };
}

export function mountLiveRobotControls(bridge, { testOnly = globalThis.NOVA_PRIME_FULL_TEST_BUILD === true, now = () => performance.now(), idleDisconnectMs = 120000 } = {}) {
  const diagnostics = new RobotDiagnostics({ limit: 200 });
  const transport = new WebBluetoothTransport();
  const connection = new NovaRobotConnection({ transport, diagnostics });
  const executor = new RobotExecutor({ connection, diagnostics });
  const safety = new RobotSafetyMonitor({ executor, diagnostics });
  const panel = document.createElement("section");
  panel.className = testOnly ? "full-physical-test-panel" : "robot-live-controls";
  panel.setAttribute("aria-label", testOnly ? "Full physical test controls" : "Robot connection controls");
  panel.innerHTML = testOnly ? `
    <div class="full-physical-test-heading"><div><strong>PHYSICAL TEST BUILD · all modes send robot commands</strong><p id="full-test-status" role="status">Disconnected. Production remains gated.</p></div><span id="full-test-connection">DISCONNECTED</span></div>
    <div class="full-test-safety">
      <label><input id="full-test-area" type="checkbox"> Launch area is clear</label>
      <label><input id="full-test-power" type="checkbox"> Physical power switch/plug is within reach</label>
    </div>
    <div class="full-test-actions">
      <button id="full-test-connect" type="button" disabled>Connect robot</button>
      <button id="full-test-disconnect" type="button" disabled>Disconnect safely</button>
      <button id="full-test-stop" type="button" class="full-test-stop" disabled>STOP ROBOT</button>
    </div>
    <p class="full-test-note">Select a drill and mode in Training, then use its Start button. Every physical session requires a confirmation. Backgrounding sends Stop; return never resumes automatically.</p>
    <details><summary>Connection diagnostics</summary><ol id="full-test-diagnostics" aria-live="polite"></ol></details>` : `
    <div class="robot-live-heading"><div><span class="connection-dot"></span><div><h2 id="full-test-connection">Disconnected</h2><p id="full-test-status" role="status">Connect to your Nova S Pro to start robot training.</p></div></div>
      <div class="robot-live-actions"><button id="full-test-connect" type="button" disabled>Connect</button><button id="full-test-disconnect" type="button" disabled>Disconnect</button><button id="full-test-stop" type="button" class="full-test-stop" disabled>Stop robot</button></div>
    </div>`;
  const headerButton = document.createElement("button");
  headerButton.type = "button"; headerButton.className = "icon-button robot-connect-toggle";
  const connectionIcon = (ready) => `<img src="${new URL(ready ? "../assets/icons/robot-disconnect.svg" : "../assets/icons/robot-connect.svg", import.meta.url).href}" width="32" height="32" alt="" aria-hidden="true">`;
  headerButton.innerHTML = connectionIcon(false);
  if (!testOnly) { panel.hidden = true; document.querySelector("#menu-toggle").before(headerButton); }
  const safetyFeedback = document.createElement("p");
  safetyFeedback.className = "connection-feedback robot-safety-feedback";
  safetyFeedback.setAttribute("role", "alert"); safetyFeedback.hidden = true;
  if (!testOnly) document.querySelector("#route-view")?.before(safetyFeedback);
  const host = document.querySelector("#robot-control-root");
  if (host) host.append(panel);
  else document.querySelector("#route-view")?.before(panel);

  const area = panel.querySelector("#full-test-area");
  const power = panel.querySelector("#full-test-power");
  const connectButton = panel.querySelector("#full-test-connect");
  const disconnectButton = panel.querySelector("#full-test-disconnect");
  const stopButton = panel.querySelector("#full-test-stop");
  const status = panel.querySelector("#full-test-status");
  const stateLabel = panel.querySelector("#full-test-connection");
  const diagnosticsList = panel.querySelector("#full-test-diagnostics");
  let pending = false;
  let runContext = null;
  let lastMsyncEventCount = 0;
  let liveMsync = null;
  let preparationGeneration = 0;
  let sessionStartPending = false;
  let calibrationShot = null;
  const cancelPreparation = () => {
    preparationGeneration += 1;
    sessionStartPending = false;
    calibrationShot?.resolve("cancelled");
  };
  const assertPreparation = (generation) => { if (generation !== preparationGeneration || !connection.ready || document.visibilityState === "hidden") throw new Error("LIVE_START_CANCELLED"); };
  const finiteCompletions = [];
  let idleTimer = null;
  let completionTimer = null;
  const clearCompletionDeadline = () => { clearTimeout(completionTimer); completionTimer = null; };
  function refreshIdleGuard() {
    const active = calibrationShot || ["RUNNING", "COUNTDOWN"].includes(bridge.controller.state);
    if (!connection.ready || active) { clearTimeout(idleTimer); idleTimer = null; return; }
    if (idleTimer !== null) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!connection.ready || calibrationShot || ["RUNNING", "COUNTDOWN"].includes(bridge.controller.state)) return;
      void disconnectSafely().then(() => {
        status.textContent = "Disconnected after two minutes without active training. Motor power is unverified; switch off when unused.";
        paint();
      }).catch(error => { status.textContent = `Idle Stop failed (${error.message}); switch off physical power.`; paint(); });
    }, idleDisconnectMs);
    idleTimer?.unref?.();
  }
  function expectedPacketDuration(packet, mode) {
    if (mode === "time") return packet[4] * 1000;
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    let cycleMs = 0;
    for (let offset = 7; offset + 24 <= packet.length; offset += 24) {
      cycleMs += 1000 * view.getUint32(offset + 20, true) / Math.max(0.5, view.getFloat32(offset + 16, true));
    }
    return cycleMs * packet[4];
  }
  function armCompletionDeadline(context, packet) {
    clearCompletionDeadline();
    const expectedMs = expectedPacketDuration(packet, context.mode);
    if (context.mode === "time") {
      completionTimer = setTimeout(() => {
        if (runContext === context && bridge.controller.state === "RUNNING") void finishLiveSession(context);
      }, expectedMs);
      return;
    }
    // Duration estimates are watchdog bounds, never grounds for discarding DONE.
    const configuredPause = bridge.controller.snapshot().spec?.pauseSeconds || 0;
    const allowanceMs = Math.max(5000, expectedMs * 0.2) + configuredPause * 1000 * packet[4];
    completionTimer = setTimeout(() => {
      completionTimer = null;
      if (runContext === context && !context.failed && !context.completing && bridge.controller.state === "RUNNING") {
        void failLiveSession("ROBOT_COMPLETION_TIMEOUT");
      }
    }, expectedMs + allowanceMs);
    completionTimer?.unref?.();
  }

  function paintSafetyFeedback() {
    if (testOnly) return;
    const message = document.querySelector("#robot-connection-message");
    const feedback = /failed|unavailable|requires|first\.|canceled|cancelled|unverified|physical power/i.test(status.textContent) ? status.textContent : "";
    if (message && message.textContent !== feedback) message.textContent = feedback;
    safetyFeedback.hidden = Boolean(message) || !feedback;
    if (safetyFeedback.textContent !== feedback) safetyFeedback.textContent = feedback;
  }
  const updateLabels = () => {
    paintSafetyFeedback();
    const currentHost = document.querySelector("#robot-control-root");
    if (testOnly && currentHost && panel.parentElement !== currentHost) currentHost.append(panel);
    if (!testOnly) {
      for (const button of document.querySelectorAll("#route-view button")) {
        const label = button.textContent.trim();
        if (label === "Start dry run") button.textContent = "Start robot training";
        else if (label === "Start Music session") button.textContent = "Start Music training";
        else if (label === "Start MSYNC simulation") button.textContent = "Start MSYNC training";
      }
      const setupPill = document.querySelector("#route-view .setup-card .simulation-pill");
      const readyLabel = connection.ready ? "Robot ready" : "Disconnected";
      if (setupPill && setupPill.textContent !== readyLabel) setupPill.textContent = readyLabel;
      const sessionPill = document.querySelector("#route-view .session-console .simulation-pill");
      if (sessionPill && sessionPill.textContent !== "Live robot") sessionPill.textContent = "Live robot";
      const countdownLabel = document.querySelector("#route-view .countdown-screen .eyebrow");
      if (countdownLabel && countdownLabel.textContent !== "STARTING AUDIO" && countdownLabel.textContent !== "GET READY · LIVE ROBOT") countdownLabel.textContent = "GET READY · LIVE ROBOT";
      const helper = document.querySelector("#route-view .setup-card > .helper-text");
      if (helper?.textContent.includes("Sends no robot commands and records zero dispatched balls.")) helper.textContent = helper.textContent.replace("Sends no robot commands and records zero dispatched balls.", "Training sends commands to the connected Nova S Pro. Keep the launch area clear and power access within reach.");
      const sessionHelper = document.querySelector("#route-view .session-console .helper-text");
      if (sessionHelper?.textContent.includes("planned robot cues are displayed only and never transmitted.")) sessionHelper.textContent = sessionHelper.textContent.replace("planned robot cues are displayed only and never transmitted.", "validated robot cues are transmitted to the connected Nova S Pro.");
      const menuSafety = document.querySelector(".menu-safety");
      if (menuSafety) {
        const heading = menuSafety.querySelector("strong");
        const message = menuSafety.querySelector("span");
        if (heading && heading.textContent !== "Live robot controls") heading.textContent = "Live robot controls";
        if (message && message.textContent !== "Connect to a Nova S Pro to run physical training.") message.textContent = "Connect to a Nova S Pro to run physical training.";
      }
      return;
    }
    document.body.dataset.fullPhysicalTest = "true";
    for (const button of document.querySelectorAll("#route-view button")) {
      const label = button.textContent.trim();
      if (label === "Start dry run") button.textContent = "Start robot training";
      else if (label === "Start Music session") button.textContent = "Start live Music";
      else if (label === "Start MSYNC simulation") button.textContent = "Start live MSYNC";
    }
    const setupPill = document.querySelector("#route-view .setup-card .simulation-pill");
    if (setupPill?.textContent.trim() === "Dry run") setupPill.textContent = "Live test";
    const sessionPill = document.querySelector("#route-view .session-console .simulation-pill");
    if (sessionPill) sessionPill.textContent = "PHYSICAL TEST";
    const countdownLabel = document.querySelector("#route-view .countdown-screen .eyebrow");
    if (countdownLabel?.textContent.includes("DRY RUN")) countdownLabel.textContent = "GET READY · LIVE TEST";
    const helper = document.querySelector("#route-view .setup-card > .helper-text");
    if (helper?.textContent.includes("Sends no robot commands")) helper.textContent = helper.textContent.replace("Sends no robot commands and records zero dispatched balls.", "Live robot commands are enabled in this isolated test build. Confirm the area is clear before every session.");
    const sessionHelper = document.querySelector("#route-view .session-console .helper-text");
    if (sessionHelper?.textContent.includes("never transmitted")) sessionHelper.textContent = sessionHelper.textContent.replace("planned robot cues are displayed only and never transmitted.", "validated robot cues are transmitted in this physical test build.");
    for (const paragraph of document.querySelectorAll("#route-view p")) {
      if (paragraph.textContent.includes("sends no robot commands in this release")) paragraph.textContent = "Validated timelines can send robot cues in this isolated physical-test build; production main remains gated.";
      else if (paragraph.textContent.includes("simulate cues with adjustable Robot Lead without transport")) paragraph.textContent = "Validate exact audio identity and test scheduled cues with adjustable Robot Lead on the connected robot.";
      else if (paragraph.textContent.includes("available in simulation.")) paragraph.textContent = paragraph.textContent.replace("available in simulation.", "available in the isolated physical-test build.");
      else if (paragraph.textContent.includes("Bluetooth stays off until physical tests pass.")) paragraph.textContent = "Production Bluetooth remains gated; live controls are active only in this isolated test copy.";
    }
    const buildVersion = document.querySelector("#build-version");
    if (buildVersion && !buildVersion.textContent.includes("PHYSICAL TEST")) buildVersion.textContent += " · PHYSICAL TEST";
    const menuSafety = document.querySelector(".menu-safety");
    if (menuSafety) {
      menuSafety.querySelector("strong").textContent = "Physical test build";
      menuSafety.querySelector("span").textContent = "Live robot control is available in this test copy only. Production main remains gated.";
    }
  };
  const labelObserver = new MutationObserver(updateLabels);
  labelObserver.observe(document.querySelector("#route-view"), { childList: true, subtree: true, characterData: true });
  updateLabels();

  const preflight = () => area.checked && power.checked;
  function log(type, detail = "") {
    diagnostics.record(type, detail ? { detail } : {});
    if (!diagnosticsList) return;
    const item = document.createElement("li");
    item.textContent = `${new Date().toLocaleTimeString()} · ${type}${detail ? ` · ${detail}` : ""}`;
    diagnosticsList.prepend(item);
    while (diagnosticsList.children.length > 30) diagnosticsList.lastElementChild.remove();
  }
  function paint() {
    const ready = connection.ready;
    connectButton.disabled = pending || (testOnly && !preflight()) || !transport.supported || !globalThis.isSecureContext || ready || ["connecting", "handshake", "auth_1", "auth_2", "auth_3"].includes(connection.state);
    disconnectButton.disabled = pending || !ready;
    stopButton.disabled = pending || !ready;
    stateLabel.textContent = ready ? "CONNECTED · READY" : connection.state.toUpperCase();
    stateLabel.dataset.state = ready ? "ready" : connection.state;
    if (!testOnly) {
      headerButton.disabled = pending || (!ready && (!transport.supported || !globalThis.isSecureContext));
      headerButton.setAttribute("aria-label", ready ? "Disconnect robot" : "Connect robot");
      headerButton.title = ready ? "Disconnect robot" : "Connect robot";
      headerButton.setAttribute("aria-pressed", String(ready));
      if (headerButton.dataset.connected !== String(ready)) {
        headerButton.innerHTML = connectionIcon(ready);
        headerButton.dataset.connected = String(ready);
      }
      updateLabels();
      paintSafetyFeedback();
    }
  }
  for (const input of [area, power].filter(Boolean)) input.addEventListener("change", paint);

  if (!globalThis.isSecureContext) status.textContent = "Bluetooth requires HTTPS or this device’s own localhost/127.0.0.1 server.";
  else if (!transport.supported) status.textContent = "Web Bluetooth is unavailable in this browser. Use Chrome on Android over HTTPS or device-local loopback HTTP.";

  connection.subscribe((event) => {
    if (event?.type === "state") {
      log("connection.state", event.snapshot.state);
      if (event.snapshot.state === "ready") {
        safety.arm();
        status.textContent = "Connected and authenticated. No command has been sent.";
      } else if (event.snapshot.state === "disconnected") {
        cancelPreparation();
        clearCompletionDeadline();
        safety.disarm();
        if (runContext) {
          bridge.audioPlayer.stop();
          bridge.msyncSimulator.stop();
          if (!["COMPLETED", "ERROR", "IDLE"].includes(bridge.controller.state)) bridge.controller.fail("ROBOT_DISCONNECTED");
          runContext = null;
          status.textContent = "Robot disconnected during a session. Audio stopped; no reconnect or resume was attempted. Check the robot physically.";
        } else status.textContent = "Disconnected. Check that the robot is stationary.";
      }
    } else if (event?.type === "error") {
      status.textContent = `Connection failed: ${event.error?.message ?? "unknown error"}. No command is retried automatically.`;
      log("connection.error", event.error?.message ?? "UNKNOWN");
    }
    refreshIdleGuard();
    paint();
  });

  async function priorityStop({ force = false } = {}) {
    if (!connection.ready) return { status: "IGNORED", reason: "DISCONNECTED" };
    const result = await executor.stop({ force });
    if (result.status === "SENT") log("priority_stop.sent", `attempts=${result.attempts}`);
    return result;
  }
  async function disconnectSafely() {
    cancelPreparation();
    clearCompletionDeadline();
    if (liveMsync) await liveMsync.stop();
    const result = await priorityStop({ force: true });
    if (result.status !== "SENT") throw new Error("PRIORITY_STOP_NOT_CONFIRMED");
    executor.reset();
    connection.disconnect();
  }
  async function sendStopAndReset() {
    clearCompletionDeadline();
    finiteCompletions.length = 0;
    if (!connection.ready) throw new Error("ROBOT_DISCONNECTED_STOP_UNVERIFIED");
    const result = await priorityStop({ force: true });
    if (result.status !== "SENT") throw new Error("PRIORITY_STOP_NOT_CONFIRMED");
    if (executor.state === "stopped") executor.reset();
  }

  headerButton.addEventListener("click", () => {
    if (connection.ready) disconnectButton.click(); else connectButton.click();
  });

  connectButton.addEventListener("click", async () => {
    if ((testOnly && !preflight()) || pending) return;
    pending = true; paint();
    status.textContent = "Choose the Nova S Pro in the browser dialog. No ball command is sent by connecting.";
    try {
      await connection.connect();
      await priorityStop({ force: true });
      if (executor.state === "stopped") executor.reset();
      status.textContent = "Connected; initial Stop written. Check that the robot is stationary.";
      log("connection.ready");
    } catch (error) {
      status.textContent = error?.name === "NotFoundError" ? "Device chooser canceled; Connect is available again." : `Connection failed (${error?.message ?? "UNKNOWN"}).`;
      log(error?.name === "NotFoundError" ? "connection.chooser_cancelled" : "connection.failed");
    } finally { pending = false; paint(); }
  });
  disconnectButton.addEventListener("click", async () => {
    if (pending || !connection.ready) return;
    pending = true; paint();
    try { await disconnectSafely(); status.textContent = "Priority Stop sent, then disconnected."; }
    catch (error) { status.textContent = `Safe disconnect failed (${error.message}). Use physical power if the robot is not stationary.`; }
    finally { pending = false; paint(); }
  });
  stopButton.addEventListener("click", async () => {
    if (pending || !connection.ready) return;
    cancelPreparation();
    pending = true; paint();
    try {
      if (liveMsync) await liveMsync.stop();
      await sendStopAndReset();
      if (bridge.controller.state === "RUNNING" || bridge.controller.state === "PAUSED" || bridge.controller.state === "COUNTDOWN") bridge.controller.stop();
      status.textContent = "Priority Stop sent. Confirm the robot is physically stationary.";
    } catch (error) { status.textContent = `STOP failed (${error.message}). Use the robot’s physical power control.`; }
    finally { pending = false; paint(); }
  });

  async function startLiveSession(generation) {
    if (!connection.ready) throw new Error("Connect and authenticate the robot first.");
    assertPreparation(generation);
    if (testOnly && !preflight()) throw new Error("Check both physical safety items first.");
    const mode = bridge.uiState.mode;
    const drill = bridge.resolveDrill(bridge.uiState.drillId);
    const program = bridge.programForDrill(drill);
    if (mode !== "msync" && !program) throw new Error("Select a drill before starting.");
    if (testOnly && !globalThis.confirm(`This is a LIVE physical robot session (${mode.toUpperCase()}). Balls may launch. Keep the area clear and physical power within reach. Continue?`)) return;
    let spec;
    let initialPacket = null;
    let audioTracks = null;
    let msync = null;
    if (mode === "msync") {
      const track = bridge.getTrackCache().find((item) => item.id === bridge.uiState.msyncTrackId);
      if (!track?.msyncAttachmentId) throw new Error("Select a track with a validated MSYNC timeline.");
      msync = await bridge.msyncService.revalidate(track.msyncAttachmentId);
      assertPreparation(generation);
      if (!msync.valid) throw new Error(msync.validation.errors[0]?.message ?? "MSYNC validation failed.");
      if (msync.newWarnings?.length && !globalThis.confirm(`${msync.newWarnings.length} new MSYNC warnings:\n${msync.newWarnings.map(w => w.message).join("\n")}\nContinue?`)) return;
      if (msync.newWarnings?.length) await bridge.msyncService.acceptWarnings(msync.attachment.id, msync.validation.warnings);
      assertPreparation(generation);
      spec = bridge.createSessionSpec({ mode, level: bridge.uiState.level, msyncAttachmentId: msync.attachment.id, pauseSeconds: 0 });
    } else if (mode === "music") {
      const form = new FormData(document.querySelector("#session-form"));
      bridge.uiState.playlistId = form.get("musicSource") === "quick" ? null : form.get("musicSource");
      const selection = await bridge.musicLibrary.resolve({ playlistId: bridge.uiState.playlistId, quickTrackIds: bridge.uiState.playlistId ? [] : bridge.uiState.quickTrackIds });
      assertPreparation(generation);
      audioTracks = selection.tracks;
      spec = bridge.createSessionSpec({ mode, level: bridge.uiState.level, drillId: drill.id, randomOrder: bridge.randomOrderFor(drill), playlistId: bridge.uiState.playlistId, quickTrackIds: bridge.uiState.playlistId ? [] : bridge.uiState.quickTrackIds, pauseSeconds: 0 });
      initialPacket = encodeDrillPacket(program, { mode: "endless", amount: 1, randomOrder: spec.randomOrder });
    } else {
      const form = new FormData(document.querySelector("#session-form"));
      const amount = Number(form.get("amount"));
      const pauseSeconds = Number(form.get("pause"));
      if (mode === "time" && amount > 255) throw new Error("Time sessions are limited to 255 seconds per robot command. Set a shorter duration.");
      bridge.uiState.amount = amount;
      bridge.uiState.pauseSeconds = pauseSeconds;
      spec = bridge.createSessionSpec({ mode, level: bridge.uiState.level, drillId: drill.id, randomOrder: bridge.randomOrderFor(drill), repetitions: mode === "reps" ? amount : 10, durationSeconds: mode === "time" ? amount : 60, pauseSeconds });
      initialPacket = encodeDrillPacket(program, { mode: mode === "time" ? "time" : "combos", amount: mode === "time" ? amount : amount, randomOrder: spec.randomOrder });
    }
    if (mode === "reps" && bridge.uiState.amount > 255) throw new Error("Repetitions are limited to 255 per robot command.");
    const ballCount = mode === "reps" ? countPacketBalls(initialPacket, bridge.uiState.amount) : 0;
    if (liveMsync) { await liveMsync.destroy(); liveMsync = null; }
    assertPreparation(generation);
    const result = bridge.controller.start(spec, { countdownSeconds: mode === "msync" ? msync.validation.parsed.session.countdown : 3, liveRun: true, ballsPlanned: ballCount });
    if (result.status !== "EXECUTED") throw new Error("A session is already active or the setup is invalid.");
    runContext = { mode, program, packet: initialPacket, generation, sent: false, failed: false };
    status.textContent = `Live ${mode.toUpperCase()} session armed. Stop remains available above.`;
    if (mode === "music") {
      await bridge.audioPlayer.start(audioTracks);
      assertPreparation(generation);
    } else if (mode === "msync") {
      liveMsync = new LiveMsync({ audioPlayer:bridge.audioPlayer, connection, executor,
        projection:bridge.msyncSimulator, controller:bridge.controller,
        onDiagnostic:event => { log(event.type, event.message || event.reason || ""); if (event.type === "ROBOT_ERROR") void failLiveSession(event.message || "MSYNC_ROBOT_ERROR"); },
        onDispatch:packet => bridge.controller.noteDispatched(countPacketBalls(packet, new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint16(4, true))),
      });
      await liveMsync.start(msync.validation.parsed, msync.track, bridge.uiState.robotLeadSeconds);
    }
    await bridge.render("train");
  }

  document.addEventListener("submit", async (event) => {
    if (!(testOnly ? globalThis.NOVA_PRIME_FULL_TEST_BUILD : true) || !event.target.matches("#session-form")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sessionStartPending || calibrationShot) return;
    sessionStartPending = true;
    const generation = ++preparationGeneration;
    try { await startLiveSession(generation); }
    catch (error) {
      if (error.message === "LIVE_START_CANCELLED" || generation !== preparationGeneration) return;
      if (liveMsync) await liveMsync.destroy().catch(() => {});
      status.textContent = error.message;
      log("session.start_blocked", error.message);
      if (runContext) {
        runContext.failed = true;
        bridge.audioPlayer.stop();
        bridge.msyncSimulator.stop();
        if (connection.ready) await priorityStop({ force: true }).catch(() => {});
        if (!["IDLE", "COMPLETED", "ERROR"].includes(bridge.controller.state)) bridge.controller.fail("LIVE_SESSION_START_FAILED");
        runContext = null;
      }
    } finally { if (generation === preparationGeneration) sessionStartPending = false; paint(); }
  }, true);

  function dispatchReadySession(snapshot) {
    const context = runContext;
    if (!context || context.generation !== preparationGeneration || context.sent || context.failed || context.completing ||
        snapshot.state !== "RUNNING" || context.mode === "msync") return;
    if (context.mode === "music" && bridge.audioPlayer.snapshot().state !== "playing") return;
    context.sent = true;
    const packet = context.packet;
    void (async () => {
      try {
        const result = await executor.start(packet);
        if (runContext !== context || context.failed || context.completing) return;
        if (result.status !== "SENT") throw new Error("ROBOT_PACKET_NOT_SENT");
        if (context.mode !== "music") armCompletionDeadline(context, packet);
        if (context.mode === "reps") {
          context.awaitingDone = true;
          finiteCompletions.push(countPacketBalls(packet, snapshot.spec.repetitions));
        }
        bridge.controller.noteDispatched(countPacketBalls(packet, context.mode === "reps" ? snapshot.spec.repetitions : 1));
        log("executor.session_sent", context.mode);
      } catch (error) {
        if (runContext === context && !context.completing) await failLiveSession(error.message || "LIVE_COMMAND_FAILED");
      }
    })();
  }

  bridge.controller.subscribe((snapshot) => {
    refreshIdleGuard();
    dispatchReadySession(snapshot);
  });

  async function finishLiveSession(context, completedTracks = 0) {
    if (runContext !== context || context.failed || context.completing) return;
    context.completing = true;
    const completedBalls = context.mode === "reps" ? finiteCompletions.shift() : 0;
    try { await sendStopAndReset(); }
    catch (error) {
      if (runContext === context) {
        bridge.controller.fail("COMPLETION_STOP_FAILED");
        runContext = null;
      }
      status.textContent = `Completion Stop failed (${error.message}). Use physical power.`;
      paint();
      return;
    }
    if (runContext !== context || context.failed) return;
    const completedCycles = context.mode === "reps" ? bridge.controller.snapshot().spec.repetitions : completedTracks;
    runContext = null;
    bridge.controller.complete({ completedCycles });
    status.textContent = "Training completed; Stop written. Motor power is not measured.";
    paint();
    if (completedBalls) {
      Promise.resolve().then(() => bridge.recordCompletedBalls(completedBalls)).catch(error => {
        log("statistics.save_failed", error.message);
        status.textContent = `Training completed, but statistics could not be saved (${error.message}). Robot Stop was written; motor power is unverified.`;
        paint();
      });
    }
  }

  connection.subscribe((event) => {
    if (event?.type === "state" && event.snapshot.state === "disconnected") finiteCompletions.length = 0;
    if (event?.type === "done") calibrationShot?.resolve("done");
    const context = runContext;
    if (event?.type === "done" && context?.mode === "reps" && context.awaitingDone &&
        executor.state === "running" && bridge.controller.state === "RUNNING") {
      void finishLiveSession(context);
    }
  });

  async function failLiveSession(code) {
    const context = runContext;
    if (!context || context.failed) return;
    context.failed = true; cancelPreparation();
    clearCompletionDeadline();
    bridge.audioPlayer.stop();
    try {
      if (liveMsync) await liveMsync.stop();
      await priorityStop({ force: true });
      status.textContent = `${code}. Stop written; verify the robot is stationary.`;
    } catch (error) { status.textContent = `${code}. Stop failed (${error.message}); switch off physical power.`; }
    if (!["IDLE", "COMPLETED"].includes(bridge.controller.state)) bridge.controller.fail(code);
    if (runContext === context) runContext = null;
    paint();
  }

  let priorAudioState = bridge.audioPlayer.snapshot().state;
  bridge.audioPlayer.subscribe((snapshot) => {
    const previous = priorAudioState;
    priorAudioState = snapshot.state;
    if (runContext && snapshot.state === "error" && previous !== "error") { void failLiveSession("AUDIO_PLAYBACK_FAILED"); return; }
    if (runContext?.mode === "music" && snapshot.state === "completed" && previous !== "completed") {
      void finishLiveSession(runContext, snapshot.completedTracks);
    }
    if (snapshot.state === "playing") dispatchReadySession(bridge.controller.snapshot());
    if (!liveMsync && runContext?.mode === "msync" && snapshot.state === "completed" && previous !== "completed") {
      void sendStopAndReset().then(() => { status.textContent = "MSYNC audio finished; robot Stop sent."; runContext = null; }).catch((error) => { status.textContent = `MSYNC ended but Stop failed (${error.message}). Use physical power.`; });
    }
  });

  async function fireCalibrationShot(ball) {
    if (!connection.ready) throw new Error("Connect the Nova S Pro before firing.");
    if (document.visibilityState === "hidden" || pending || calibrationShot || sessionStartPending ||
        runContext || bridge.controller.state !== "IDLE" || executor.state !== "idle") {
      throw new Error("The robot must be idle and the app visible before firing.");
    }
    if (testOnly && !preflight()) throw new Error("Complete the physical test safety checks first.");
    if (!BALL_TYPES.includes(ball?.type) || ["speed", "spin", "height", "drop", "bpm"].some(key =>
      !Number.isFinite(ball[key]) || ball[key] < BALL_LIMITS[key][0] || ball[key] > BALL_LIMITS[key][1]) ||
      ball.spin > spinLimitForSpeed(ball.speed)) {
      throw new Error("The calibration shot settings are outside the supported range.");
    }

    const program = { steps: [{ enabled: true, scatter: 0, variants: [{ ...ball, repetitions: 1 }] }] };
    const packet = encodeDrillPacket(program, { mode: "combos", amount: 1 });
    let resolve;
    const completion = new Promise(done => { resolve = done; });
    const generation = preparationGeneration;
    calibrationShot = { resolve };
    refreshIdleGuard();
    const timer = setTimeout(() => resolve("timeout"), 8000);
    try {
      const sent = await executor.start(packet);
      if (sent.status !== "SENT" || generation !== preparationGeneration) return false;
      const outcome = await completion;
      if (generation !== preparationGeneration || outcome === "cancelled") return false;
      await sendStopAndReset();
      if (generation !== preparationGeneration) return false;
      if (outcome !== "done") throw new Error("Shot completion was not reported. Stop was sent. Check the robot before retrying.");
      return true;
    } catch (error) {
      if (generation !== preparationGeneration) return false;
      if (connection.ready && executor.state !== "idle") {
        await sendStopAndReset().catch(() => { connection.disconnect(); });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      calibrationShot = null;
      refreshIdleGuard();
      paint();
    }
  }

  globalThis.NOVA_PRIME_CALIBRATION_FIRE = fireCalibrationShot;

  const executeLiveCommand = async (command) => {
    if (command === "stop") {
      cancelPreparation();
      if (liveMsync) await liveMsync.stop();
      await sendStopAndReset();
      if (bridge.controller.state !== "IDLE" && bridge.controller.state !== "COMPLETED") bridge.controller.stop();
      bridge.audioPlayer.stop(); bridge.msyncSimulator.stop(); runContext = null;
      if (["COMPLETED", "ERROR"].includes(bridge.controller.state)) bridge.controller.reset();
      status.textContent = "Stop written; motor power is unverified. Switch off the robot when unused.";
      refreshIdleGuard();
      paint();
      return { status: "EXECUTED" };
    }
    if (command === "pause") {
      if (runContext?.mode === "msync" && liveMsync) return liveMsync.pause();
      if (!runContext || runContext.completing || !connection.ready) return { status: "REJECTED" };
      const context = runContext;
      const generation = preparationGeneration;
      context.awaitingDone = false;
      clearCompletionDeadline();
      const result = await executor.pause();
      if (runContext !== context || generation !== preparationGeneration) return { status: "CANCELLED" };
      if (result.status !== "SENT") return result;
      if (["music", "msync"].includes(runContext.mode)) bridge.audioPlayer.pause();
      if (runContext.mode === "msync") bridge.msyncSimulator.pause();
      bridge.controller.pause();
      status.textContent = "Stop written for Pause; motor power is unverified. Resume restarts the remaining program.";
      return result;
    }
    if (command === "resume") {
      if (runContext?.mode === "msync" && liveMsync) return liveMsync.resume();
      if (!runContext || !connection.ready || executor.state !== "paused") return { status: "REJECTED" };
      const context = runContext;
      const generation = preparationGeneration;
      const snapshot = bridge.controller.snapshot();
      const options = { mode: runContext.mode === "time" ? "time" : runContext.mode === "music" ? "endless" : "combos",
        amount: runContext.mode === "time" ? Math.max(1, Math.ceil(snapshot.spec.durationSeconds - snapshot.elapsedSeconds))
          : runContext.mode === "reps" ? Math.max(1, snapshot.spec.repetitions - snapshot.completedCycles) : 1,
        randomOrder: snapshot.spec.randomOrder };
      const packet = encodeDrillPacket(runContext.program, options);
      context.awaitingDone = false;
      const result = await executor.resume(packet);
      if (runContext !== context || generation !== preparationGeneration) return { status: "CANCELLED" };
      if (result.status === "SENT") {
        if (["music", "msync"].includes(context.mode)) {
          const resumed = await bridge.audioPlayer.resume();
          if (runContext !== context || generation !== preparationGeneration) return { status: "CANCELLED" };
          if (!resumed) throw new Error("AUDIO_RESUME_FAILED");
        }
        if (runContext.mode === "msync") bridge.msyncSimulator.resume();
        bridge.controller.resume();
        runContext.sent = true;
        if (["reps", "time"].includes(runContext.mode)) { runContext.awaitingDone = runContext.mode === "reps"; armCompletionDeadline(runContext, packet); }
        status.textContent = "Resumed. Verify the robot follows the remaining session.";
      }
      return result;
    }
    if (command === "reset") {
      cancelPreparation();
      if (liveMsync) { await liveMsync.destroy(); liveMsync = null; }
      if (["COMPLETED", "ERROR"].includes(bridge.controller.state)) {
        if (["stopped", "error"].includes(executor.state)) executor.reset();
        else if (executor.state !== "idle") {
          await sendStopAndReset();
        }
        runContext = null; bridge.controller.reset();
        return { status: "EXECUTED" };
      }
    }
    return { status: "REJECTED" };
  };
  globalThis.NOVA_PRIME_LIVE_COMMAND = async command => {
    try { return await executeLiveCommand(command); }
    catch (error) {
      cancelPreparation(); clearCompletionDeadline();
      bridge.audioPlayer.stop();
      if (liveMsync) void liveMsync.stop().catch(() => {});
      try { await priorityStop({ force: true }); } catch { /* Bounded executor retry already disconnects. */ }
      connection.disconnect(); runContext = null;
      if (!["IDLE", "COMPLETED"].includes(bridge.controller.state)) bridge.controller.fail("ROBOT_COMMAND_FAILED");
      status.textContent = `Robot command failed (${error.message}); connection closed. Motor power is unverified; switch off physical power.`;
      paint();
      return { status: "FAILED", reason: error.message, motorPower: "unknown" };
    }
  };
  if (testOnly) globalThis.NOVA_PRIME_FULL_TEST_COMMAND = globalThis.NOVA_PRIME_LIVE_COMMAND;

  window.addEventListener("pagehide", () => {
    cancelPreparation(); clearCompletionDeadline();
    bridge.audioPlayer.stop();
    if (connection.ready) void disconnectSafely().catch(() => {});
    runContext = null;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    cancelPreparation(); clearCompletionDeadline();
    bridge.audioPlayer.stop();
    if (connection.ready) void disconnectSafely().catch(error => {
      status.textContent = `Background Stop failed (${error.message}); switch off physical power.`; paint();
    });
    if (["RUNNING", "PAUSED", "COUNTDOWN"].includes(bridge.controller.state)) bridge.controller.stop();
    runContext = null;
  });
  paint();
}
