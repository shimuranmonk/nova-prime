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

export function mountLiveRobotControls(bridge, { testOnly = globalThis.NOVA_PRIME_FULL_TEST_BUILD === true } = {}) {
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
  let dispatchedPrograms = 0;
  let lastMsyncEventCount = 0;
  let liveMsync = null;
  let preparationGeneration = 0;
  const cancelPreparation = () => { preparationGeneration += 1; };
  const assertPreparation = (generation) => { if (generation !== preparationGeneration || !connection.ready || document.visibilityState === "hidden") throw new Error("LIVE_START_CANCELLED"); };
  const finiteCompletions = [];

  const updateLabels = () => {
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
      if (countdownLabel && countdownLabel.textContent !== "GET READY · LIVE ROBOT") countdownLabel.textContent = "GET READY · LIVE ROBOT";
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
    const calibrationIntro = document.querySelector("#route-view .page-heading h1");
    if (calibrationIntro?.textContent === "Calibration") {
      const description = calibrationIntro.parentElement.querySelector("p");
      if (description) description.textContent = "Calibration profiles and observed landings remain available. Robot-powered calibration shots are not included in this test build.";
    }
    const calibrationGuidance = document.querySelector("#route-view .calibration-guidance");
    if (calibrationGuidance) calibrationGuidance.textContent = "Record observed landings to create a local profile. This test build does not fire calibration balls automatically.";
    for (const paragraph of document.querySelectorAll("#route-view p")) {
      if (paragraph.textContent.includes("sends no robot commands in this release")) paragraph.textContent = "Validated timelines can send robot cues in this isolated physical-test build; production main remains gated.";
      else if (paragraph.textContent.includes("simulate cues with adjustable Robot Lead without transport")) paragraph.textContent = "Validate exact audio identity and test scheduled cues with adjustable Robot Lead on the connected robot.";
      else if (paragraph.textContent.includes("available in simulation.")) paragraph.textContent = paragraph.textContent.replace("available in simulation.", "available in the isolated physical-test build.");
      else if (paragraph.textContent.includes("without robot commands.")) paragraph.textContent = paragraph.textContent.replace("without robot commands.", "using observed landings; automated robot calibration shots are not included.");
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
      const message = document.querySelector("#robot-connection-message");
      const feedback = /failed|unavailable|requires|first\.|canceled|cancelled/i.test(status.textContent) ? status.textContent : "";
      if (message && message.textContent !== feedback) message.textContent = feedback;
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
    if (liveMsync) await liveMsync.stop();
    const result = await priorityStop({ force: true });
    if (result.status !== "SENT") throw new Error("PRIORITY_STOP_NOT_CONFIRMED");
    executor.reset();
    connection.disconnect();
  }
  async function sendProgram(program, options = {}) {
    if (!connection.ready || !program?.steps?.length) throw new Error("ROBOT_NOT_READY_OR_PROGRAM_EMPTY");
    const packet = encodeDrillPacket(program, options);
    const result = ["idle", "stopped", "error"].includes(executor.state)
      ? await executor.start(packet)
      : await executor.enqueue(packet);
    if (result.status !== "SENT") throw new Error("ROBOT_PACKET_NOT_SENT");
    bridge.controller.noteDispatched(countPacketBalls(packet, options.mode === "combos" ? options.amount : 1));
    if (options.mode === "combos") finiteCompletions.push(countPacketBalls(packet, options.amount));
    dispatchedPrograms += 1;
    log("executor.program_sent", `programs=${dispatchedPrograms}`);
    return result;
  }
  async function sendStopAndReset() {
    finiteCompletions.length = 0;
    if (!connection.ready) return;
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
    assertPreparation(generation);
    if (!connection.ready) throw new Error("Connect and authenticate the robot first.");
    if (testOnly && !preflight()) throw new Error("Check both physical safety items first.");
    const mode = bridge.uiState.mode;
    const drill = bridge.resolveDrill(bridge.uiState.drillId);
    const program = bridge.programForDrill(drill);
    if (mode !== "msync" && !program) throw new Error("Select a drill before starting.");
    if (testOnly && !globalThis.confirm(`This is a LIVE physical robot session (${mode.toUpperCase()}). Balls may launch. Keep the area clear and physical power within reach. Continue?`)) return;
    dispatchedPrograms = 0;
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
    const result = bridge.controller.start(spec, { countdownSeconds: mode === "msync" ? msync.validation.parsed.session.countdown : ["reps", "time"].includes(mode) ? 3 : 0, liveRun: true, ballsPlanned: ballCount });
    if (result.status !== "EXECUTED") throw new Error("A session is already active or the setup is invalid.");
    runContext = { mode, program, packet: initialPacket, audioTracks, msyncParsed: msync?.validation.parsed, sent: false, failed: false };
    status.textContent = `Live ${mode.toUpperCase()} session armed. Stop remains available above.`;
    if (mode === "music") {
      await sendProgram(program, { mode: "endless", amount: 1, randomOrder: spec.randomOrder });
      assertPreparation(generation);
      runContext.sent = true;
      await bridge.audioPlayer.start(audioTracks);
      assertPreparation(generation);
    } else if (mode === "msync") {
      liveMsync = new LiveMsync({ audioPlayer:bridge.audioPlayer, connection, executor,
        projection:bridge.msyncSimulator, controller:bridge.controller,
        onDiagnostic:event => { log(event.type, event.message || event.reason || ""); },
        onDispatch:packet => bridge.controller.noteDispatched(countPacketBalls(packet, new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint16(4, true))),
      });
      await liveMsync.start(msync.validation.parsed, msync.track, bridge.uiState.robotLeadSeconds);
    }
    await bridge.render("train");
  }

  let sessionStartPending = false;
  document.addEventListener("submit", async (event) => {
    if (!(testOnly ? globalThis.NOVA_PRIME_FULL_TEST_BUILD : true) || !event.target.matches("#session-form")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sessionStartPending) return;
    sessionStartPending = true;
    const generation = ++preparationGeneration;
    try { await startLiveSession(generation); }
    catch (error) {
      if (error.message === "LIVE_START_CANCELLED") return;
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
    } finally { sessionStartPending = false; }
  }, true);

  bridge.controller.subscribe((snapshot) => {
    if (!runContext || runContext.sent || runContext.failed || snapshot.state !== "RUNNING" || !["reps", "time"].includes(runContext.mode)) return;
    const context = runContext;
    context.sent = true;
    void (async () => {
      try {
        const options = { mode: runContext.mode === "time" ? "time" : "combos", amount: runContext.mode === "time" ? snapshot.spec.durationSeconds : snapshot.spec.repetitions, randomOrder: snapshot.spec.randomOrder };
        if (options.amount > 255) throw new Error("Robot packet count exceeds this firmware profile’s tested limit (255).");
        const packet = encodeDrillPacket(runContext.program, options);
        const result = await executor.start(packet);
        if (result.status !== "SENT") throw new Error("ROBOT_PACKET_NOT_SENT");
        if (runContext !== context || context.failed) return;
        bridge.controller.noteDispatched(countPacketBalls(packet, options.mode === "combos" ? options.amount : 1));
        if (runContext.mode === "reps") finiteCompletions.push(countPacketBalls(packet, options.amount));
        log("executor.session_sent", runContext.mode);
      } catch (error) {
        if (runContext !== context) return;
        runContext.failed = true;
        status.textContent = `Live session start failed (${error.message}). Sending priority Stop.`;
        log("executor.session_failed", error.message);
        await priorityStop({ force: true }).catch(() => {});
        bridge.controller.fail("LIVE_COMMAND_FAILED");
      }
    })();
  });

  connection.subscribe((event) => {
    if (event?.type === "state" && event.snapshot.state === "disconnected") finiteCompletions.length = 0;
    const context = runContext;
    if (event?.type !== "done" || !context || context.failed || context.completing ||
        !["reps", "time"].includes(context.mode) || !context.sent ||
        executor.state !== "running" || bridge.controller.state !== "RUNNING") return;
    context.completing = true;
    const completedBalls = finiteCompletions.shift();
    void (async () => {
      try {
        await priorityStop();
        if (runContext !== context) return;
        if (completedBalls) await bridge.recordCompletedBalls(completedBalls);
        bridge.controller.complete({ completedCycles: context.mode === "reps" ? bridge.controller.snapshot().spec.repetitions : 0 });
        status.textContent = "Sequence completion reported; Stop written. Motor power is not measured.";
      } catch (error) { status.textContent = `Completion Stop failed (${error.message}). Use physical power.`; }
      if (runContext === context) runContext = null;
    })();
  });

  async function failLiveSession(code) {
    const context = runContext;
    if (!context || context.failed) return;
    context.failed = true; cancelPreparation();
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
      void sendStopAndReset().then(() => { status.textContent = "Music finished; robot Stop sent."; runContext = null; }).catch((error) => { status.textContent = `Music ended but Stop failed (${error.message}). Use physical power.`; });
    }
    if (!liveMsync && runContext?.mode === "msync" && snapshot.state === "completed" && previous !== "completed") {
      void sendStopAndReset().then(() => { status.textContent = "MSYNC audio finished; robot Stop sent."; runContext = null; }).catch((error) => { status.textContent = `MSYNC ended but Stop failed (${error.message}). Use physical power.`; });
    }
  });

  globalThis.NOVA_PRIME_LIVE_COMMAND = async (command) => {
    if (command === "stop") {
      cancelPreparation();
      if (liveMsync) await liveMsync.stop();
      await sendStopAndReset();
      if (bridge.controller.state !== "IDLE" && bridge.controller.state !== "COMPLETED") bridge.controller.stop();
      bridge.audioPlayer.stop(); bridge.msyncSimulator.stop(); runContext = null;
      if (["COMPLETED", "ERROR"].includes(bridge.controller.state)) bridge.controller.reset();
      status.textContent = "Priority Stop sent by session controls.";
      return { status: "EXECUTED" };
    }
    if (command === "pause") {
      if (runContext?.mode === "msync" && liveMsync) return liveMsync.pause();
      if (!runContext || !connection.ready) return { status: "REJECTED" };
      const result = await executor.pause();
      if (result.status !== "SENT") return result;
      if (["music", "msync"].includes(runContext.mode)) bridge.audioPlayer.pause();
      if (runContext.mode === "msync") bridge.msyncSimulator.pause();
      bridge.controller.pause();
      status.textContent = "Robot stopped for Pause. Resume starts the selected program again; verify the ball position first.";
      return result;
    }
    if (command === "resume") {
      if (runContext?.mode === "msync" && liveMsync) return liveMsync.resume();
      if (!runContext || !connection.ready || executor.state !== "paused") return { status: "REJECTED" };
      const snapshot = bridge.controller.snapshot();
      const options = { mode: runContext.mode === "time" ? "time" : runContext.mode === "music" ? "endless" : "combos",
        amount: runContext.mode === "time" ? Math.max(1, Math.ceil(snapshot.spec.durationSeconds - snapshot.elapsedSeconds))
          : runContext.mode === "reps" ? Math.max(1, snapshot.spec.repetitions - snapshot.completedCycles) : 1,
        randomOrder: snapshot.spec.randomOrder };
      const packet = encodeDrillPacket(runContext.program, options);
      const result = await executor.resume(packet);
      if (result.status === "SENT") {
        if (["music", "msync"].includes(runContext.mode)) await bridge.audioPlayer.resume();
        if (runContext.mode === "msync") bridge.msyncSimulator.resume();
        bridge.controller.resume();
        runContext.sent = true;
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
  if (testOnly) globalThis.NOVA_PRIME_FULL_TEST_COMMAND = globalThis.NOVA_PRIME_LIVE_COMMAND;

  window.addEventListener("pagehide", () => { cancelPreparation(); void liveMsync?.stop()?.catch(() => {}); runContext = null; });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cancelPreparation();
    if (document.visibilityState === "hidden" && runContext) {
      void liveMsync?.stop()?.catch(() => {});
      status.textContent = "Page hidden: priority Stop requested. Returning will not resume automatically.";
      bridge.controller.stop();
      runContext = null;
    }
  });
  paint();
}
