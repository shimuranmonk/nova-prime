import { RobotDiagnostics } from "../application/robot/robot-diagnostics.js";
import { NovaRobotConnection } from "../application/robot/nova-robot-connection.js";
import { RobotExecutor } from "../application/robot/robot-executor.js";
import { RobotSafetyMonitor } from "../application/robot/robot-safety-monitor.js";
import { encodeDrillPacket } from "../infrastructure/robot/nova-protocol.js";
import { WebBluetoothTransport } from "../infrastructure/robot/web-bluetooth-transport.js";

const diagnostics = new RobotDiagnostics({ limit: 60 });
const transport = new WebBluetoothTransport();
const connection = new NovaRobotConnection({ transport, diagnostics });
const executor = new RobotExecutor({ connection, diagnostics });
const safetyMonitor = new RobotSafetyMonitor({ executor, diagnostics });
const preflightChecks = [...document.querySelectorAll(".safety-check input")];
const connectButton = document.querySelector("#connect-button");
const disconnectButton = document.querySelector("#disconnect-button");
const fireButton = document.querySelector("#fire-button");
const stopButton = document.querySelector("#stop-button");
const connectionTitle = document.querySelector("#connection-title");
const connectionMessage = document.querySelector("#connection-message");
const connectionIndicator = document.querySelector("#connection-indicator");
const browserGuidance = document.querySelector("#browser-guidance");
const shotMessage = document.querySelector("#shot-message");
const diagnosticList = document.querySelector("#diagnostics");
let shotSentThisConnection = false;
let operationPending = false;
let stopPending = false;
let shotSending = false;

const oneBallProgram = Object.freeze({
  steps: Object.freeze([Object.freeze({
    enabled: true,
    scatter: 0,
    variants: Object.freeze([Object.freeze({ speed: 1, spin: 0, type: "top", height: 35, drop: 0, bpm: 30, repetitions: 1 })]),
  })]),
});
const oneBallPacket = encodeDrillPacket(oneBallProgram, { mode: "combos", amount: 1, randomOrder: false });

function preflightComplete() { return preflightChecks.every((input) => input.checked); }
function updateControls() {
  const ready = connection.ready;
  const safeOrigin = globalThis.isSecureContext === true;
  connectButton.disabled = !safeOrigin || !transport.supported || !preflightComplete() || operationPending || ready || connection.state === "connecting" || connection.state === "handshake";
  disconnectButton.disabled = !ready || operationPending;
  fireButton.disabled = !ready || !preflightComplete() || operationPending || shotSentThisConnection || executor.state === "running" || executor.state === "stopping";
  stopButton.disabled = !ready || stopPending || (operationPending && !shotSending);
  connectionTitle.textContent = connection.state === "handshake" ? "Authenticating…" : connection.state === "connecting" ? "Connecting…" : ready ? "Connected · ready" : connection.state === "error" ? "Connection error" : "Disconnected";
  connectionIndicator.dataset.state = ready ? "ready" : connection.state === "error" ? "error" : "disconnected";
}
function addDiagnostic(type, detail = "") {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} · ${type}${detail ? ` · ${detail}` : ""}`;
  diagnosticList.prepend(item);
  while (diagnosticList.children.length > 20) diagnosticList.lastElementChild.remove();
}
preflightChecks.forEach((input) => input.addEventListener("change", updateControls));
browserGuidance.textContent = !globalThis.isSecureContext
  ? "Open this build from HTTPS or the same device’s localhost/127.0.0.1 HTTP server. Bluetooth is blocked on ordinary LAN HTTP."
  : !transport.supported
    ? "Web Bluetooth is unavailable here. Use a supported browser such as Chrome on Android, over HTTPS or device-local loopback HTTP."
    : "Use Chrome on Android over HTTPS or device-local loopback HTTP. Connecting opens the browser’s device chooser.";

connection.subscribe((event) => {
  if (event?.type === "state") {
    addDiagnostic("connection", event.snapshot.state);
    if (event.snapshot.state === "disconnected") {
      safetyMonitor.disarm();
      shotSentThisConnection = false;
      preflightChecks.forEach((input) => { input.checked = false; });
      connectionMessage.textContent = "Disconnected. Verify that the robot is stationary; use physical power if its state is uncertain.";
      shotMessage.textContent = "Connection ended. Robot state is unconfirmed; use physical power if you cannot verify it stopped.";
    }
    if (event.snapshot.state === "ready") {
      safetyMonitor.arm();
      connectionMessage.textContent = "Authenticated. No ball command has been sent.";
      shotMessage.textContent = "One confirmed ball is available for this connection.";
    }
  } else if (event?.type === "error") {
    addDiagnostic("connection.error", event.error?.message ?? "UNKNOWN");
    connectionMessage.textContent = "Connection failed. Check the robot and retry. No shot is sent automatically.";
  } else if (event?.type === "done") {
    addDiagnostic("robot.sequence_complete");
    if (executor.state === "running") {
      shotMessage.textContent = "Robot reported the one-ball sequence complete; sending Stop.";
      void executor.stop().then(() => {
        addDiagnostic("executor.stop_sent", "sequence complete");
        shotMessage.textContent = "Sequence complete; Stop sent. Check the physical landing before continuing.";
        updateControls();
      }).catch(() => {
        shotMessage.textContent = "Priority Stop failed. Use the robot’s physical power control now.";
        updateControls();
      });
    }
  }
  updateControls();
});

connectButton.addEventListener("click", async () => {
  if (!preflightComplete() || operationPending || !globalThis.isSecureContext) return;
  operationPending = true;
  connectionMessage.textContent = "Select the Nova S Pro in the browser chooser. Authentication begins only after selection.";
  updateControls();
  try {
    await connection.connect();
    connectionMessage.textContent = "Authenticated and ready. Review the fixed one-ball settings before sending.";
    addDiagnostic("connection.ready");
  } catch (error) {
    if (error?.name === "NotFoundError" && connection.state === "disconnected") {
      connectionMessage.textContent = "Device chooser canceled. No connection or shot was made; Connect is available when you are ready.";
      addDiagnostic("connection.chooser_cancelled");
    } else {
      connectionMessage.textContent = `${error?.message ?? "Connection failed"}. No shot is sent automatically.`;
      addDiagnostic("connection.failed", error?.message ?? "UNKNOWN");
    }
  } finally {
    operationPending = false;
    updateControls();
  }
});

disconnectButton.addEventListener("click", async () => {
  if (!connection.ready || operationPending || stopPending) return;
  operationPending = true;
  updateControls();
  try {
    const result = await executor.stop({ force: true });
    if (result.status !== "SENT") throw new Error("PRIORITY_STOP_NOT_CONFIRMED");
    executor.reset();
    connection.disconnect();
    connectionMessage.textContent = "Priority Stop sent; disconnected.";
    addDiagnostic("connection.disconnected_safely");
  } catch (error) {
    connectionMessage.textContent = `Stop failed (${error?.message ?? "UNKNOWN"}). Keep this page open and use the physical power control.`;
    addDiagnostic("priority_stop.failed", error?.message ?? "UNKNOWN");
  } finally {
    operationPending = false;
    updateControls();
  }
});

fireButton.addEventListener("click", async () => {
  if (!connection.ready || !preflightComplete() || operationPending || shotSentThisConnection) return;
  const confirmed = globalThis.confirm("Send exactly ONE conservative topspin ball? Speed 1, spin 0, height 35, drop 0, 30 BPM, one repetition. Make sure the launch area is clear and you can reach physical power.");
  if (!confirmed) return;
  operationPending = true;
  shotSending = true;
  shotSentThisConnection = true;
  shotMessage.textContent = "Sending one explicitly confirmed ball… Keep Stop and physical power within reach.";
  updateControls();
  try {
    const result = await executor.start(oneBallPacket);
    if (result.status === "CANCELLED") {
      shotMessage.textContent = "The command was canceled by Stop. Verify that the robot is physically stationary; no automatic retry will occur.";
      return;
    }
    if (result.status !== "SENT") throw new Error("BALL_COMMAND_NOT_CONFIRMED");
    shotMessage.textContent = "One-ball command sent. Observe the actual landing; use Stop or physical power if anything is unexpected.";
    addDiagnostic("executor.one_ball_sent");
  } catch (error) {
    shotMessage.textContent = `Ball command failed (${error?.message ?? "UNKNOWN"}). Attempting priority Stop; use physical power if uncertain.`;
    addDiagnostic("executor.one_ball_failed", error?.message ?? "UNKNOWN");
    try { await executor.stop({ force: true }); }
    catch { shotMessage.textContent = "Ball command and priority Stop failed. Use the robot’s physical power control now."; }
  } finally {
    operationPending = false;
    shotSending = false;
    updateControls();
  }
});

stopButton.addEventListener("click", async () => {
  if (!connection.ready || stopPending || (operationPending && !shotSending)) return;
  stopPending = true;
  shotMessage.textContent = "Sending priority Stop…";
  updateControls();
  try {
    const result = await executor.stop({ force: true });
    if (result.status !== "SENT") throw new Error("PRIORITY_STOP_NOT_CONFIRMED");
    shotMessage.textContent = "Priority Stop sent. Verify the robot is physically stationary.";
    addDiagnostic("executor.priority_stop_sent");
  } catch (error) {
    shotMessage.textContent = `Priority Stop failed (${error?.message ?? "UNKNOWN"}). Use the robot’s physical power control now.`;
    addDiagnostic("executor.priority_stop_failed", error?.message ?? "UNKNOWN");
  } finally {
    stopPending = false;
    updateControls();
  }
});

safetyMonitor.arm();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && executor.state === "running") {
    shotMessage.textContent = "App is backgrounding; the safety monitor is requesting priority Stop. Verify the robot physically when you return.";
  } else if (document.visibilityState === "visible" && connection.ready) {
    shotMessage.textContent = "Returned to the app. No automatic resume occurs; verify the robot is stationary before disconnecting.";
  }
});
updateControls();
