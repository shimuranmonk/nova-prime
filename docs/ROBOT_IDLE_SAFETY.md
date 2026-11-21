# Robot inactivity and Stop safety candidate

Date: 2026-11-21 (Asia/Manila). Branch: `fix/robot-idle-safety`. Version: `0.19.1-robot-safety.0`.

## Why this branch exists

The maintainer reported a robot warmer than expected after a short training/Stop followed by leaving it connected, and a battery indication falling from 83% to 55%. Elapsed time and physical current were not measured. The main audit found no subsequent writes after a successful short Reps Stop over 30 virtual minutes, but did reproduce eight failing scenarios and seven software/hardware protection gaps. The temperature/battery cause is not established.

The original worktree is preserved. Main and hosted Pages are unchanged. Fixes are split into priority failures first and follow-up protections second. No new motor/standby protocol is invented.

## Resulting behavior

| Trigger | Candidate behavior | Regression coverage |
|---|---|---|
| Music decoder/next-track/resume error | Stop requested; session fails; no further programs | Runtime playback/playlist/resume cases |
| Music or MSYNC position does not advance | Error after 5 seconds of loading/playing/resuming without progress; Stop requested | Virtual stalled playback and recovery cases |
| Stop/disconnect/background during async source selection or validation | Preparation token invalidated; late work cannot start a session | Delayed Music/MSYNC preparation |
| Start while Stop/Pause is writing | Start rejected; Stop supersedes Pause | Executor races |
| Disconnect/reconnect with queued writes | Old generation/characteristic rejected | Transport reconnect case |
| Bluetooth write timeout | Close transport; invalidate queued work and report disconnect | Transport timeout case |
| GATT connects after timeout | Close the late connection | Late GATT case |
| Connect/authenticate | Write initial Stop before connection handler finishes | Runtime connection fixture |
| Connected idle, completed, error, or paused for 2 minutes | Stop then disconnect; no automatic reconnect/resume | Idle and paused deadline cases |
| Active progressing training | Idle disconnect is suspended | Music progress case |
| Reps/Time DONE missing | Estimated command duration plus allowance expires; Stop and fail without fabricating completion | Reps/Time deadline cases |
| DONE arrives during Pause or implausibly soon after new run | Ignore as completion | Pause/resume acknowledgement cases |
| MSYNC ONCE DONE | Explicit Stop; no repeat | Adapter and runtime ONCE cases |
| MSYNC DONE missing | Stop and fail; do not repeat an unconfirmed batch | Adapter completion deadline |
| Stop acknowledgement missing while replacing active MSYNC batch | Fail instead of sending replacement | Adapter Stop-ack timeout |
| Both Stop writes fail | Close connection; report failure and physical-power instruction | Executor/runtime failure cases |
| Background/page exit | Best-effort Stop and disconnect; never automatic resume | Lifecycle/runtime cases |
| Stop reported written | Explicitly mark motor power unknown; preserve visible failure messages on focused screen | Executor confirmation and runtime feedback |

Reps completion estimate uses encoded repetitions, frequency and cycle count. Time uses encoded seconds. The allowance is the greater of 5 seconds or 20% of expected duration, plus configured cycle pauses. Pause cancels that deadline; Resume arms a fresh one for the remaining command. A short minimum-duration guard rejects early DONE notifications but cannot authenticate a completion against a firmware sequence ID, because none is established by this protocol.

## Verification and physical limits

203 automated tests passed. Runtime tests operate unmodified production components against fake browser/Bluetooth/audio surfaces and virtual time; the fixture mirrors bootstrap audio reactions. The 66-file production build/module verification passed. Browser startup showed no console errors, and disconnected Start visibly displayed connection guidance. No robot connection was attempted in that browser check. No robot was connected by the development agent.

A successful BLE write does not establish that firmware consumed Stop, that motors have stopped drawing current, or that the robot is cool. `RobotExecutor` exposes `confirmation: write-only` and `motorPower: unknown`. The two-minute policy is an application inactivity timeout, not a claim about the manufacturer's sleep timing. It cannot switch off physical power. Bluetooth loss or browser termination does not guarantee a Stop reaches firmware. Firmware standby, motor power, thermal response and battery decline remain physical verification items.

The fail-closed MSYNC completion and Stop-ack timeout policy intentionally differs from Nova Plus's previous retry-on-timeout behavior. Firmware which does not provide the expected notifications will now stop with an error and needs observation/review, rather than silently continuing. A protocol DONE notification still does not measure motor current.

## Required hardware retests (all pending)

| Check | Expected observation |
|---|---|
| Connect only, wait two minutes | Initial Stop; later disconnect; no ball launched |
| Short drill then manual Stop | Robot stops; no delayed firing; disconnect after two inactive minutes |
| Normal Reps/Time completion | Completion accepted, Stop sent, no surprise timeout |
| Pause/Resume and delayed notification | No unexpected completion/restart; remaining command behaves correctly |
| Music end, error and stalled playback | Stop on each termination/error, no ongoing ball feed |
| MSYNC repeats, REST, ONCE, IDLE, replacement and Stop | Correct cues; no unconfirmed fallback repeat |
| Screen lock, app switch and browser closure | Confirm physical stop/disconnect, no foreground restart |
| Stop write failure or power/link loss | Visible failure; operator can cut physical power |
| Temperature/battery baseline | Record elapsed time, battery level and external temperature for disconnected powered-on versus connected/stopped states, without opening the robot |
| Motor shutdown/firmware standby | Confirm actual motor behavior/current through supported external observation; app state alone is insufficient |

Keep physical power available and switch off an unusually warm idle robot. This branch is not a completed physical release gate or proof that the reported battery drain has been cured. IndexedDB stores, names and schema versions are unchanged.
