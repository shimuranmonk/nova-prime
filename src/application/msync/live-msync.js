import { MsyncSessionController } from "./nova-plus/session.js";
import { MsyncRobotAdapter } from "./nova-plus/robot.js";

// Nova Plus owns choreography; Prime's executor remains the sole transport writer.
export class LiveMsync {
  constructor({ audioPlayer, connection, executor, projection, controller, onDiagnostic = () => {}, onDispatch = () => {}, setTimer, clearTimer }) {
    this.audioPlayer = audioPlayer; this.connection = connection; this.executor = executor;
    this.projection = projection; this.controller = controller; this.onDiagnostic = onDiagnostic;
    this.events = []; this.activations = 0; this.positionMs = 0; this.failed = false; this.finished = false;
    const audio = {
      onEnded: null, onError: null,
      play: async () => { if (audioPlayer.snapshot().state === "paused") return audioPlayer.resume(); await audioPlayer.start([this.track]); return true; },
      pause: () => audioPlayer.pause(), stop: () => audioPlayer.stop(),
      currentTimeMs: () => audioPlayer.currentTimeMs(),
    };
    this.robot = new MsyncRobotAdapter({
      ...(setTimer ? { setTimer, clearTimer } : {}),
      send: async packet => {
        const stopping = packet[0] === 0x80;
        if (!stopping && (this.finished || this.failed)) throw new Error("MSYNC_SESSION_ENDED");
        const result = stopping ? await executor.stop({ force: true }) : await executor.start(packet);
        if (result.status !== "SENT") throw new Error("MSYNC_COMMAND_NOT_SENT");
        if (!stopping) onDispatch(packet);
      },
      subscribeDone: callback => connection.subscribe(event => { if (event?.type === "done") callback(); }),
      isConnected: () => connection.ready,
      onDiagnostic: event => { this.record(event); if (event.type === "ROBOT_ERROR") this.fail(event.message); },
    });
    this.session = new MsyncSessionController({ audio,
      ...(setTimer ? { setTimer, clearTimer } : {}),
      onPosition: position => { this.positionMs = position; if (position - (this.lastPaint ?? -1000) >= 200) { this.lastPaint = position; this.publish(); } },
      onEvent: event => { if (event.type === "ACTIVATE") this.activations++; this.record(event); },
      onRobotEvent: event => this.robot.handleSessionEvent(event),
      onState: ({ state }) => {
        if (state === "PLAYING" && controller.state === "COUNTDOWN") controller.tick(controller.snapshot().countdownRemaining);
        if (state === "COMPLETED" || state === "ERROR") this.finished = true;
        this.publish();
        if (state === "ERROR" && !["IDLE", "ERROR", "COMPLETED"].includes(controller.state)) controller.fail("MSYNC_RUNTIME_FAILED");
      },
    });
    this.unsubscribeAudio = audioPlayer.subscribe(snapshot => {
      if (!this.started || this.finished) return;
      if (snapshot.state === "completed") audio.onEnded?.();
      else if (snapshot.state === "error") audio.onError?.(new Error(snapshot.error));
    });
    this.unsubscribeConnection = connection.subscribe(event => {
      if (this.started && !this.finished && event?.type === "state" && event.snapshot.state === "disconnected") this.fail("ROBOT_DISCONNECTED");
    });
  }
  record(event) { this.events.push({ ...event, positionMs: event.positionMs ?? this.positionMs }); this.events = this.events.slice(-100); this.onDiagnostic(event); this.publish(); }
  publish() {
    if (!this.session || !this.parsed) return;
    const state = this.manualStop ? "stopped" : ({READY:"idle",COUNTDOWN:"countdown",PLAYING:"playing",PAUSED:"paused",COMPLETED:"completed",ERROR:"error"})[this.session.state];
    this.projection.setExternal({state, positionMs:this.positionMs, durationMs:this.parsed.audio.durationMs,
      progress:Math.min(1, this.positionMs / this.parsed.audio.durationMs), active:this.session.active,
      flavor:this.session.flavor, resting:this.session.restUntilMs !== null,
      restUntilMs:this.session.restUntilMs ?? 0, robotLeadMs:Math.round(this.parsed.session.robotLead * 1000),
      events:Object.freeze([...this.events]), activations:this.activations });
  }
  async start(parsed, track, robotLeadSeconds) {
    this.parsed = { ...parsed, session:{ ...parsed.session, robotLead:robotLeadSeconds ?? parsed.session.robotLead } };
    this.track = track; this.started = true; this.robot.configure(this.parsed);
    await this.session.start(this.parsed); this.publish();
  }
  fail(message) {
    if (this.failed || this.finished) return;
    this.failed = true; this.session.fail("MSYNC_RUNTIME_FAILED", new Error(message));
    void this.executor.stop({force:true}).catch(() => {});
  }
  async stop() { this.manualStop = !this.finished; this.finished = true; this.session.stop(); const priority = this.connection.ready ? this.executor.stop({force:true}) : Promise.resolve(); await priority; await this.robot.stopOnly("MANUAL_STOP"); }
  async pause() { const result = this.session.pause(); await this.robot.queue; if (result) this.controller.pause(); return {status:result ? "EXECUTED" : "REJECTED"}; }
  async resume() { const result = await this.session.resume(); await this.robot.queue; if (result) this.controller.resume(); return {status:result ? "EXECUTED" : "REJECTED"}; }
  async destroy() { await this.stop(); this.unsubscribeAudio?.(); this.unsubscribeConnection?.(); this.robot.unsubscribeDone?.(); }
}
